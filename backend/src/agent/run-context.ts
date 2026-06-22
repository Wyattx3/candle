/**
 * Per-connection mutable state. Each WebSocket prompt gets its own
 * RunContext instance — no shared globals, so concurrent runs stay isolated.
 */

import { COST_CEILINGS, TOOL_BUDGETS, classifyQueryComplexity, toolCostWeight } from "./budget";
import { ToolCallGuardrailController } from "./guardrails";
import { QueryComplexity, ToolBudget } from "./types";

export class RunContext {
  /** The original user prompt — accessible to the critic and trajectory logger. */
  readonly prompt: string;
  budget: ToolBudget;
  complexity: QueryComplexity;
  /**
   * Set to "gaia" when running under the GAIA benchmark harness. The critic
   * uses this to run an answer-FORMAT auditor (unit/scale/separator/ordering
   * reconciliation) regardless of complexity — GAIA grades by exact match, so a
   * right value in the wrong unit ("17000" when asked for thousands → "17")
   * scores zero, and the normal critic is skipped on non-complex tasks.
   */
  benchmarkMode?: "gaia";
  /** One-shot guard so the GAIA format auditor can never loop. */
  gaiaFormatAudited = false;
  toolCallCount = 0;
  searchCallCount = 0;
  browseCallCount = 0;
  /** Weighted cost score — see TOOL_COST_WEIGHTS for the per-tool weights. */
  costScore = 0;
  costCeiling: number;
  budgetWarningIssued = false;
  budgetExceeded = false;
  /** Which limit tripped budgetExceeded — for accurate logging + nudges. */
  budgetExceededReason: string | null = null;
  /**
   * Absolute wall-clock time (ms epoch) past which the loop should stop
   * starting new tool calls and force a final answer instead. Set from
   * `index.ts` to a fraction of the hard run timeout, so a long browse/search
   * chain never burns the whole budget and times out with an EMPTY answer —
   * the user always gets the best result from what was gathered. null = unset.
   */
  softDeadlineAt: number | null = null;
  /** Set once the empty-final-answer recovery pass has fired, so it can't loop. */
  emptyAnswerRecovered = false;
  /**
   * Set once the output-degeneration recovery pass has fired. GLM-5.2 sometimes
   * collapses mid-generation into repeated garbage ("Let me research...Let me",
   * "0:0|0>0|0)2)"); we discard that and retry ONCE with a constrained prompt.
   * One-shot so a model that keeps collapsing can't loop the recovery forever.
   */
  degenerationRecovered = false;
  /** Anti-thrash counter for context compression — backs off after 2 weak passes. */
  ineffectiveCompressionCount = 0;
  recentModelOutputs: string[] = [];
  /** Names of tools invoked this run — used to gate post-turn learning review. */
  toolsUsed: string[] = [];
  loopNudgeSent = false;
  /** Set once the "state your reasoning" nudge has fired, so it stays one-shot. */
  reasoningReminderSent = false;
  /**
   * Count of code-execution calls (run_python / run_terminal / run_node). A high
   * count with no final answer is the "incremental REPL flailing" anti-pattern:
   * the model pokes a file/problem one tiny snippet at a time, never consolidating
   * into a single end-to-end solver, and burns its whole budget/time before
   * producing an answer (see GAIA maze task 65afbc8a). detectLoop misses this
   * because each snippet's args differ. We fire a one-shot consolidation nudge.
   */
  codeExecCount = 0;
  /** Set once the "consolidate into one script" nudge has fired, so it's one-shot. */
  consolidationNudgeSent = false;
  /** Tracks tool failures so the model can see them in context */
  pendingFailureHint: string | null = null;
  guardrails: ToolCallGuardrailController = new ToolCallGuardrailController();
  private readonly loopWindow = 6;

  constructor(prompt: string, historyLength: number) {
    this.prompt = prompt;
    this.complexity = classifyQueryComplexity(prompt, historyLength);
    this.budget = TOOL_BUDGETS[this.complexity];
    this.costCeiling = COST_CEILINGS[this.complexity];
    console.log(`[budget] Query classified as "${this.complexity}" — max ${this.budget.maxToolCalls} calls, ${this.budget.maxSearchCalls} searches, cost ceiling ${this.costCeiling}`);
  }

