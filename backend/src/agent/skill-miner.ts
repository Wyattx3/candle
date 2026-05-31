/**
 * ============================================================================
 * TRAJECTORY-DRIVEN SKILL MINER
 * ============================================================================
 * Reads checkpoints under `data/checkpoints/*.json` and proposes new skills
 * the agent could persist for future runs.
 *
 * The pipeline is deliberately offline + deterministic:
 *  1. Load every COMPLETED checkpoint (failed/cancelled runs aren't useful
 *     templates for future success).
 *  2. Bucket runs by tool-sequence signature — the ordered list of tool
 *     names invoked. Two runs share a bucket if their signatures share at
 *     least 70% of tools (Jaccard similarity) AND their prompts share a
 *     keyword vocabulary.
 *  3. Filter buckets: cluster size >= MIN_CLUSTER_SIZE, average
 *     toolCallCount >= MIN_TOOL_CALLS (skip trivial 1-2 call runs that
 *     don't deserve a skill), no existing skill in the registry already
 *     covers the same tool sequence.
 *  4. For each surviving bucket, emit a `SkillSuggestion` with a kebab-case
 *     name + 1-line description + a templated Markdown body. The Markdown
 *     body is intentionally a STARTING POINT — it captures the canonical
 *     tool sequence and the prompt patterns. A human reviewer (or a
 *     subsequent LLM polishing step) is expected to refine it before
 *     promotion.
 *  5. Persist suggestions under `data/skill-suggestions/<id>.json`. Each
 *     entry is idempotent on its content hash — re-running the miner won't
 *     duplicate existing suggestions.
 *
 * No LLM call is required for the basic miner. We intentionally keep this
 * pure JS so the operator can audit / hand-edit the suggestions before
 * `skill_manage(action="create")` ever runs.
 *
 * Privacy: prompts are redacted via the existing `redactSecrets` utility
 * before being included in the suggestion body. Operators should still
 * review every suggestion before promoting — heuristic redaction does not
 * remove every possible PII.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import { redactSecrets } from "../security";
import { listSkills } from "../skills";
import { auxLLM } from "./llm";
import { contentToText } from "./helpers";
import type { RunCheckpoint } from "./checkpoint";

const ROOT = path.resolve(__dirname, "../..");
// Directories are overridable via env so tests can point them at an isolated
// temp dir instead of the shared on-disk `data/` (which other suites and the
// running app also write to, causing cross-test contamination).
const CHECKPOINT_DIR = process.env.CANDLE_CHECKPOINT_DIR
  ? path.resolve(process.env.CANDLE_CHECKPOINT_DIR)
  : path.join(ROOT, "data", "checkpoints");
const SUGGESTIONS_DIR = process.env.CANDLE_SUGGESTIONS_DIR
  ? path.resolve(process.env.CANDLE_SUGGESTIONS_DIR)
  : path.join(ROOT, "data", "skill-suggestions");

/** Buckets must contain at least this many runs to be worth a skill. */
const MIN_CLUSTER_SIZE = 3;
/** Runs with fewer tool calls than this are too trivial to template. */
const MIN_TOOL_CALLS = 4;
/** Tool-sequence Jaccard threshold to merge two runs into the same bucket. */
const JACCARD_THRESHOLD = 0.7;
/** Prompt-vocabulary overlap (intersection / smaller set) threshold. */
const PROMPT_OVERLAP_THRESHOLD = 0.4;
/** Cap on suggestions emitted per mining run — keeps the review queue manageable. */
const MAX_SUGGESTIONS_PER_RUN = 25;
/** Truncate the prompt sample stored in suggestions to keep files small. */
const PROMPT_SAMPLE_CHARS = 240;

