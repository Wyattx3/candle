/**
 * Subagent runner — tool-based delegation.
 *
 * The parent agent invokes `runSubagent` (via the `spawn_subagent` tool) with
 * a focused sub-task. We spin up an isolated graph with its own RunContext
 * (tighter budget, no history, no nested spawn tool), run it to completion,
 * and return a concise summary plus any new artifacts.
 *
 * `runSubagentBatch` is the parallel fan-out variant — invoked via the
 * `spawn_subagents_parallel` tool. It runs up to N workers concurrently
 * with optional first-success short-circuiting.
 *
 * Why a tool, not a graph rewrite:
 *  - Preserves all existing safety nets (budget tracking, loop detection,
 *    observation summarizer, failure tracker) on the parent.
 *  - The parent stays the planner; the model decides when delegation pays off.
 *  - Subagents cannot recurse: their tool list excludes `spawn_subagent`
 *    AND `spawn_subagents_parallel`.
 */

import { COST_CEILINGS } from "./budget";
import { contentToText, createTimeoutSignal } from "./helpers";
import { createAgentGraph } from "./loop";
import { buildSubagentSystemPrompt } from "./prompts";
import { ArtifactRegistry } from "./registry";
import { memoryStore } from "./memory";
import { RunContext } from "./run-context";
import { AgentTimeoutError, SubagentResult } from "./types";
import { getSkillIndexText } from "../skills";
import { getMcpCatalogText } from "../mcp";
import { MODEL_NAME } from "./llm";

export const MAX_SUBAGENT_TOOL_CALLS = 14;
const MAX_SUBAGENT_OUTPUT_CHARS = 6000;
export const SUBAGENT_TIMEOUT_MS = 120_000;

/** Tighter per-worker timeout when fanning out — caps tail latency. */
export const PARALLEL_SUBAGENT_TIMEOUT_MS = 90_000;
/** Hard cap on parallel batch size. Larger batches waste budget without
 *  helping the planner — at that point the model should rethink the plan. */
export const MAX_PARALLEL_SUBAGENTS = 4;

export interface BatchTask {
  /** Stable identifier the planner can use to cross-reference results. */
  id: string;
  task: string;
}

export interface BatchSubagentResult {
  ok: boolean;
  combineStrategy: "all" | "first_success";
  results: Array<{ id: string; result: SubagentResult }>;
  /** Total tool calls used across every worker that actually ran. */
  toolCallsUsedTotal: number;
  /** Combined budget across every worker spawned. */
  toolCallBudgetTotal: number;
  /** Aggregated artifacts deduped by `path::url` key. */
  artifacts: SubagentResult["artifacts"];
}


/**
 * Run a single subagent inside a caller-provided AbortSignal. Extracted so
 * `runSubagent` and `runSubagentBatch` share the exact same execution path.
 */
