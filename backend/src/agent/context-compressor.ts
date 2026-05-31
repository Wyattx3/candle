/**
 * ============================================================================
 * CONTEXT COMPRESSOR — tool-result pruning
 * ============================================================================
 * Ported from NousResearch/hermes-agent (`agent/context_compressor.py`,
 * the `_summarize_tool_result` + `_prune_old_tool_results` + anti-thrash bits).
 *
 * Candle's existing `summarizeOldHistory` compresses CHAT HISTORY between
 * turns. This module handles the other half: within a single long multi-step
 * run, the live message state accumulates large tool outputs (search JSON,
 * browsed pages, terminal dumps). Once the running token estimate crosses a
 * threshold, we replace OLD tool-result contents with informative one-line
 * summaries — keeping the most recent N tool results intact so the model can
 * still act on fresh data.
 *
 * This is a cheap, deterministic, NO-LLM pre-pass. It only touches `role:tool`
 * messages older than the protected tail, and only when over budget. Anti-
 * thrash: if a pass frees less than a useful amount, we don't keep retrying.
 */

import { estimateMessagesTokens, estimateStringTokens } from "./token-estimate";
import { contentToText } from "./helpers";

/** Tool-result messages newer than this many (from the end) are never pruned. */
const DEFAULT_PROTECT_TAIL = 4;
/** Pruned summaries longer than this would defeat the purpose — clamp. */
const MAX_SUMMARY_CHARS = 200;

interface ToolMsgLike {
  role?: string;
  type?: string;
  name?: string;
  content?: unknown;
  tool_call_id?: string;
  kwargs?: { role?: string; name?: string; content?: unknown };
  [k: string]: unknown;
}

function isToolMessage(msg: ToolMsgLike): boolean {
  const role = msg?.role ?? msg?.kwargs?.role;
  return role === "tool" || (typeof msg?.type === "string" && msg.type.includes("tool"));
}

function firstJsonNumber(content: string, key: string): string | null {
  const m = content.match(new RegExp(`"${key}"\\s*:\\s*(-?\\d+)`));
  return m ? m[1] : null;
}

/**
 * Build a short, informative one-line summary of a tool result. Mirrors
 * Hermes' `_summarize_tool_result`, mapped onto Candle's tool names.
 */
export function summarizeToolResult(toolName: string, content: string): string {
  const text = content || "";
  const len = text.length;
  const lines = text.trim() ? text.split("\n").length : 0;
  const name = toolName || "tool";

  switch (name) {
    case "run_terminal": {
      const exit = firstJsonNumber(text, "exit_code") ?? "?";
      return `[run_terminal] -> exit ${exit}, ${lines} lines output`;
    }
    case "run_python":
    case "run_node":
      return `[${name}] executed, ${lines} lines output (${len.toLocaleString()} chars)`;
    case "search_web": {
      const ranks = (text.match(/"rank"/g) || []).length;
      return `[search_web] ${ranks || "?"} results (${len.toLocaleString()} chars)`;
    }
    case "browse_web":
      return `[browse_web] fetched page (${len.toLocaleString()} chars)`;
    case "sandbox_browser":
    case "browser_interact":
      return `[${name}] browser action (${len.toLocaleString()} chars)`;
    case "read_sandbox_file":
      return `[read_sandbox_file] read file (${len.toLocaleString()} chars)`;
    case "write_sandbox_file":
      return `[write_sandbox_file] wrote file`;
    case "inspect_sandbox_file":
    case "list_sandbox_files":
      return `[${name}] listing (${len.toLocaleString()} chars)`;
    case "download_video":
      return `[download_video] download result (${len.toLocaleString()} chars)`;
    case "screenshot_analyze":
      return `[screenshot_analyze] analyzed image (${len.toLocaleString()} chars)`;
    case "http_request":
      return `[http_request] response (${len.toLocaleString()} chars)`;
    case "spawn_subagent":
    case "spawn_subagents_parallel":
      return `[${name}] worker result (${len.toLocaleString()} chars)`;
    case "skill_view":
    case "skill_manage":
      return `[${name}] (${len.toLocaleString()} chars)`;
    case "search_memory":
    case "store_memory":
      return `[${name}] memory op`;
    case "todo":
      return `[todo] updated task list`;
    case "clarify":
      return `[clarify] asked user a question`;
    default:
      return `[${name}] result (${len.toLocaleString()} chars)`;
  }
}

export interface CompressionResult {
  messages: any[];
  /** True if any message was pruned. */
  changed: boolean;
  prunedCount: number;
  tokensBefore: number;
  tokensAfter: number;
}

/**
 * Decide whether compression should run. Returns false below threshold and
 * backs off after repeated ineffective passes (anti-thrash).
 */
export function shouldCompress(
  messages: any[],
  thresholdTokens: number,
  ineffectiveCount = 0
): boolean {
  if (ineffectiveCount >= 2) return false;
  return estimateMessagesTokens(messages) >= thresholdTokens;
}

/**
 * Replace OLD tool-result contents (older than the protected tail) with
 * one-line summaries. Only large outputs are pruned — small tool results are
 * left alone since they cost little and may matter. Pure: returns a new array.
 *
 * @param thresholdTokens  Compress only when the estimate is at/over this.
 * @param protectTail      Keep this many most-recent tool results intact.
 * @param minToolChars     Only prune tool outputs longer than this.
 */
export function compressToolResults(
  messages: any[],
  opts: {
    thresholdTokens: number;
    protectTail?: number;
    minToolChars?: number;
  }
): CompressionResult {
  const protectTail = opts.protectTail ?? DEFAULT_PROTECT_TAIL;
  const minToolChars = opts.minToolChars ?? 600;
  const tokensBefore = estimateMessagesTokens(messages);

  if (tokensBefore < opts.thresholdTokens) {
    return { messages, changed: false, prunedCount: 0, tokensBefore, tokensAfter: tokensBefore };
  }

  // Index the tool messages so we can protect the most recent `protectTail`.
  const toolIndices: number[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    if (isToolMessage(messages[i])) toolIndices.push(i);
  }
  const protectedFrom = toolIndices.length - protectTail;
  const protectedSet = new Set(toolIndices.slice(Math.max(0, protectedFrom)));

  let prunedCount = 0;
  const out = messages.map((msg, i) => {
    if (!isToolMessage(msg) || protectedSet.has(i)) return msg;
    const content = contentToText(msg.content ?? msg.kwargs?.content ?? "");
    if (content.length <= minToolChars) return msg;
    // Already a summary? Skip.
    if (/^\[[a-z_]+\]/i.test(content.trim()) && content.length <= MAX_SUMMARY_CHARS) return msg;

    const toolName = (msg.name ?? msg.kwargs?.name ?? "tool") as string;
    const summary = summarizeToolResult(toolName, content).slice(0, MAX_SUMMARY_CHARS) +
      " [older tool output condensed]";
    prunedCount += 1;
    // Preserve the message shape (role/name/tool_call_id), swap only content.
    if (msg.kwargs) {
      return { ...msg, kwargs: { ...msg.kwargs, content: summary } };
    }
    return { ...msg, content: summary };
  });

  const tokensAfter = estimateMessagesTokens(out);
  return { messages: out, changed: prunedCount > 0, prunedCount, tokensBefore, tokensAfter };
}

/** Compute the savings fraction (0–1) of a compression pass. */
export function compressionSavings(result: CompressionResult): number {
  if (result.tokensBefore <= 0) return 0;
  return Math.max(0, (result.tokensBefore - result.tokensAfter) / result.tokensBefore);
}

export { estimateStringTokens };