export interface SkillSuggestion {
  /** Stable id derived from the canonical tool sequence + prompt vocabulary. */
  id: string;
  /** Proposed kebab-case skill name. */
  name: string;
  /** One-line description for the skill index. */
  description: string;
  /** Markdown body the operator can review and edit before promotion. */
  body: string;
  /** Free-form tags inferred from prompt vocabulary. */
  tags: string[];
  /** Number of completed runs that contributed to this suggestion. */
  clusterSize: number;
  /** Average tool-call count across the cluster. */
  avgToolCalls: number;
  /** Average wall-clock duration of the cluster (ms). */
  avgDurationMs: number;
  /** Up to 3 redacted prompt samples that informed the suggestion. */
  promptSamples: string[];
  /** Canonical tool sequence the runs converged on. */
  toolSequence: string[];
  /** Created timestamp (ms). */
  createdAt: number;
  /** Status — `pending` until an operator approves or rejects. */
  status: "pending" | "approved" | "rejected";
}

interface RunFingerprint {
  runId: string;
  prompt: string;
  toolSequence: string[];
  toolCallCount: number;
  durationMs: number;
  vocabulary: Set<string>;
}

interface Cluster {
  members: RunFingerprint[];
  canonicalSequence: string[];
  vocabularyCounts: Map<string, number>;
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "for", "of", "in", "on", "to",
  "from", "with", "without", "is", "are", "was", "were", "be", "been", "being", "do", "does",
  "did", "have", "has", "had", "this", "that", "these", "those", "it", "its", "i", "you", "we",
  "they", "he", "she", "him", "her", "my", "your", "our", "their", "me", "us", "them", "as",
  "at", "by", "into", "out", "up", "down", "over", "under", "than", "so", "very", "just",
  "please", "can", "could", "would", "should", "will", "shall", "may", "might", "now", "also",
  "any", "all", "some", "no", "not", "yes", "ok", "okay",
]);

/** Tools that don't carry useful workflow signal — exclude from the canonical sequence. */
const NOISE_TOOLS = new Set([
  "list_sandbox_files",
  "inspect_sandbox_file",
  "capability_catalog",
  "list_e2b_templates",
  "set_e2b_template",
  "get_sandbox_file_url",
]);


function ensureDirs(): void {
  for (const dir of [CHECKPOINT_DIR, SUGGESTIONS_DIR]) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      /* ignore */
    }
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

/**
 * Overlap coefficient — intersection size divided by the smaller set.
 * Better than Jaccard for cluster matching because Jaccard penalises a
 * cluster as it accumulates members (the denominator grows). Overlap
 * stays meaningful no matter how broad the cluster's vocabulary becomes.
 */
function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / Math.min(a.size, b.size);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function fingerprint(checkpoint: RunCheckpoint): RunFingerprint | null {
  if (checkpoint.status !== "completed") return null;
  const tools = (checkpoint.toolEvents ?? [])
    .filter((event) => event && !event.isError)
    .map((event) => event.name)
    .filter((name) => typeof name === "string" && name && !NOISE_TOOLS.has(name));

  if (tools.length < MIN_TOOL_CALLS) return null;

  const prompt = redactSecrets(checkpoint.prompt ?? "").slice(0, 4_000);
  const vocabulary = new Set(tokenize(prompt));
  if (vocabulary.size < 2) return null;

  const durationMs =
    typeof checkpoint.completedAt === "number" && typeof checkpoint.startedAt === "number"
      ? Math.max(0, checkpoint.completedAt - checkpoint.startedAt)
      : 0;

  return {
    runId: checkpoint.runId,
    prompt,
    toolSequence: tools,
    toolCallCount: checkpoint.runCtx?.toolCallCount ?? tools.length,
    durationMs,
    vocabulary,
  };
}

function loadFingerprints(): RunFingerprint[] {
  ensureDirs();
  let names: string[] = [];
  try {
    names = fs.readdirSync(CHECKPOINT_DIR);
  } catch {
    return [];
  }
  const out: RunFingerprint[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = fs.readFileSync(path.join(CHECKPOINT_DIR, name), "utf8");
      const parsed = JSON.parse(raw) as RunCheckpoint;
      const fp = fingerprint(parsed);
      if (fp) out.push(fp);
    } catch {
      /* skip unreadable checkpoint */
    }
  }
  return out;
}

/**
 * Build a multiset of consecutive tool pairs (bigrams) — captures order
 * without requiring exact-sequence alignment. Two runs that did
 * search→browse→python and search→browse→python→python are still close.
 */