async function runSingleSubagent(
  task: string,
  parentArtifacts: ArtifactRegistry,
  signal: AbortSignal,
  costCeiling: number
): Promise<SubagentResult> {
  const trimmed = task.trim();
  if (!trimmed) {
    return {
      ok: false,
      summary: "",
      toolCallsUsed: 0,
      toolCallBudget: MAX_SUBAGENT_TOOL_CALLS,
      artifacts: [],
      error: "Empty task.",
    };
  }

  const subCtx = new RunContext(trimmed, 0);
  subCtx.complexity = "complex";
  subCtx.budget = {
    maxToolCalls: MAX_SUBAGENT_TOOL_CALLS,
    maxSearchCalls: Math.min(subCtx.budget.maxSearchCalls, 4),
    maxBrowseCalls: Math.min(subCtx.budget.maxBrowseCalls, 2),
    warningAt: Math.max(2, MAX_SUBAGENT_TOOL_CALLS - 4),
  };
  subCtx.costCeiling = costCeiling;

  // Diff artifacts against a worker-local snapshot, NOT against the parent's
  // current state. This keeps concurrent workers from cross-attributing each
  // other's outputs in their final result envelopes.
  const beforeUrls = new Set(
    parentArtifacts.getRecentUrls(50).map((a) => `${a.path ?? ""}::${a.url ?? ""}`)
  );

  try {
    const subgraph = createAgentGraph(subCtx, signal, { mode: "subagent" });
    const systemContent = buildSubagentSystemPrompt({
      modelName: MODEL_NAME,
      skillIndex: getSkillIndexText(),
      mcpCatalog: getMcpCatalogText(),
      dynamicContext:
        "Subagent run — operate within the focused task below. Do not ask the user clarifying questions. Deliver the result and stop.",
      artifactSummary: parentArtifacts.getSummary(),
      memorySummary: memoryStore.getSummary(),
      complexity: subCtx.complexity,
    });
    const systemMessage = { role: "system" as const, content: systemContent };

    const finalState: any = await subgraph.invoke(
      { messages: [systemMessage, { role: "user", content: trimmed }] },
      {
        recursionLimit: Math.min(40, MAX_SUBAGENT_TOOL_CALLS * 3),
        signal,
        // Tag the entire subgraph run as internal. In modern LangGraph,
        // config/callbacks propagate into tool calls via AsyncLocalStorage,
        // so a subagent's chat-model token stream otherwise bubbles up into
        // the PARENT's `streamEvents` loop. With several parallel workers that
        // means multiple concurrent token streams get appended to the parent's
        // `assistantTextChunks` interleaved with each other — corrupting the
        // final answer into scrambled text (observed in checkpoint
        // 1780145085111). The parent's stream handler skips chat-model events
        // carrying the `candle-internal` tag, so this keeps the worker's tokens
        // out of the user-facing answer. The worker's real result is still
        // surfaced to the planner via the tool's return value.
        tags: ["candle-internal", "candle-subagent"],
      }
    );

    const messages = Array.isArray(finalState?.messages) ? finalState.messages : [];
    for (const msg of messages) {
      const isToolMsg = msg?.role === "tool" || msg?.type === "tool" || msg?.kwargs?.role === "tool";
      if (!isToolMsg) continue;
      const toolName = msg?.name || msg?.kwargs?.name || "subagent_tool";
      const content = contentToText(msg?.content ?? msg?.kwargs?.content ?? "");
      if (content) parentArtifacts.extractFromToolOutput(toolName, content);
    }

    const lastAssistant = [...messages].reverse().find((m: any) => {
      const role = m?.role || m?.kwargs?.role;
      return role === "assistant" || (!role && Array.isArray(m?.tool_calls) && m.tool_calls.length === 0);
    });
    const summary = contentToText(lastAssistant?.content ?? lastAssistant?.kwargs?.content ?? "")
      .trim()
      .slice(0, MAX_SUBAGENT_OUTPUT_CHARS);

    const newArtifacts = parentArtifacts
      .getRecentUrls(50)
      .filter((a) => !beforeUrls.has(`${a.path ?? ""}::${a.url ?? ""}`))
      .map((a) => ({
        toolName: "subagent",
        path: a.path,
        url: a.url,
        filename: a.name,
      }));

    return {
      ok: true,
      summary: summary || "Subagent finished but did not produce a textual summary.",
      toolCallsUsed: subCtx.toolCallCount,
      toolCallBudget: subCtx.budget.maxToolCalls,
      artifacts: newArtifacts,
    };
  } catch (error: any) {
    if (error instanceof AgentTimeoutError) {
      return {
        ok: false,
        summary: "Subagent timed out before delivering a final answer.",
        toolCallsUsed: subCtx.toolCallCount,
        toolCallBudget: subCtx.budget.maxToolCalls,
        artifacts: [],
        error: "timeout",
      };
    }
    if (signal.aborted) {
      return {
        ok: false,
        summary: "Subagent cancelled before completion.",
        toolCallsUsed: subCtx.toolCallCount,
        toolCallBudget: subCtx.budget.maxToolCalls,
        artifacts: [],
        error: "aborted",
      };
    }
    return {
      ok: false,
      summary: "",
      toolCallsUsed: subCtx.toolCallCount,
      toolCallBudget: subCtx.budget.maxToolCalls,
      artifacts: [],
      error: error?.message ?? String(error),
    };
  }
}


export async function runSubagent(
  task: string,
  parentArtifacts: ArtifactRegistry,
  parentSignal?: AbortSignal,
  options: { allowedToolNames?: string[] } = {}
): Promise<SubagentResult> {
  const { signal, cleanup } = createTimeoutSignal(parentSignal, SUBAGENT_TIMEOUT_MS);
  try {
    return await runSingleSubagent(
      task,
      parentArtifacts,
      signal,
      Math.min(COST_CEILINGS.complex, 28)
    );
  } finally {
    cleanup();
    void options;
  }
}


