/**
 * Proactive user-model synthesis.
 *
 * The background-review pass ([[background-review]]) accumulates scattered
 * `user_preference` / `project_fact` entries one at a time. Over many sessions
 * the model ends up with a pile of disconnected facts ("prefers Burmese",
 * "uses Candle", "wants terse replies") but no coherent picture of WHO the user
 * is. Hermes' Honcho integration solves this with a dialectic user model; we
 * replicate the portable core WITHOUT any external service: an inactivity-gated
 * LLM pass that distills the raw facts into ONE paragraph stored under
 * `USER_PROFILE_KEY`, which `memoryStore.getSummary()` surfaces first.
 *
 * Same shape as the curator: cheap, fire-and-forget, never throws, runs at most
 * once per interval. Off by default unless there are enough facts to be worth
 * synthesizing. Opt out with MEMORY_SYNTHESIS_ENABLED=0.
 */

import * as fs from "fs";
import * as path from "path";
import { auxLLM } from "./llm";
import { contentToText } from "./helpers";
import { memoryStore, USER_PROFILE_KEY } from "./memory";
import { redactSecrets } from "../security";

const STATE_FILE = path.resolve(__dirname, "../../data/memory_synthesis_state.json");

interface SynthesisState {
  lastRunAt: number | null;
}

function num(envName: string, def: number, min: number, max: number): number {
  const parsed = Number(process.env[envName]);
  if (!Number.isFinite(parsed)) return def;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function synthesisEnabled(): boolean {
  const raw = (process.env.MEMORY_SYNTHESIS_ENABLED ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  return true;
}

function intervalHours(): number { return num("MEMORY_SYNTHESIS_INTERVAL_HOURS", 12, 1, 24 * 30); }
/** Don't bother synthesizing until there are at least this many raw facts. */
function minFacts(): number { return num("MEMORY_SYNTHESIS_MIN_FACTS", 4, 2, 100); }

function loadState(): SynthesisState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      if (parsed && typeof parsed === "object") {
        return { lastRunAt: typeof parsed.lastRunAt === "number" ? parsed.lastRunAt : null };
      }
    }
  } catch (err) {
    console.warn(`[memory-synthesis] failed to load state: ${(err as any)?.message ?? err}`);
  }
  return { lastRunAt: null };
}

function saveState(state: SynthesisState): void {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    console.warn(`[memory-synthesis] failed to save state: ${(err as any)?.message ?? err}`);
  }
}

function buildSynthesisPrompt(facts: { category: string; key: string; value: string }[], priorProfile: string): string {
  const factList = facts.map((f) => `- [${f.category}] ${f.key}: ${f.value}`).join("\n");
  return (
    "You maintain the USER PROFILE for an autonomous agent named Candle. Below are the raw, " +
    "individually-recorded facts about the user, plus the previous profile paragraph (if any). " +
    "Distill them into ONE coherent paragraph (3-6 sentences) describing who this user is and how " +
    "to work with them: their role/expertise, communication preferences, recurring goals, and any " +
    "stable working style. Write it as a briefing for yourself at the start of a new session.\n\n" +
    (priorProfile ? `PREVIOUS PROFILE:\n"""${priorProfile}"""\n\n` : "") +
    `RAW FACTS:\n${factList}\n\n` +
    "RULES:\n" +
    "- Synthesize, don't list. Merge related facts; drop noise and one-off task details.\n" +
    "- Keep only STABLE traits — things true across sessions, not today's task.\n" +
    "- Never include secrets (keys, tokens, passwords).\n" +
    "- Output ONLY the paragraph — no preamble, no headings, no bullet points."
  );
}

/**
 * Inactivity-gated synthesis. Runs `applySynthesis` at most once per interval.
 * First observation seeds `lastRunAt` and defers. Fire-and-forget safe.
 */
export async function maybeSynthesizeUserModel(now: number = Date.now()): Promise<boolean> {
  try {
    if (!synthesisEnabled()) return false;

    const state = loadState();
    if (state.lastRunAt == null) {
      saveState({ lastRunAt: now });
      return false;
    }
    if (now - state.lastRunAt < intervalHours() * 60 * 60 * 1000) return false;

    // Only synthesize from durable identity facts — not learned_pattern /
    // tool_usage, which describe the agent's tricks, not the user.
    const facts = memoryStore
      .listAll()
      .filter((e) => e.key !== USER_PROFILE_KEY && (e.category === "user_preference" || e.category === "project_fact"))
      .map((e) => ({ category: e.category, key: e.key, value: e.value }));

    if (facts.length < minFacts()) {
      saveState({ lastRunAt: now });
      return false;
    }

    const prior = memoryStore.listAll().find((e) => e.key === USER_PROFILE_KEY)?.value ?? "";
    const prompt = buildSynthesisPrompt(facts, prior);
    const response = await auxLLM.invoke([{ role: "user", content: prompt }], { tags: ["candle-internal"] });
    const profile = contentToText(response.content).trim();

    saveState({ lastRunAt: now });

    if (!profile || profile.length < 20) return false;

    // Store under the reserved key (overwrites the prior profile). Capped well
    // under the 2000-char store limit; a profile longer than that is a sign the
    // model listed instead of synthesized, so clamp.
    memoryStore.store(USER_PROFILE_KEY, profile.slice(0, 1500), "user_preference", ["profile", "synthesized"]);
    console.log(`[memory-synthesis] refreshed user profile from ${facts.length} facts (${profile.length} chars).`);
    return true;
  } catch (err: any) {
    console.warn(`[memory-synthesis] failed: ${redactSecrets(String(err?.message ?? err))}`);
    return false;
  }
}

/** Test-only escape hatch to clear persisted state. */
export function _resetSynthesisStateForTests(): void {
  try { if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE); } catch { /* ignore */ }
}
