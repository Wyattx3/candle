/**
 * Post-turn background review — closed-loop learning, fine-grained tier.
 *
 * Ported and adapted from Hermes' `agent/background_review.py`. After a
 * substantive turn finishes, a fire-and-forget LLM pass reviews the
 * just-completed exchange and decides whether to:
 *   (a) save a durable user fact / preference to long-term memory, and/or
 *   (b) create or update a SKILL capturing a reusable, class-level technique.
 *
 * Design decisions (why this shape):
 *  - **Never blocks the reply.** Runs AFTER the answer is delivered, exactly
 *    like `title-generator.ts`. The user never waits on it.
 *  - **Gated.** Only fires when there's real learning signal — the turn used
 *    enough tools, OR the user expressed a correction / preference /
 *    frustration. Trivial turns are skipped so we don't burn tokens.
 *  - **Structured JSON, not a tool loop.** Hermes forks a whole sub-agent
 *    with a tool whitelist. Candle does a single LLM call that returns a
 *    typed JSON plan, which we validate against do-NOT-capture guardrails and
 *    then apply deterministically. Cheaper, fully testable, and it can't go
 *    rogue calling arbitrary tools.
 *  - **Do-NOT-capture guardrails.** Ported from Hermes' review prompts:
 *    don't persist environment-dependent failures, negative tool claims,
 *    transient errors, or one-off task narratives — those harden into
 *    self-imposed constraints that bite later.
 */

import { contentToText, extractJsonObject } from "./helpers";
import { auxLLM } from "./llm";

// Re-exported for back-compat: this helper moved to ./helpers so curator.ts can
// share it without a circular import. Existing importers still reach it here.
export { extractJsonObject };
import { memoryStore, MemoryEntry } from "./memory";
import { createSkill, getSkillByName, listSkills, updateSkill } from "../skills";
import { redactSecrets } from "../security";
import { maybeRunCurator, maybeRunCuratorConsolidation } from "./curator";
import { maybeSynthesizeUserModel } from "./memory-synthesis";

// ────────────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────────────

