/**
 * Tool-call budget enforcement (Hermes-style single binding limit).
 *
 * The ONLY hard cap is the total tool-call count per run — mirroring Hermes'
 * `IterationBudget` (parent 90, subagent 50). The complexity classifier still
 * routes the LLM tier (noTools / research) and picks a generous call budget,
 * but the per-search / per-browse sub-caps and the weighted cost ceiling no
 * longer BLOCK a run: they were tripping legitimate multi-step work far too
 * early. `costScore` / `searchCallCount` / `browseCallCount` are still tracked
 * for telemetry and the wrap-up warning nudge.
 */

import { QueryComplexity, ToolBudget } from "./types";

// Search is the spiral-prone tool: with fetch_content=true ONE search already
// returns ~6 full pages, so a handful is plenty. maxSearchCalls is kept TIGHT
// (and gated in RunContext.trackToolCall) to force the model to stop querying
// and ANSWER from what it has, instead of re-searching forever and flooding the
// provider into rate limits. The overall maxToolCalls stays generous so genuine
// Execute/build tasks (many file/run ops) aren't choked.
export const TOOL_BUDGETS: Record<QueryComplexity, ToolBudget> = {
  simple: { maxToolCalls: 10, maxSearchCalls: 3, maxBrowseCalls: 4, warningAt: 8 },
  moderate: { maxToolCalls: 40, maxSearchCalls: 6, maxBrowseCalls: 8, warningAt: 34 },
  complex: { maxToolCalls: 90, maxSearchCalls: 12, maxBrowseCalls: 16, warningAt: 80 },
};

/**
 * Per-tool cost weights. Tool calls aren't fungible — a browse is much more
 * expensive than a list_sandbox_files in both wall time and provider cost.
 * Anything not listed defaults to weight 1.
 */
export const TOOL_COST_WEIGHTS: Record<string, number> = {
  search_web: 2,
  research: 4,
  finance_research: 5,
  browse_web: 3,
  browser_interact: 4,
  sandbox_browser: 5,
  screenshot_analyze: 3,
  download_video: 3,
  transcribe_audio: 3,
  run_python: 2,
  run_python_with_tools: 4,
  run_node: 2,
  run_terminal: 1,
  install_packages: 2,
  spawn_subagent: 6,
  spawn_subagents_parallel: 10,
  list_sandbox_files: 1,
  read_sandbox_file: 1,
  inspect_sandbox_file: 1,
  get_sandbox_file_url: 1,
  capability_catalog: 1,
  list_e2b_templates: 1,
  skill_view: 1,
  skill_manage: 1,
  recall_runs: 1,
  kanban: 1,
};

export const COST_CEILINGS: Record<QueryComplexity, number> = {
  simple: 5,
  moderate: 30,
  complex: 60,
};


export function toolCostWeight(toolName: string): number {
  return TOOL_COST_WEIGHTS[toolName] ?? 1;
}

export function classifyQueryComplexity(prompt: string, historyLength: number): QueryComplexity {
  const lower = prompt.toLowerCase().trim();
  const wordCount = lower.split(/\s+/).length;

  // Trivial: acknowledgements, thanks, confirmations — no tools needed
  const trivialPatterns = [
    /^(ok|okay|thanks|thank you|thx|good|great|nice|cool|got it|understood)\s*[.!]?\s*$/i,
  ];
  if (trivialPatterns.some((p) => p.test(lower))) return "simple";

  const simplePatterns = [
    /^(who|what|when|where|which|how much|how many|how old)\b.{0,100}\??\s*$/,
    /^(hi|hello|hey)\b/,
    /^(define|explain|tell me about|what is|what are)\b.{0,80}$/,
    /^.{0,50}(capital|president|population|currency|language|flag)\b.{0,50}$/,
  ];
  if (wordCount <= 20 && simplePatterns.some((p) => p.test(lower))) return "simple";

  const isQuestion = /^(what|who|when|where|why|how|is|are|was|were|do|does|did|can|could)\b/i.test(lower) || lower.endsWith("?");
  const isImperative = /^(download|create|build|generate|write|develop|implement|convert|install|find|search|get|make|run|execute)\b/i.test(lower);

  // Action keywords ANYWHERE in the prompt — not just at the start. The app is
  // multilingual: a user may wrap an English action word in another language
  // ("manga chapter 1 ကို download လုပ်ပေး"). Matching the start-of-string only
  // (isImperative) misses these and wrongly classifies a real multi-step task
  // as a cheap "moderate" lookup. These are strong signals of an Execute /
  // Multi-step task that needs a real tool budget.
  const hasActionKeyword =
    /\b(download|convert|scrape|crawl|install|deploy|compile|render|transcode|screenshot|automate)\b/i.test(lower) ||
    /\b(send me|save (it|them|to)|fetch|grab|pull)\b/i.test(lower);
  const hasUrl = /https?:\/\/\S+/i.test(prompt);
  const mentionsMedia = /\b(video|manga|comic|anime|pdf|mp3|mp4|image|file|document|subtitle|episode|chapter)\b/i.test(lower);

  if (isQuestion && !isImperative && !hasActionKeyword && !hasUrl && wordCount <= 15) {
    return wordCount <= 8 ? "simple" : "moderate";
  }

  // A download/convert/scrape verb, a URL, or "media noun + action" reliably
  // signals an Execute task regardless of the prompt's main language.
  if (hasActionKeyword || hasUrl || (mentionsMedia && (isImperative || hasActionKeyword))) {
    return "complex";
  }

  const complexIndicators = [
    isImperative,
    /\bfor me\b/i.test(lower),
    /\b(step.by.step|multiple|all|every|compare|analyze|research)\b/.test(lower),
    mentionsMedia,
    wordCount > 40,
  ];

  const complexScore = complexIndicators.filter(Boolean).length;
  if (complexScore >= 2 || (isImperative && wordCount > 10)) return "complex";

  if (historyLength > 0 && wordCount <= 15) {
    const continuationPatterns = [
      /\b(keep|try|again|more|next|continue|another|else)\b/i,
      /\b(change|update|modify|fix)\b/i,
    ];
    if (continuationPatterns.some((p) => p.test(lower))) return "complex";
    return "moderate";
  }

  return "moderate";
}

export function isResearchQuery(messages: any[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user" || msg?.kwargs?.role === "user") {
      const text = String(msg.content ?? msg?.kwargs?.content ?? "").toLowerCase();
      const hasResearchKeywords = /\b(find|identify|search|what is this|name of|title of)\b/.test(text);
      const isCodeTask = /\b(run|execute|code|script|function|class|import|pip|npm)\b/.test(text) ||
        text.includes("```") || text.includes("def ") || text.includes("const ");
      return hasResearchKeywords && !isCodeTask;
    }
  }
  return false;
}