  trackToolCall(toolName: string): "ok" | "warning" | "exceeded" {
    this.toolCallCount++;
    if (toolName === "search_web") this.searchCallCount++;
    if (toolName === "browse_web") this.browseCallCount++;
    if (toolName === "run_python" || toolName === "run_terminal" || toolName === "run_node") {
      this.codeExecCount++;
    }
    this.costScore += toolCostWeight(toolName);
    if (this.toolsUsed.length < 100) this.toolsUsed.push(toolName);

    // Overall tool-call budget stays generous so Execute/build tasks (many
    // file/run ops) aren't choked. But search is the spiral-prone tool: the
    // model will re-query forever if unchecked (re-running near-identical
    // searches, never converging to an answer, eventually flooding the provider
    // into a 429). So we ALSO hard-cap searches+browses specifically — hitting
    // the search cap forces a tool-less final answer from what's already
    // gathered. The weighted cost ceiling stays telemetry-only.
    if (this.toolCallCount > this.budget.maxToolCalls) {
      this.budgetExceeded = true;
      this.budgetExceededReason = `tool calls ${this.toolCallCount}/${this.budget.maxToolCalls}`;
      return "exceeded";
    }
    if (this.searchCallCount > this.budget.maxSearchCalls) {
      this.budgetExceeded = true;
      this.budgetExceededReason = `searches ${this.searchCallCount}/${this.budget.maxSearchCalls} — answer from what you have`;
      return "exceeded";
    }
    if (this.browseCallCount > this.budget.maxBrowseCalls) {
      this.budgetExceeded = true;
      this.budgetExceededReason = `browses ${this.browseCallCount}/${this.budget.maxBrowseCalls} — answer from what you have`;
      return "exceeded";
    }

    if (this.toolCallCount >= this.budget.warningAt && !this.budgetWarningIssued) {
      this.budgetWarningIssued = true;
      return "warning";
    }
    return "ok";
  }

  getModelOutputSignature(response: any): string {
    const toolCalls = response.tool_calls ?? [];
    if (toolCalls.length > 0) {
      return toolCalls
        .map((t: any) => `${t.name}:${this.hashArgs(t.args ?? {})}`)
        .sort()
        .join("|");
    }
    const content = response.content;
    const text = typeof content === "string" ? content : Array.isArray(content)
      ? content.map((p: any) => (typeof p === "string" ? p : (p?.text ?? p?.content ?? ""))).join("")
      : "";
    return text.slice(0, 200).trim();
  }

  /**
   * Stable hash of the FULL tool args. Previously we sliced args to the first
   * 80 chars, which made two genuinely-different code edits (e.g. a `run_python`
   * call that fixes a bug deep in a long script) collide on an identical
   * signature → a false "loop detected". Hashing the whole thing keeps the
   * signature compact while staying sensitive to any real change.
   */
  private hashArgs(args: any): string {
    let str: string;
    try {
      str = JSON.stringify(args);
    } catch {
      str = String(args);
    }
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return `${str.length}:${(h >>> 0).toString(36)}`;
  }

  detectLoop(signature: string): "ok" | "nudge" | "stop" {
    this.recentModelOutputs.push(signature);
    if (this.recentModelOutputs.length > this.loopWindow) {
      this.recentModelOutputs.shift();
    }

    let consecutive = 1;
    for (let i = this.recentModelOutputs.length - 2; i >= 0; i--) {
      if (this.recentModelOutputs[i] === signature) {
        consecutive++;
      } else {
        const similarity = this.stringSimilarity(this.recentModelOutputs[i], signature);
        if (similarity > 0.7) {
          consecutive++;
        } else {
          break;
        }
      }
    }

    if (consecutive >= 3) return "stop";
    if (consecutive >= 2) return "nudge";
    return "ok";
  }

  private stringSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (!a || !b) return 0;
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    if (longer.length === 0) return 1;
    let matches = 0;
    for (let i = 0; i < shorter.length; i++) {
      if (shorter[i] === longer[i]) matches++;
    }
    return matches / longer.length;
  }
}