function bigramSet(sequence: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < sequence.length - 1; i += 1) {
    out.add(`${sequence[i]}->${sequence[i + 1]}`);
  }
  if (sequence.length === 1) out.add(sequence[0]);
  return out;
}

function clusterFingerprints(fingerprints: RunFingerprint[]): Cluster[] {
  const clusters: Cluster[] = [];

  for (const fp of fingerprints) {
    const fpBigrams = bigramSet(fp.toolSequence);
    let assigned: Cluster | null = null;

    for (const cluster of clusters) {
      const repBigrams = bigramSet(cluster.canonicalSequence);
      const toolSim = jaccard(fpBigrams, repBigrams);
      if (toolSim < JACCARD_THRESHOLD) continue;

      // Use the union of every member's vocabulary as the cluster's
      // representative — more permissive than a single representative.
      const clusterVocab = new Set<string>();
      for (const member of cluster.members) {
        for (const token of member.vocabulary) clusterVocab.add(token);
      }
      // Overlap (intersection / min) instead of Jaccard so the score
      // doesn't drop just because the cluster vocabulary is broader.
      const promptSim = overlap(fp.vocabulary, clusterVocab);
      if (promptSim < PROMPT_OVERLAP_THRESHOLD) continue;

      assigned = cluster;
      break;
    }

    if (assigned) {
      assigned.members.push(fp);
      // Keep the canonical sequence as the longest representative we've seen
      // so the templated body shows the full workflow when one member did
      // strictly more work than another.
      if (fp.toolSequence.length > assigned.canonicalSequence.length) {
        assigned.canonicalSequence = fp.toolSequence;
      }
      for (const token of fp.vocabulary) {
        assigned.vocabularyCounts.set(token, (assigned.vocabularyCounts.get(token) ?? 0) + 1);
      }
    } else {
      const counts = new Map<string, number>();
      for (const token of fp.vocabulary) counts.set(token, 1);
      clusters.push({
        members: [fp],
        canonicalSequence: fp.toolSequence,
        vocabularyCounts: counts,
      });
    }
  }

  return clusters;
}

function deriveSkillName(cluster: Cluster): string {
  const topTokens = [...cluster.vocabularyCounts.entries()]
    .filter(([token]) => token.length >= 4)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([token]) => token.replace(/[^a-z0-9]/g, ""));
  const fallback = cluster.canonicalSequence.slice(0, 2).join("-").replace(/_/g, "-");
  const slug = (topTokens.join("-") || fallback || "workflow")
    .toLowerCase()
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "workflow"}-workflow`.slice(0, 60);
}

function deriveDescription(cluster: Cluster): string {
  const head = cluster.canonicalSequence.slice(0, 4).join(" → ");
  const tail = cluster.canonicalSequence.length > 4 ? " → …" : "";
  const examples = cluster.members.length;
  return `Pattern observed across ${examples} successful runs: ${head}${tail}.`.slice(0, 200);
}

function deriveTags(cluster: Cluster): string[] {
  const counts = new Map<string, number>();
  for (const tool of cluster.canonicalSequence) {
    counts.set(tool, (counts.get(tool) ?? 0) + 1);
  }
  const topTools = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);
  const topVocab = [...cluster.vocabularyCounts.entries()]
    .filter(([token]) => token.length >= 4)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([token]) => token);
  return [...new Set([...topTools, ...topVocab])].slice(0, 8);
}

function buildSkillBody(cluster: Cluster): string {
  const samples = cluster.members
    .slice(0, 3)
    .map((member, idx) => {
      const trimmed = member.prompt.replace(/\s+/g, " ").trim().slice(0, PROMPT_SAMPLE_CHARS);
      return `${idx + 1}. "${trimmed}${member.prompt.length > PROMPT_SAMPLE_CHARS ? "…" : ""}"`;
    })
    .join("\n");
  const steps = cluster.canonicalSequence
    .map((tool, idx) => `${idx + 1}. \`${tool}\` — see prior runs for typical args.`)
    .join("\n");
  return [
    "## When to use this skill",
    "",
    `Triggered by user requests resembling these (${cluster.members.length} observed examples):`,
    "",
    samples,
    "",
    "## Canonical tool sequence",
    "",
    steps,
    "",
    "## Notes for the operator",
    "",
    "- This skill body was auto-generated from successful run trajectories. Review the steps and rewrite this section before approving.",
    "- Trim the sequence if any tools were redundant in retrospect.",
    "- Add typical arguments, common pitfalls, and a verification step.",
  ].join("\n");
}