/**
 * Run several subagents concurrently. Each worker has its own per-task
 * abort controller chained to the parent's signal — so user cancellation
 * tears down the whole batch, and `combineStrategy: "first_success"`
 * cancels the still-running siblings the moment one returns ok.
 *
 * Per-worker cost ceiling shrinks linearly with the batch size to keep the
 * total spend bounded. With 4 parallel workers each ceiling lands around
 * COST_CEILINGS.complex/4 ≈ 12 — same order of magnitude as a single
 * subagent's tool-call budget translated into cost weight.
 */
export async function runSubagentBatch(
  tasks: BatchTask[],
  parentArtifacts: ArtifactRegistry,
  parentSignal?: AbortSignal,
  options: { combineStrategy?: "all" | "first_success" } = {}
): Promise<BatchSubagentResult> {
  const combineStrategy = options.combineStrategy ?? "all";
  const sliced = tasks.slice(0, MAX_PARALLEL_SUBAGENTS).filter((t) => t.task && t.task.trim());

  if (sliced.length === 0) {
    return {
      ok: false,
      combineStrategy,
      results: [],
      toolCallsUsedTotal: 0,
      toolCallBudgetTotal: 0,
      artifacts: [],
    };
  }

  // Per-worker ceiling shrinks with batch size. Floor at 8 so even a 4-way
  // fan-out gives each worker enough room to do meaningful work.
  const perWorkerCeiling = Math.max(
    8,
    Math.floor(Math.min(COST_CEILINGS.complex, 28) / Math.max(1, Math.ceil(sliced.length / 2)))
  );

  // One controller per worker so we can cancel siblings independently of the
  // parent (`first_success` mode), AND a forwarding listener so a parent
  // abort cancels every worker.
  const controllers = sliced.map(() => new AbortController());
  const onParentAbort = () => {
    for (const c of controllers) c.abort();
  };
  if (parentSignal) {
    if (parentSignal.aborted) onParentAbort();
    else parentSignal.addEventListener("abort", onParentAbort, { once: true });
  }

  // Wrap each worker in its own per-task timeout so a stuck single worker
  // can't hold up an otherwise-completed batch.
  const promises = sliced.map((entry, idx) => {
    const { signal, cleanup } = createTimeoutSignal(
      controllers[idx].signal,
      PARALLEL_SUBAGENT_TIMEOUT_MS
    );
    return (async () => {
      try {
        const result = await runSingleSubagent(entry.task, parentArtifacts, signal, perWorkerCeiling);
        if (combineStrategy === "first_success" && result.ok) {
          // Cancel the remaining workers — the planner only wanted one win.
          for (let j = 0; j < controllers.length; j += 1) {
            if (j !== idx) controllers[j].abort();
          }
        }
        return { id: entry.id, result };
      } finally {
        cleanup();
      }
    })();
  });

  const settled = await Promise.allSettled(promises);
  if (parentSignal) parentSignal.removeEventListener("abort", onParentAbort);

  const results = settled.map((s, idx) => {
    if (s.status === "fulfilled") return s.value;
    const reason = s.reason instanceof Error ? s.reason.message : String(s.reason ?? "unknown");
    return {
      id: sliced[idx].id,
      result: {
        ok: false,
        summary: "",
        toolCallsUsed: 0,
        toolCallBudget: MAX_SUBAGENT_TOOL_CALLS,
        artifacts: [],
        error: reason,
      } as SubagentResult,
    };
  });

  // Dedupe artifacts across workers — two workers could legitimately discover
  // the same file/URL; the planner only wants one entry per resource.
  const seen = new Set<string>();
  const aggregatedArtifacts: SubagentResult["artifacts"] = [];
  for (const entry of results) {
    for (const artifact of entry.result.artifacts ?? []) {
      const key = `${artifact.path ?? ""}::${artifact.url ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      aggregatedArtifacts.push(artifact);
    }
  }

  const toolCallsUsedTotal = results.reduce((sum, r) => sum + (r.result.toolCallsUsed ?? 0), 0);
  const toolCallBudgetTotal = results.reduce((sum, r) => sum + (r.result.toolCallBudget ?? 0), 0);

  const ok =
    combineStrategy === "first_success"
      ? results.some((r) => r.result.ok)
      : results.every((r) => r.result.ok);

  return {
    ok,
    combineStrategy,
    results,
    toolCallsUsedTotal,
    toolCallBudgetTotal,
    artifacts: aggregatedArtifacts,
  };
}
