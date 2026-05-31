/**
 * Plain helpers — content/JSON parsing, history normalization, observation
 * summarization, configuration getters. No LangGraph/LangChain dependency
 * so they're cheap to import.
 */

import { redactSecrets } from "../security";
import { AgentAbortError } from "./types";
import { ChatHistoryMessage } from "./types";
import { noToolsLLM } from "./llm";

export const MAX_TOOL_OUTPUT_CHARS = Number(process.env.MAX_TOOL_OUTPUT_CHARS) || 16_000;
export const MAX_SINGLE_MESSAGE_CHARS = Number(process.env.MAX_SINGLE_MESSAGE_CHARS) || 12_000;

export function getMaxAgentSteps() {
  const parsed = Number(process.env.MAX_AGENT_STEPS);
  if (!Number.isFinite(parsed)) return 80;
  return Math.max(4, Math.min(120, Math.floor(parsed)));
}

export function getRunTimeoutMs() {
  const parsed = Number(process.env.AGENT_RUN_TIMEOUT_MS);
  if (!Number.isFinite(parsed)) return 300_000;
  return Math.max(30_000, Math.min(600_000, Math.floor(parsed)));
}

export function getMaxPromptLength() {
  const parsed = Number(process.env.MAX_PROMPT_LENGTH);
  if (!Number.isFinite(parsed)) return 8_000;
  return Math.max(100, Math.min(32_000, Math.floor(parsed)));
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new AgentAbortError();
}


export function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((p: any) => (typeof p === "string" ? p : (p?.text ?? p?.content ?? ""))).join("");
  }
  return "";
}

function parseMaybeJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return value; }
}

export function normalizeToolInput(input: unknown): unknown {
  let current = typeof input === "string" ? parseMaybeJson(input) : input;
  for (let i = 0; i < 3; i += 1) {
    if (!current || typeof current !== "object" || !("input" in current)) break;
    const nested = (current as { input?: unknown }).input;
    current = typeof nested === "string" ? parseMaybeJson(nested) : nested;
  }
  return current;
}

export function normalizeToolOutput(output: unknown): string {
  const payload = (output as any)?.content
    ?? (output as any)?.kwargs?.content
    ?? (output as any)?.output
    ?? (output as any)?.result
    ?? output;
  const text = contentToText(payload);
  const raw = text || (typeof payload === "string" ? payload : "") || "Tool completed.";
  const redacted = redactSecrets(raw);

  if (redacted.length > MAX_TOOL_OUTPUT_CHARS) {
    if (redacted.trimStart().startsWith("{") || redacted.trimStart().startsWith("[")) {
      try {
        const parsed = JSON.parse(redacted);
        const summarized = JSON.stringify(parsed, null, 0).slice(0, MAX_TOOL_OUTPUT_CHARS);
        return summarized + "\n[... JSON truncated for brevity]";
      } catch { /* fall through */ }
    }
    const head = redacted.slice(0, Math.floor(MAX_TOOL_OUTPUT_CHARS * 0.7));
    const tail = redacted.slice(-Math.floor(MAX_TOOL_OUTPUT_CHARS * 0.2));
    return `${head}\n\n... [truncated ${redacted.length - MAX_TOOL_OUTPUT_CHARS} chars] ...\n\n${tail}`;
  }
  return redacted;
}

export function compactValue(value: unknown): string {
  if (value == null) return "";
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return redactSecrets(raw).replace(/\s+/g, " ").trim();
}

export function normalizeHistory(history: ChatHistoryMessage[] = []) {
  return history
    .filter((message) => message.content.trim())
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, MAX_SINGLE_MESSAGE_CHARS),
    }));
}


const SUMMARIZE_THRESHOLD = 16;