function suggestionId(cluster: Cluster): string {
  const seqHash = crypto
    .createHash("sha256")
    .update(cluster.canonicalSequence.join("|"))
    .digest("hex")
    .slice(0, 12);
  const vocabSig = [...cluster.vocabularyCounts.keys()].sort().slice(0, 5).join("-");
  return `${seqHash}-${vocabSig}`.slice(0, 80);
}

function clusterToSuggestion(cluster: Cluster): SkillSuggestion {
  const totalCalls = cluster.members.reduce((sum, m) => sum + m.toolCallCount, 0);
  const totalDuration = cluster.members.reduce((sum, m) => sum + m.durationMs, 0);
  return {
    id: suggestionId(cluster),
    name: deriveSkillName(cluster),
    description: deriveDescription(cluster),
    body: buildSkillBody(cluster),
    tags: deriveTags(cluster),
    clusterSize: cluster.members.length,
    avgToolCalls: Math.round(totalCalls / cluster.members.length),
    avgDurationMs: Math.round(totalDuration / cluster.members.length),
    promptSamples: cluster.members
      .slice(0, 3)
      .map((m) => m.prompt.replace(/\s+/g, " ").trim().slice(0, PROMPT_SAMPLE_CHARS)),
    toolSequence: cluster.canonicalSequence,
    createdAt: Date.now(),
    status: "pending",
  };
}

function alreadyCoveredBySkill(suggestion: SkillSuggestion): boolean {
  // Skip if a registered skill's name shares more than half of the proposed
  // name's distinguishing slug tokens. Filter out generic suffixes like
  // "workflow" so they don't dominate the overlap calculation — every
  // skill in the registry ends in "-workflow", and so does every
  // suggestion we generate.
  const GENERIC_TOKENS = new Set(["workflow", "skill", "task", "agent"]);
  const meaningful = (slug: string) =>
    slug.split("-").filter((t) => t && !GENERIC_TOKENS.has(t));

  const existing = listSkills();
  const slug = new Set(meaningful(suggestion.name));
  if (slug.size === 0) return false;
  for (const sk of existing) {
    const candidateTokens = meaningful(sk.name);
    if (candidateTokens.length === 0) continue;
    let overlap = 0;
    for (const token of candidateTokens) if (slug.has(token)) overlap += 1;
    if (overlap / candidateTokens.length >= 0.6) return true;
  }
  return false;
}


export interface MineSummary {
  scannedRuns: number;
  qualifyingRuns: number;
  clustersFound: number;
  newSuggestions: number;
  totalSuggestions: number;
  /** Number of suggestions that received an LLM-polished body. */
  polishedSuggestions: number;
}

