/**
 * Skill-library curator — periodic, pure-FSM lifecycle maintenance.
 *
 * Ported from Hermes' `agent/curator.py::apply_automatic_transitions`. As the
 * background-review loop creates skills over time, the library accumulates.
 * Without maintenance it would bloat the system-prompt index with one-off
 * skills the agent never reuses. The curator keeps it healthy with a
 * deterministic, NO-LLM finite-state machine:
 *
 *   active  --(idle > staleAfterDays)-->        stale
 *   stale   --(idle > archiveAfterDays)-->      archived   (drops from index)
 *   stale   --(used again)-->                   active     (handled in skill-usage)
 *   any     --(pinned)-->                       untouched
 *
 * It NEVER deletes — archiving is recoverable (the SKILL.md stays on disk;
 * archived skills just don't appear in `getSkillIndexText()`). Only
 * agent-created skills are eligible; bundled/human skills are never touched.
 *
 * Triggering is inactivity-based (no cron needed): `maybeRunCurator()` is
 * called opportunistically (e.g. at boot and after each background review)
 * and runs at most once per `intervalHours`. First run is seed-and-defer:
 * we record "now" and wait a full interval before the first real pass, so a
 * fresh install doesn't immediately churn brand-new skills.
 */

import * as fs from "fs";
import * as path from "path";
import { agentCreatedReport, setState, SkillUsageRecord } from "../skill-usage";
import { auxLLM } from "./llm";
import { contentToText, extractJsonObject } from "./helpers";
import { listSkills, getSkillByName, updateSkill, deleteSkill } from "../skills";
import { redactSecrets } from "../security";

const STATE_FILE = path.resolve(__dirname, "../../data/curator_state.json");

interface CuratorState {
  lastRunAt: number | null;
  lastRunSummary: string;
  /** Independent cadence for the opt-in LLM consolidation pass. */
  lastConsolidationAt?: number | null;
}

function num(envName: string, def: number, min: number, max: number): number {
  const parsed = Number(process.env[envName]);
  if (!Number.isFinite(parsed)) return def;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function intervalHours(): number { return num("CURATOR_INTERVAL_HOURS", 24, 1, 24 * 30); }
function staleAfterDays(): number { return num("CURATOR_STALE_AFTER_DAYS", 14, 1, 365); }
function archiveAfterDays(): number { return num("CURATOR_ARCHIVE_AFTER_DAYS", 45, 2, 730); }

function curatorEnabled(): boolean {
  const raw = (process.env.CURATOR_ENABLED ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  return true;
}

function loadState(): CuratorState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      if (parsed && typeof parsed === "object") {
        return {
          lastRunAt: typeof parsed.lastRunAt === "number" ? parsed.lastRunAt : null,
          lastRunSummary: typeof parsed.lastRunSummary === "string" ? parsed.lastRunSummary : "",
          lastConsolidationAt: typeof parsed.lastConsolidationAt === "number" ? parsed.lastConsolidationAt : null,
        };
      }
    }
  } catch (err) {
    console.warn(`[curator] failed to load state: ${(err as any)?.message ?? err}`);
  }
  return { lastRunAt: null, lastRunSummary: "", lastConsolidationAt: null };
}

function saveState(state: CuratorState): void {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    console.warn(`[curator] failed to save state: ${(err as any)?.message ?? err}`);
  }
}

export interface CuratorCounts {
  checked: number;
  markedStale: number;
  archived: number;
  reactivated: number;
}

/**
 * Pure lifecycle FSM over agent-created skills. Returns a counter of what
 * changed. Reactivation (stale → active on re-use) happens in `skill-usage`
 * at view time; here we only count records already flipped back to active
 * that were previously stale-eligible (informational).
 */
export function applyAutomaticTransitions(now: number = Date.now()): CuratorCounts {
  const counts: CuratorCounts = { checked: 0, markedStale: 0, archived: 0, reactivated: 0 };
  const staleCutoff = now - staleAfterDays() * 24 * 60 * 60 * 1000;
  const archiveCutoff = now - archiveAfterDays() * 24 * 60 * 60 * 1000;

  for (const rec of agentCreatedReport()) {
    counts.checked += 1;
    if (rec.pinned) continue;

    const anchor = rec.lastActivityAt || rec.createdAt || now;
    const current: SkillUsageRecord["state"] = rec.state;

    if (anchor <= archiveCutoff && current !== "archived") {
      setState(rec.name, "archived");
      counts.archived += 1;
    } else if (anchor <= staleCutoff && current === "active") {
      setState(rec.name, "stale");
      counts.markedStale += 1;
    }
  }

  return counts;
}

