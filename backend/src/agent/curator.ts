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

const STATE_FILE = path.resolve(__dirname, "../../data/curator_state.json");

interface CuratorState {
  lastRunAt: number | null;
  lastRunSummary: string;
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
        };
      }
    }
  } catch (err) {
    console.warn(`[curator] failed to load state: ${(err as any)?.message ?? err}`);
  }
  return { lastRunAt: null, lastRunSummary: "" };
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

/** Test-only escape hatch to clear persisted state. */
export function _resetCuratorStateForTests(): void {
  try { if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE); } catch { /* ignore */ }
}