const POLISH_PROMPT_TEMPLATE = (suggestion: SkillSuggestion) =>
  `You are an editor turning an auto-generated workflow draft into a clean, actionable Markdown skill.\n` +
  `\n` +
  `RAW DRAFT METADATA\n` +
  `- proposed name: ${suggestion.name}\n` +
  `- description: ${suggestion.description}\n` +
  `- canonical tool sequence: ${suggestion.toolSequence.join(" → ")}\n` +
  `- average tool calls: ${suggestion.avgToolCalls}\n` +
  `- cluster size: ${suggestion.clusterSize} successful runs\n` +
  `\n` +
  `EXAMPLE PROMPTS THAT TRIGGERED THIS WORKFLOW\n` +
  suggestion.promptSamples.map((s, i) => `${i + 1}. "${s}"`).join("\n") +
  `\n\n` +
  `OUTPUT REQUIREMENTS\n` +
  `Write a Markdown skill body with these sections in order:\n` +
  `1. ## When to use this skill — concise list (3 bullets max) of trigger conditions, written in second person.\n` +
  `2. ## Steps — numbered steps. Each step states the tool name in backticks and what to do, in plain English. Do NOT invent argument values; reference the original prompts only when needed.\n` +
  `3. ## Verification — 1-2 lines on how to confirm success.\n` +
  `4. ## Common pitfalls — 1-2 short bullets the agent should watch for.\n` +
  `\n` +
  `QUALITY SIGNALS (ported from Hermes self-improvement review)\n` +
  `- Capture CLASS-LEVEL, reusable technique — not a one-off, one-session recipe. If this only applies to a single file/URL/account from the sample prompts, generalize it.\n` +
  `- Do NOT encode environment-dependent failures (a transient network error, a missing API key, a one-time sandbox hiccup) as steps. Those are not reusable knowledge.\n` +
  `- Bake in any non-obvious tool-usage pattern or ordering that made the workflow succeed (e.g. "install before run", "verify file exists before returning a URL").\n` +
  `- Prefer the smallest correct sequence. If a tool in the canonical sequence was clearly redundant in retrospect, omit it from the steps.\n` +
  `\n` +
  `STYLE\n` +
  `- 200-450 words total.\n` +
  `- No filler like "this skill helps you...". Direct, imperative voice.\n` +
  `- Do NOT add a top-level heading; the SKILL.md generator adds it from front-matter.\n` +
  `- Do NOT mention the cluster size or that this was auto-generated. Just produce a usable skill.\n` +
  `- Output ONLY the Markdown body. No code fences around the whole answer.`;


/**
 * Run an LLM polish pass over a draft suggestion's body. Returns the polished
 * body, or null if polishing failed. Failures are logged but never thrown —
 * the raw draft is always usable as a fallback.
 */