/**
 * Inactivity-gated runner. Runs `applyAutomaticTransitions` at most once per
 * interval. First observation seeds `lastRunAt` and defers (returns null).
 * Fire-and-forget safe — never throws.
 */
export function maybeRunCurator(now: number = Date.now()): CuratorCounts | null {
  try {
    if (!curatorEnabled()) return null;
    const state = loadState();

    if (state.lastRunAt == null) {
      // Seed-and-defer: wait one full interval before the first real pass.
      saveState({ lastRunAt: now, lastRunSummary: "seeded — first pass deferred one interval" });
      return null;
    }

    const elapsed = now - state.lastRunAt;
    if (elapsed < intervalHours() * 60 * 60 * 1000) return null;

    const counts = applyAutomaticTransitions(now);
    saveState({
      lastRunAt: now,
      lastRunSummary: `checked ${counts.checked}, stale +${counts.markedStale}, archived +${counts.archived}`,
    });
    if (counts.markedStale > 0 || counts.archived > 0) {
      console.log(`[curator] lifecycle pass: ${counts.markedStale} stale, ${counts.archived} archived (of ${counts.checked} agent skills).`);
    }
    return counts;
  } catch (err: any) {
    console.warn(`[curator] run failed: ${err?.message ?? err}`);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// LLM CONSOLIDATION PASS (opt-in) — merge overlapping skills into umbrellas
// ────────────────────────────────────────────────────────────────────────────
//
// The FSM above only retires unused skills. It can't notice that three
// narrowly-scoped skills are really the same workflow that should be ONE
// umbrella skill. Hermes does that with an LLM review pass; Candle mirrors the
// background-review shape: a single auxLLM call returns a typed JSON plan we
// validate against guardrails and apply deterministically (no tool loop, so it
// can't go rogue). Off by default — set CURATOR_CONSOLIDATE=1 to enable.

function consolidateEnabled(): boolean {
  const raw = (process.env.CURATOR_CONSOLIDATE ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

function consolidationIntervalHours(): number {
  return num("CURATOR_CONSOLIDATE_INTERVAL_HOURS", 72, 1, 24 * 60);
}

export interface ConsolidationMerge {
  into: string;
  absorb: string[];
  description?: string;
  body?: string;
}

export interface ConsolidationCounts {
  merges: number;
  absorbed: number;
}

const NAME_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

function buildConsolidationPrompt(skills: { name: string; description: string }[]): string {
  const list = skills.map((s) => `- ${s.name}: ${s.description}`).join("\n");
  return (
    "You are a SKILL-LIBRARY CURATOR for an autonomous agent named Candle. " +
    "Below is the list of AGENT-CREATED skills (procedural workflows). Over time the agent " +
    "creates narrow, overlapping skills that are really the SAME class of task. Your job is to " +
    "identify clusters that should be merged into a single class-level UMBRELLA skill.\n\n" +
    `AGENT-CREATED SKILLS:\n${list}\n\n` +
    "RULES:\n" +
    "- Only merge skills that are genuinely the same KIND of task (e.g. 'merge-2-pdfs' + 'combine-pdf-files' → 'pdf-merge-workflow').\n" +
    "- Do NOT merge skills that are merely adjacent (e.g. 'pdf-merge' and 'pdf-split' stay separate).\n" +
    "- The umbrella `into` may be one of the existing names (preferred) or a new class-level kebab-case name.\n" +
    "- `absorb` lists the OTHER existing skill names folded into the umbrella; never include `into` in its own `absorb`.\n" +
    "- Provide a merged `description` (<=200 chars) and `body` (full Markdown workflow covering all absorbed cases).\n" +
    "- Be conservative. If nothing should merge, return an empty list. Most libraries need no merges.\n\n" +
    "OUTPUT — return ONLY a JSON object, no prose, no code fences:\n" +
    '{ "merges": [ { "into": "kebab-case", "absorb": ["name-a","name-b"], "description": "<=200 chars", "body": "full Markdown workflow" } ] }\n' +
    'If nothing should merge, return {"merges": []}.'
  );
}

export function validateConsolidationPlan(
  raw: any,
  eligible: Set<string>,
  pinned: Set<string>
): ConsolidationMerge[] {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.merges)) return [];
  const out: ConsolidationMerge[] = [];
  const claimed = new Set<string>();

  for (const m of raw.merges.slice(0, 10)) {
    if (!m || typeof m !== "object") continue;
    const into = String(m.into ?? "").trim().toLowerCase();
    if (!NAME_RE.test(into)) continue;

    const absorb = Array.isArray(m.absorb)
      ? Array.from(
          new Set(
            m.absorb
              .map((a: any) => String(a).trim().toLowerCase())
              .filter((a: string) => NAME_RE.test(a) && a !== into)
          )
        )
      : [];

    // Every absorbed skill must be an existing, eligible (agent-created),
    // non-pinned skill we haven't already claimed in another merge.
    const validAbsorb = (absorb as string[]).filter(
      (a) => eligible.has(a) && !pinned.has(a) && !claimed.has(a)
    );
    if (validAbsorb.length === 0) continue;

    // The umbrella itself, if it's an existing skill, must not be pinned.
    if (eligible.has(into) && pinned.has(into)) continue;
    // Creating a brand-new umbrella requires a body + description.
    const intoExists = eligible.has(into);
    const description = m.description ? String(m.description).trim().slice(0, 200) : undefined;
    const body = m.body ? String(m.body).trim().slice(0, 16_000) : undefined;
    if (!intoExists && (!description || !body)) continue;

    for (const a of validAbsorb) claimed.add(a);
    claimed.add(into);
    out.push({ into, absorb: validAbsorb, description, body });
  }
  return out;
}

/**
 * Opt-in LLM consolidation. Inactivity-gated on its own (longer) cadence so it
 * never runs on every review. Fire-and-forget safe — never throws.
 */
export async function maybeRunCuratorConsolidation(
  now: number = Date.now()
): Promise<ConsolidationCounts | null> {
  try {
    if (!curatorEnabled() || !consolidateEnabled()) return null;

    const state = loadState();
    if (state.lastConsolidationAt == null) {
      saveState({ ...state, lastConsolidationAt: now });
      return null;
    }
    if (now - state.lastConsolidationAt < consolidationIntervalHours() * 60 * 60 * 1000) {
      return null;
    }

    const records = agentCreatedReport();
    const eligible = new Set(records.map((r) => r.name));
    const pinned = new Set(records.filter((r) => r.pinned).map((r) => r.name));

    // Only consider non-archived, non-pinned agent skills as merge inputs.
    const candidates = listSkills().filter(
      (s) => eligible.has(s.name) && !pinned.has(s.name)
    );
    // Nothing to consolidate below 3 skills — not worth an LLM call.
    if (candidates.length < 3) {
      saveState({ ...state, lastConsolidationAt: now });
      return { merges: 0, absorbed: 0 };
    }

    const prompt = buildConsolidationPrompt(
      candidates.map((s) => ({ name: s.name, description: s.description }))
    );
    const response = await auxLLM.invoke([{ role: "user", content: prompt }], {
      tags: ["candle-internal"],
    });
    const plan = validateConsolidationPlan(
      extractJsonObject(contentToText(response.content)),
      eligible,
      pinned
    );

    let merges = 0;
    let absorbed = 0;
    for (const m of plan) {
      try {
        const intoExists = getSkillByName(m.into);
        if (intoExists) {
          if (m.description || m.body) {
            updateSkill({ name: m.into, description: m.description, body: m.body });
          }
        } else {
          // Build the umbrella from one of the absorbed skill bodies as a base
          // if the model didn't give one — but validation already requires a
          // body for new umbrellas, so m.body is present here.
          updateSkill({ name: m.into, description: m.description, body: m.body });
        }
        for (const name of m.absorb) {
          // Never delete the umbrella itself.
          if (name === m.into) continue;
          deleteSkill(name); // also forgets the usage record
          absorbed += 1;
        }
        merges += 1;
      } catch (err: any) {
        console.warn(`[curator] consolidation merge into "${m.into}" failed: ${redactSecrets(String(err?.message ?? err))}`);
      }
    }

    saveState({
      lastRunAt: state.lastRunAt,
      lastRunSummary: state.lastRunSummary,
      lastConsolidationAt: now,
    });
    if (merges > 0) {
      console.log(`[curator] consolidation pass: ${merges} merge(s), ${absorbed} skill(s) absorbed.`);
    }
    return { merges, absorbed };
  } catch (err: any) {
    console.warn(`[curator] consolidation failed: ${redactSecrets(String(err?.message ?? err))}`);
    return null;
  }
}

/** Test-only escape hatch to clear persisted state. */
export function _resetCuratorStateForTests(): void {
  try { if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE); } catch { /* ignore */ }
}