function reviewEnabled(): boolean {
  // Default ON. Set BACKGROUND_REVIEW_ENABLED=0/false to disable.
  const raw = (process.env.BACKGROUND_REVIEW_ENABLED ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return false;
  return true;
}

function minReviewToolCalls(): number {
  const parsed = Number(process.env.BACKGROUND_REVIEW_MIN_TOOL_CALLS);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(1, Math.min(40, Math.floor(parsed)));
}

/** User-message signals that warrant a review even on a low-tool turn. */
const CORRECTION_SIGNALS: RegExp[] = [
  /\b(stop|don't|do not|never|quit|cease)\s+(doing|saying|using|writing|formatting|format|explaining|explain)/i,
  /\b(too\s+(verbose|long|short|wordy|brief)|just give me|why are you|you always|you keep|i hate|stop being)\b/i,
  /\b(remember|note that|keep in mind|from now on|going forward|in future|next time)\b/i,
  /\b(i prefer|i'd prefer|i would prefer|i want you to|i'd like you to|please always|please use|please stop|always use|always do)\b/i,
  /\b(call me|my name is|i am called|my project|my repo|my account|my email|my preference)\b/i,
  /\b(that's wrong|that is wrong|incorrect|not what i|you misunderstood|you got it wrong|wrong answer)\b/i,
  /\b(actually|instead|rather)\b.{0,40}\b(want|need|prefer|should)\b/i,
];

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface ReviewMemoryItem {
  key: string;
  value: string;
  category: MemoryEntry["category"];
}

export interface ReviewSkillItem {
  action: "create" | "update";
  name: string;
  description?: string;
  body?: string;
  tags?: string[];
}

export interface ReviewPlan {
  memory: ReviewMemoryItem[];
  skill: ReviewSkillItem | null;
}

export interface ReviewAction {
  kind: "memory" | "skill";
  detail: string;
}

export interface BackgroundReviewInput {
  prompt: string;
  response: string;
  /** Tool names invoked during the turn (for skill-signal gating + context). */
  toolsUsed: string[];
  /** Optional callback fired for each persisted action (UI surfacing). */
  onAction?: (action: ReviewAction) => void;
}

// ────────────────────────────────────────────────────────────────────────────
// Gating
// ────────────────────────────────────────────────────────────────────────────

export function shouldReview(input: { prompt: string; response: string; toolsUsed: string[] }): boolean {
  if (!reviewEnabled()) return false;
  if (!input.response.trim()) return false; // nothing produced → nothing to learn

  // Don't learn from a degraded answer. When the agent runs out of budget
  // mid-task it can emit a bare planning preamble ("Plan: 1) ... Let me
  // search...") instead of a real deliverable. Capturing a skill/memory from
  // that teaches the wrong lesson, so skip review for plan/promise-only text.
  if (isPlanPreambleOnly(input.response)) return false;

  const substantiveTools = input.toolsUsed.filter(
    (t) => t !== "search_memory" && t !== "skill_view" && t !== "todo"
  );
  if (substantiveTools.length >= minReviewToolCalls()) return true;

  // Low-tool turn — only review if the user gave an explicit correction or
  // stated a durable preference.
  return CORRECTION_SIGNALS.some((re) => re.test(input.prompt));
}

/**
 * Heuristic: is this assistant text just a plan / statement of future intent
 * with no actual delivered result? Such "Plan: ... Let me search..." text
 * appears when a run is cut short (budget exhausted, critic re-run with no
 * headroom) and must NOT be treated as a successful trajectory to learn from.
 */
export function isPlanPreambleOnly(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  // Starts with a "Plan:" block and is short / ends on a promise to act.
  const startsWithPlan = /^plan\s*:/i.test(t) || /^here('|i)s (my|the) plan/i.test(t);
  const endsWithPromise = /\b(let me|i('| wi)ll|i'm going to|i will now)\b[^.]*$/i.test(t.slice(-160));
  if (startsWithPlan && (endsWithPromise || t.length < 400)) return true;
  return false;
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt
// ────────────────────────────────────────────────────────────────────────────

function buildReviewPrompt(input: BackgroundReviewInput): string {
  const existingSkills = listSkills()
    .map((s) => `- ${s.name}: ${s.description}`)
    .join("\n") || "(none yet)";

  const prompt = redactSecrets(input.prompt).slice(0, 2_000);
  const response = redactSecrets(input.response).slice(0, 3_000);
  const tools = input.toolsUsed.join(", ") || "(none)";

  return (
    "You are a SELF-IMPROVEMENT REVIEWER for an autonomous agent named Candle. " +
    "Review the exchange below and decide what — if anything — is worth persisting so future sessions start smarter. " +
    "Be selective. Most turns produce nothing; that is fine.\n\n" +
    `USER MESSAGE:\n"""${prompt}"""\n\n` +
    `AGENT FINAL ANSWER:\n"""${response}"""\n\n` +
    `TOOLS USED THIS TURN: ${tools}\n\n` +
    `EXISTING SKILLS:\n${existingSkills}\n\n` +
    "DECIDE TWO THINGS:\n\n" +
    "1. MEMORY — durable facts about WHO THE USER IS or how they want you to behave:\n" +
    "   - user_preference: communication style, language, default tools, opt-in/out choices.\n" +
    "   - project_fact: repo paths, API endpoints, account ids they work with.\n" +
    "   - learned_pattern / tool_usage: a non-obvious heuristic or tool argument that worked.\n\n" +
    "2. SKILL — a CLASS-LEVEL reusable workflow (how to do this kind of task):\n" +
    "   - If an EXISTING skill above covers this territory, prefer action=update on THAT skill.\n" +
    "   - Only action=create when no existing skill fits. Name MUST be class-level kebab-case " +
    "(e.g. 'pdf-merge-workflow'), NOT a one-off ('fix-todays-bug').\n\n" +
    "DO NOT CAPTURE (these become self-imposed constraints that bite later):\n" +
    "- Environment-dependent failures: missing binaries, fresh-install errors, 'command not found', unconfigured credentials.\n" +
    "- Negative claims about tools ('browser tool is broken', 'X does not work'). They harden into refusals.\n" +
    "- Transient errors that resolved before the turn ended. If a retry worked, the lesson is the retry pattern, not the failure.\n" +
    "- One-off task narratives ('summarized today's market'). Not a class of work.\n" +
    "- Anything sensitive: API keys, passwords, OTPs, tokens, full card numbers.\n\n" +
    "OUTPUT — return ONLY a JSON object, no prose, no code fences:\n" +
    "{\n" +
    '  "memory": [ { "key": "snake_case_id", "value": "the fact", "category": "user_preference|project_fact|learned_pattern|tool_usage" } ],\n' +
    '  "skill": { "action": "create|update", "name": "kebab-case", "description": "<=200 chars one line", "body": "full Markdown workflow with concrete steps", "tags": ["t1","t2"] }\n' +
    "}\n\n" +
    "Rules: omit `memory` (or use []) when nothing durable. Set `skill` to null when no skill is warranted. " +
    "If nothing at all is worth saving, return {\"memory\": [], \"skill\": null}."
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Validation
// ────────────────────────────────────────────────────────────────────────────

const VALID_CATEGORIES: MemoryEntry["category"][] = [
  "user_preference",
  "project_fact",
  "learned_pattern",
  "tool_usage",
];

const SENSITIVE_KEY_RE = /\b(api[_-]?key|password|passwd|secret|token|otp|cvv|card[_-]?number|private[_-]?key)\b/i;

/**
 * Facts the agent should NOT persist because they're already handled
 * elsewhere or are noise. Output language is auto-matched by the OUTPUT
 * FORMAT prompt rule, so storing "user speaks X" just clutters memory and
 * produced duplicate entries (preferred_language_* AND user_language) in
 * practice.
 */
const NOISE_MEMORY_RE = /\b(language|lang|locale|speaks?|burmese|myanmar|english|tongue)\b/i;

export function validateReviewPlan(raw: any): ReviewPlan {
  const plan: ReviewPlan = { memory: [], skill: null };
  if (!raw || typeof raw !== "object") return plan;

  // Memory items
  const memArr = Array.isArray(raw.memory) ? raw.memory : [];
  const seenKeys = new Set<string>();
  for (const item of memArr.slice(0, 4)) {
    if (!item || typeof item !== "object") continue;
    const key = String(item.key ?? "").trim().slice(0, 80);
    const value = String(item.value ?? "").trim().slice(0, 2000);
    const category = VALID_CATEGORIES.includes(item.category) ? item.category : "project_fact";
    if (!key || !value) continue;
    // Drop anything that looks secret-bearing in the key or value.
    if (SENSITIVE_KEY_RE.test(key) || SENSITIVE_KEY_RE.test(value)) continue;
    // Drop language/locale facts — output language is auto-matched by the
    // prompt, so these are noise and tend to duplicate (preferred_language_*
    // + user_language for the same fact).
    if (NOISE_MEMORY_RE.test(key) || NOISE_MEMORY_RE.test(value)) continue;
    // De-duplicate within a single plan (case-insensitive key).
    const dedupeKey = key.toLowerCase();
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);
    plan.memory.push({ key, value, category });
  }

  // Skill item
  const sk = raw.skill;
  if (sk && typeof sk === "object" && (sk.action === "create" || sk.action === "update")) {
    const name = String(sk.name ?? "").trim().toLowerCase();
    if (/^[a-z0-9][a-z0-9-]{1,62}$/.test(name)) {
      plan.skill = {
        action: sk.action,
        name,
        description: sk.description ? String(sk.description).trim().slice(0, 200) : undefined,
        body: sk.body ? String(sk.body).trim().slice(0, 16_000) : undefined,
        tags: Array.isArray(sk.tags) ? sk.tags.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 8) : undefined,
      };
    }
  }

  return plan;
}

// ────────────────────────────────────────────────────────────────────────────
// Apply
// ────────────────────────────────────────────────────────────────────────────

export function applyReviewPlan(plan: ReviewPlan, onAction?: (a: ReviewAction) => void): ReviewAction[] {
  const actions: ReviewAction[] = [];

  for (const mem of plan.memory) {
    try {
      memoryStore.store(mem.key, mem.value, mem.category, []);
      const action: ReviewAction = { kind: "memory", detail: `Remembered: ${mem.key}` };
      actions.push(action);
      onAction?.(action);
    } catch (err: any) {
      console.warn(`[review] memory store failed for "${mem.key}": ${err?.message ?? err}`);
    }
  }

  if (plan.skill) {
    try {
      const exists = getSkillByName(plan.skill.name);
      if (plan.skill.action === "update" || exists) {
        if (exists) {
          updateSkill({
            name: plan.skill.name,
            description: plan.skill.description,
            body: plan.skill.body,
            tags: plan.skill.tags,
          });
          const action: ReviewAction = { kind: "skill", detail: `Skill updated: ${plan.skill.name}` };
          actions.push(action);
          onAction?.(action);
        } else if (plan.skill.description && plan.skill.body) {
          // Asked to update something that doesn't exist → treat as create.
          createSkill({
            name: plan.skill.name,
            description: plan.skill.description,
            body: plan.skill.body,
            tags: plan.skill.tags ?? [],
          });
          const action: ReviewAction = { kind: "skill", detail: `Skill created: ${plan.skill.name}` };
          actions.push(action);
          onAction?.(action);
        }
      } else if (plan.skill.action === "create" && plan.skill.description && plan.skill.body) {
        const result = createSkill({
          name: plan.skill.name,
          description: plan.skill.description,
          body: plan.skill.body,
          tags: plan.skill.tags ?? [],
        });
        if (result.status === "created") {
          const action: ReviewAction = { kind: "skill", detail: `Skill created: ${plan.skill.name}` };
          actions.push(action);
          onAction?.(action);
        }
      }
    } catch (err: any) {
      console.warn(`[review] skill ${plan.skill.action} failed for "${plan.skill.name}": ${err?.message ?? err}`);
    }
  }

  return actions;
}

// ────────────────────────────────────────────────────────────────────────────
// Public entry — fire-and-forget
// ────────────────────────────────────────────────────────────────────────────

/**
 * Run the review in the background. Never throws, never blocks. Returns the
 * actions taken (mostly for tests) — production callers ignore the promise.
 */
export async function maybeBackgroundReview(input: BackgroundReviewInput): Promise<ReviewAction[]> {
  try {
    if (!shouldReview(input)) return [];

    const reviewPrompt = buildReviewPrompt(input);
    const response = await auxLLM.invoke(
      [{ role: "user", content: reviewPrompt }],
      { tags: ["candle-internal"] }
    );
    const text = contentToText(response.content);
    const raw = extractJsonObject(text);
    if (!raw) return [];

    const plan = validateReviewPlan(raw);
    if (plan.memory.length === 0 && !plan.skill) return [];

    const actions = applyReviewPlan(plan, input.onAction);
    if (actions.length > 0) {
      console.log(`[review] applied ${actions.length} learning action(s): ${actions.map((a) => a.detail).join("; ")}`);
    }
    // Opportunistically run the curator FSM (inactivity-gated, no-LLM). A new
    // skill may have just been created; keep the library healthy over time.
    maybeRunCurator();
    // Opt-in LLM consolidation (own longer cadence, only when CURATOR_CONSOLIDATE
    // is set). Fire-and-forget — never awaited, never blocks the reply.
    void maybeRunCuratorConsolidation();
    // Proactive user-model synthesis (own cadence). Distills scattered facts
    // into one coherent profile. Fire-and-forget — never blocks the reply.
    void maybeSynthesizeUserModel();
    return actions;
  } catch (err: any) {
    console.warn(`[review] background review failed: ${err?.message ?? err}`);
    return [];
  }
}