async function polishSuggestionBody(suggestion: SkillSuggestion): Promise<string | null> {
  try {
    const response = await auxLLM.invoke([
      { role: "user", content: POLISH_PROMPT_TEMPLATE(suggestion) },
    ]);
    const text = contentToText(response.content).trim();
    if (!text || text.length < 80) return null;
    // Strip any leading "## ..." heading the model might have added even
    // though we asked it not to — the existing body template starts mid-doc.
    return text.replace(/^#\s+.*$/m, "").trim();
  } catch (err: any) {
    console.warn(`[skill-miner] polish failed for ${suggestion.id}: ${err?.message ?? err}`);
    return null;
  }
}

/**
 * Scan every checkpoint, cluster successful runs, persist new suggestions.
 * Returns a summary the caller can log or expose via HTTP.
 *
 * Pure (synchronous) variant — does NOT call the LLM. Useful for tests and
 * environments where no provider key is configured. Use
 * `mineSkillSuggestionsWithPolish` for the production path that polishes
 * each new suggestion's body.
 */
export function mineSkillSuggestions(): MineSummary {
  ensureDirs();

  const fingerprints = loadFingerprints();
  const clusters = clusterFingerprints(fingerprints)
    .filter((c) => c.members.length >= MIN_CLUSTER_SIZE)
    .sort((a, b) => b.members.length - a.members.length)
    .slice(0, MAX_SUGGESTIONS_PER_RUN);

  const existingFiles = (() => {
    try {
      return new Set(fs.readdirSync(SUGGESTIONS_DIR));
    } catch {
      return new Set<string>();
    }
  })();

  let newCount = 0;
  for (const cluster of clusters) {
    const suggestion = clusterToSuggestion(cluster);
    if (alreadyCoveredBySkill(suggestion)) continue;
    const filename = `${suggestion.id}.json`;
    if (existingFiles.has(filename)) continue;
    try {
      fs.writeFileSync(
        path.join(SUGGESTIONS_DIR, filename),
        JSON.stringify(suggestion, null, 2),
        "utf8"
      );
      newCount += 1;
    } catch (err: any) {
      console.warn(`[skill-miner] failed to write ${filename}: ${err?.message ?? err}`);
    }
  }

  return {
    scannedRuns: fingerprints.length,
    qualifyingRuns: fingerprints.length,
    clustersFound: clusters.length,
    newSuggestions: newCount,
    totalSuggestions: listSuggestions().length,
    polishedSuggestions: 0,
  };
}


/**
 * Like `mineSkillSuggestions`, but every NEW suggestion's body gets a single
 * LLM polish pass before being written to disk. Cheap (1 LLM call per new
 * suggestion, no tools) and capped at MAX_SUGGESTIONS_PER_RUN, so even a
 * massive backlog of clusters can't blow up the provider bill.
 */
export async function mineSkillSuggestionsWithPolish(): Promise<MineSummary> {
  ensureDirs();

  const fingerprints = loadFingerprints();
  const clusters = clusterFingerprints(fingerprints)
    .filter((c) => c.members.length >= MIN_CLUSTER_SIZE)
    .sort((a, b) => b.members.length - a.members.length)
    .slice(0, MAX_SUGGESTIONS_PER_RUN);

  const existingFiles = (() => {
    try {
      return new Set(fs.readdirSync(SUGGESTIONS_DIR));
    } catch {
      return new Set<string>();
    }
  })();

  let newCount = 0;
  let polishedCount = 0;
  for (const cluster of clusters) {
    const suggestion = clusterToSuggestion(cluster);
    if (alreadyCoveredBySkill(suggestion)) continue;
    const filename = `${suggestion.id}.json`;
    if (existingFiles.has(filename)) continue;

    const polished = await polishSuggestionBody(suggestion);
    if (polished) {
      suggestion.body = polished;
      polishedCount += 1;
    }

    try {
      fs.writeFileSync(
        path.join(SUGGESTIONS_DIR, filename),
        JSON.stringify(suggestion, null, 2),
        "utf8"
      );
      newCount += 1;
    } catch (err: any) {
      console.warn(`[skill-miner] failed to write ${filename}: ${err?.message ?? err}`);
    }
  }

  return {
    scannedRuns: fingerprints.length,
    qualifyingRuns: fingerprints.length,
    clustersFound: clusters.length,
    newSuggestions: newCount,
    totalSuggestions: listSuggestions().length,
    polishedSuggestions: polishedCount,
  };
}

export function listSuggestions(): SkillSuggestion[] {
  ensureDirs();
  let names: string[] = [];
  try {
    names = fs.readdirSync(SUGGESTIONS_DIR);
  } catch {
    return [];
  }
  const out: SkillSuggestion[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = fs.readFileSync(path.join(SUGGESTIONS_DIR, name), "utf8");
      const parsed = JSON.parse(raw) as SkillSuggestion;
      if (parsed && typeof parsed === "object" && parsed.id) out.push(parsed);
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => b.clusterSize - a.clusterSize || b.createdAt - a.createdAt);
}

export function loadSuggestion(id: string): SkillSuggestion | null {
  ensureDirs();
  const safeId = id.replace(/[^A-Za-z0-9_-]/g, "");
  if (!safeId || safeId !== id) return null;
  try {
    const raw = fs.readFileSync(path.join(SUGGESTIONS_DIR, `${safeId}.json`), "utf8");
    return JSON.parse(raw) as SkillSuggestion;
  } catch {
    return null;
  }
}

export function deleteSuggestion(id: string): boolean {
  ensureDirs();
  const safeId = id.replace(/[^A-Za-z0-9_-]/g, "");
  if (!safeId || safeId !== id) return false;
  try {
    fs.unlinkSync(path.join(SUGGESTIONS_DIR, `${safeId}.json`));
    return true;
  } catch {
    return false;
  }
}

/**
 * Mark a suggestion as approved or rejected. The actual `createSkill` call
 * remains a separate step — operators may want to edit the body before
 * promoting, and that lifecycle belongs in the HTTP handler.
 */
export function updateSuggestionStatus(
  id: string,
  status: "approved" | "rejected"
): SkillSuggestion | null {
  const suggestion = loadSuggestion(id);
  if (!suggestion) return null;
  const updated: SkillSuggestion = { ...suggestion, status };
  try {
    fs.writeFileSync(
      path.join(SUGGESTIONS_DIR, `${id}.json`),
      JSON.stringify(updated, null, 2),
      "utf8"
    );
    return updated;
  } catch {
    return null;
  }
}