/** Compress old history when it exceeds the threshold using LLM. */
export async function summarizeOldHistory(history: ChatHistoryMessage[]): Promise<ChatHistoryMessage[]> {
  if (history.length <= SUMMARIZE_THRESHOLD) return history;

  const keepRecent = Math.min(10, Math.floor(history.length * 0.4));
  const oldMessages = history.slice(0, history.length - keepRecent);
  const recentMessages = history.slice(history.length - keepRecent);

  const preservedUrls: string[] = [];
  const preservedDecisions: string[] = [];
  const summaryParts: string[] = [];

  for (const msg of oldMessages) {
    const urls = msg.content.match(/https?:\/\/[^\s"'<>]+/g);
    if (urls) preservedUrls.push(...urls.slice(0, 3));

    if (msg.role === "user" && msg.content.length > 5) {
      preservedDecisions.push(msg.content.slice(0, 200).replace(/\n/g, " ").trim());
    }

    const preview = msg.content.slice(0, 120).replace(/\n/g, " ").trim();
    if (preview) summaryParts.push(`[${msg.role}]: ${preview}${msg.content.length > 120 ? "..." : ""}`);
  }
  
  let llmSummary = "";
  try {
     const textToSummarize = summaryParts.join("\n");
     const prompt = `Summarize the following old conversation history in a few concise bullet points. Focus on key decisions, facts learned, and overall progress. Do not include recent context.\n\n${textToSummarize}`;
     const result = await noToolsLLM.invoke([{ role: "user", content: prompt }]);
     llmSummary = (typeof result.content === "string" ? result.content : (result.content as any)[0]?.text) ?? "";
  } catch (err) {
     console.warn(`[compressor] LLM summarization failed, falling back to naive summary: ${err}`);
  }

  let summaryContent = `[CONVERSATION SUMMARY — ${oldMessages.length} earlier messages condensed]\n`;
  if (preservedUrls.length > 0) {
    summaryContent += `Key URLs from earlier: ${[...new Set(preservedUrls)].slice(0, 5).join(", ")}\n`;
  }
  if (preservedDecisions.length > 0) {
    summaryContent += `User requests: ${preservedDecisions.slice(-4).join(" | ")}\n`;
  }
  
  if (llmSummary) {
     summaryContent += `\nExchange summary (AI Generated):\n${llmSummary}\n`;
  } else {
     summaryContent += `\nExchange summary:\n${summaryParts.slice(-6).join("\n")}\n`;
  }
  summaryContent += `[End of summary. Recent conversation follows.]`;

  return [{ role: "assistant", content: summaryContent }, ...recentMessages];
}


// ────────────────────────────────────────────────────────────────────────────
// OBSERVATION SUMMARIZERS — tool-output condensation
// ────────────────────────────────────────────────────────────────────────────

export function extractSearchResults(content: string): string {
  const lines = content.split("\n");
  const results: string[] = [];
  let charCount = 0;
  const MAX_CHARS = 3000;

  for (const line of lines) {
    if (
      line.match(/^(title|snippet|url|link|description|#|\d+\.)/i) ||
      line.match(/https?:\/\//) ||
      line.match(/^[-•*]/) ||
      line.trim().length > 20
    ) {
      if (charCount + line.length > MAX_CHARS) break;
      results.push(line);
      charCount += line.length;
    }
  }

  return results.length > 0 ? results.join("\n") : content.slice(0, MAX_CHARS) + "\n[... truncated]";
}

export function extractMainContent(content: string): string {
  const lines = content.split("\n");
  const filtered: string[] = [];
  let charCount = 0;
  const MAX_CHARS = 3500;

  const skipPatterns = [
    /^(nav|menu|footer|header|sidebar|cookie|banner|advertisement)/i,
    /^(skip to|jump to|go to|back to top)/i,
    /^(copyright|©|all rights reserved|privacy policy|terms of)/i,
    /^\s*$/,
  ];

  for (const line of lines) {
    if (skipPatterns.some((p) => p.test(line.trim()))) continue;
    if (charCount + line.length > MAX_CHARS) break;
    filtered.push(line);
    charCount += line.length;
  }
  return filtered.length > 0 ? filtered.join("\n") : content.slice(0, MAX_CHARS) + "\n[... truncated]";
}

export function extractCodeOutput(content: string): string {
  const MAX_CHARS = 3500;
  const stdoutMatch = content.match(/(?:stdout|output|result)[\s:]*\n?([\s\S]*?)(?:\n(?:stderr|error)|$)/i);
  const stderrMatch = content.match(/(?:stderr|error)[\s:]*\n?([\s\S]*?)$/i);

  let result = "";
  if (stdoutMatch?.[1]) result += "=== OUTPUT ===\n" + stdoutMatch[1].slice(0, MAX_CHARS * 0.7) + "\n";
  if (stderrMatch?.[1] && stderrMatch[1].trim()) {
    result += "=== ERRORS ===\n" + stderrMatch[1].slice(0, MAX_CHARS * 0.3) + "\n";
  }
  if (!result) {
    result = content.slice(0, Math.floor(MAX_CHARS * 0.8)) +
      "\n[...]\n" +
      content.slice(-Math.floor(MAX_CHARS * 0.2));
  }
  return result.slice(0, MAX_CHARS);
}


/**
 * Strip a leading "Plan: 1) … 2) …" / "Here's my plan" preamble from a FINAL
 * answer. The model sometimes emits its internal plan as visible content on a
 * cut-short turn; that planning scaffolding should never reach the user. We
 * remove a leading plan block (and a trailing "Let me …" promise) but leave
 * the rest of the answer intact. If the WHOLE text is just a plan, returns "".
 */
export function stripPlanPreamble(text: string): string {
  if (!text) return text;
  let out = text;

  // Remove a leading "Plan:" block — the "Plan:" label plus the numbered /
  // bulleted steps that immediately follow it, up to the first blank line or
  // first non-list line.
  out = out.replace(
    /^\s*(?:here'?s\s+(?:my|the)\s+plan|plan)\s*:?\s*(?:\n|\s)+(?:(?:\d+[).]|[-*])\s.*(?:\n|$))+/i,
    ""
  );

  // Remove a leading single-line plan like "Plan: 1) x 2) y 3) z" with no
  // newlines (the model packed it onto one line).
  out = out.replace(/^\s*(?:here'?s\s+(?:my|the)\s+plan|plan)\s*:?\s*(?:\d+[).][^\n]*?)(?=\n|$)/i, "");

  // Drop a leading "Let me …" / "I'll now …" promise line if it's the first line.
  out = out.replace(/^\s*(?:let me|i'?ll|i will|i'?m going to|next,? i)\b[^\n]*\n+/i, "");

  return out.trim();
}


/** Set up an abort signal that fires at min(userSignal abort, timeoutMs). */
export function createTimeoutSignal(
  userSignal: AbortSignal | undefined,
  timeoutMs: number
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const { AgentTimeoutError } = require("./types") as typeof import("./types");
  const timer = setTimeout(() => controller.abort(new AgentTimeoutError(timeoutMs)), timeoutMs);
  const onUserAbort = () => controller.abort(userSignal?.reason);
  userSignal?.addEventListener("abort", onUserAbort);
  const cleanup = () => {
    clearTimeout(timer);
    userSignal?.removeEventListener("abort", onUserAbort);
  };
  return { signal: controller.signal, cleanup };
}
