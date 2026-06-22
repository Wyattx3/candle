/**
 * ============================================================================
 * UNIFIED MODEL-AGNOSTIC TOOL-CALL RECOVERY
 * ============================================================================
 * Single source of truth for recovering tool calls that a provider leaked as
 * plain assistant text instead of parsing them into structured `tool_calls`.
 * Mirrors Hermes' `_extract_tool_calls_from_text`: ONE entry point, multiple
 * format patterns tried in priority order, all normalized to ONE canonical
 * structure. Adding support for a new provider's leak format means adding a
 * pattern here — never a new file or a new branch scattered across the loop.
 *
 * Why this exists: OpenAI-compatible endpoints (Cloudflare Workers AI, Ollama,
 * vLLM, …) serving open models frequently fail to parse the model's NATIVE
 * tool-call tokens, emitting them as assistant text. The loop then sees an
 * empty `tool_calls` array, treats the markup as a final answer, runs no tool,
 * and streams raw markup to the user. Each model family has its own markup:
 *
 *   Kimi / Moonshot:   <|tool_calls_section_begin|>
 *                        <|tool_call_begin|>functions.NAME:0
 *                          <|tool_call_argument_begin|>{"q":"…"}
 *                        <|tool_call_end|>
 *                      <|tool_calls_section_end|>
 *
 *   GLM (4 / 4.5 / 5):  <tool_call>NAME
 *                         <arg_key>q</arg_key><arg_value>…</arg_value>
 *                       </tool_call>
 *
 *   JSON-in-tag:        <tool_call>{"name":"NAME","arguments":{…}}</tool_call>
 *   Parenthesized:      <tool_call>NAME(q="…")
 *   Bare function JSON: {"id":"…","type":"function","function":{"name":"NAME",…}}
 *
 * This module provides:
 *   1. `extractToolCallsFromText` — recover canonical tool calls from any of
 *      the above and return the text with the markup removed.
 *   2. `stripToolCallTokens`      — remove tool-call markup from any blob.
 *   3. `ToolCallStreamFilter`     — stateful chunk filter so markup never
 *      reaches the UI during token-by-token streaming (markers can split
 *      across chunk boundaries).
 *
 * Defensive by design: anything it cannot parse it strips rather than leak.
 */

import { repairToolCallArguments } from "./message-sanitization";

/** Canonical recovered tool call — shaped for LangChain's `response.tool_calls`. */
export interface RecoveredToolCall {
  name: string;
  args: Record<string, unknown>;
  id: string;
  type: "tool_call";
}

/**
 * Open/close marker pairs that wrap tool-call markup. Order matters for the
 * stream filter: the Kimi SECTION pair is checked before the bare call pair so
 * a full section is suppressed as one unit. `<tool_call>` (GLM) is independent.
 */
const MARKER_PAIRS: ReadonlyArray<{ open: string; close: string }> = [
  { open: "<|tool_calls_section_begin|>", close: "<|tool_calls_section_end|>" },
  { open: "<|tool_call_begin|>", close: "<|tool_call_end|>" },
  { open: "<tool_call>", close: "</tool_call>" },
];

/** Every standalone marker token, for final stray-marker scrubbing. */
const ALL_MARKERS: readonly string[] = [
  "<|tool_calls_section_begin|>",
  "<|tool_calls_section_end|>",
  "<|tool_call_begin|>",
  "<|tool_call_argument_begin|>",
  "<|tool_call_end|>",
  "<tool_call>",
  "</tool_call>",
  "<arg_key>",
  "</arg_key>",
  "<arg_value>",
  "</arg_value>",
];

const LONGEST_MARKER = Math.max(...ALL_MARKERS.map((m) => m.length));

/** Quick check — true if `text` contains any tool-call marker. */
export function containsToolCallTokens(text: string): boolean {
  if (!text) return false;
  return (
    text.includes("<|tool_call_begin|>") ||
    text.includes("<|tool_calls_section_begin|>") ||
    text.includes("<tool_call>") ||
    text.includes("</tool_call>") ||
    text.includes("<arg_value>")
  );
}

/** Strip a `functions.`/`tools.` namespace and a trailing `:index` suffix. */
function normalizeToolName(raw: string): string {
  let name = raw.trim();
  const dot = name.lastIndexOf(".");
  if (dot !== -1) name = name.slice(dot + 1);
  const colon = name.indexOf(":");
  if (colon !== -1) name = name.slice(0, colon);
  return name.trim();
}

let recoveryCounter = 0;
function makeCall(name: string, args: Record<string, unknown>): RecoveredToolCall {
  recoveryCounter += 1;
  return { name, args, id: `recovered_${name}_${recoveryCounter}`, type: "tool_call" };
}

/** Parse an args JSON string, repairing common malformations before giving up. */
function parseArgsJson(raw: string, toolName: string): Record<string, unknown> {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { value: parsed };
  } catch {
    const { repaired } = repairToolCallArguments(trimmed, toolName);
    try {
      const reparsed = JSON.parse(repaired);
      return reparsed && typeof reparsed === "object" && !Array.isArray(reparsed) ? reparsed : {};
    } catch {
      return {};
    }
  }
}

/** Coerce a raw GLM `<arg_value>` string toward its JSON type, else keep string. */
function coerceArgValue(raw: string): unknown {
  const v = raw.trim();
  if (!v) return "";
  if (/^(-?\d+(\.\d+)?|true|false|null|\[[\s\S]*\]|\{[\s\S]*\}|".*")$/.test(v)) {
    try {
      return JSON.parse(v);
    } catch {
      /* fall through */
    }
  }
  return v;
}

/** Parse a GLM `<arg_key>k</arg_key><arg_value>v</arg_value>` body. */
function parseArgKeyValueBody(body: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const pairRe = /<arg_key>([\s\S]*?)<\/arg_key>\s*<arg_value>([\s\S]*?)<\/arg_value>/g;
  let m: RegExpExecArray | null;
  while ((m = pairRe.exec(body)) !== null) {
    const key = m[1].trim();
    if (key) args[key] = coerceArgValue(m[2]);
  }
  return args;
}

/** Parse a parenthesized `name(k="v", n=3)` arg list. Best-effort. */
function parseParenArgs(argString: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const argRe = /([A-Za-z_]\w*)\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^,()]+)/g;
  let m: RegExpExecArray | null;
  while ((m = argRe.exec(argString)) !== null) {
    const key = m[1].trim();
    let rawVal = m[2].trim();
    if ((rawVal.startsWith('"') && rawVal.endsWith('"')) || (rawVal.startsWith("'") && rawVal.endsWith("'"))) {
      args[key] = rawVal.slice(1, -1);
    } else {
      args[key] = coerceArgValue(rawVal);
    }
  }
  return args;
}

/**
 * Interpret the inner body of a `<tool_call>…</tool_call>` (or an unterminated
 * `<tool_call>…`) block, which may be JSON, GLM key/value, or parenthesized.
 * Returns a recovered call, or null if no tool name can be found.
 */
function parseTagBlock(inner: string): RecoveredToolCall | null {
  const trimmedInner = inner.trim();

  // (a) JSON-in-tag: <tool_call>{"name":"…","arguments":{…}}</tool_call>
  // Also tolerates Hermes' {"function":{"name":…,"arguments":…}} envelope.
  if (trimmedInner.startsWith("{")) {
    const fromJson = parseFunctionJson(trimmedInner);
    if (fromJson) return fromJson;
  }

  // The tool name is everything up to the first <arg_key>, "(", or newline.
  const firstArgKey = inner.indexOf("<arg_key>");
  const firstParen = inner.indexOf("(");
  let headEnd = inner.length;
  if (firstArgKey !== -1) headEnd = Math.min(headEnd, firstArgKey);
  if (firstParen !== -1) headEnd = Math.min(headEnd, firstParen);
  if (firstArgKey === -1 && firstParen === -1) {
    const nl = inner.indexOf("\n");
    if (nl !== -1) headEnd = nl;
  }
  const name = normalizeToolName(inner.slice(0, headEnd));
  if (!name) return null;

  // (b) GLM key/value body.
  if (firstArgKey !== -1) return makeCall(name, parseArgKeyValueBody(inner));

  // (c) Parenthesized body.
  if (firstParen !== -1) {
    const close = inner.lastIndexOf(")");
    const argString = inner.slice(firstParen + 1, close === -1 ? inner.length : close);
    return makeCall(name, parseParenArgs(argString));
  }

  // (d) Bare name with no args.
  return makeCall(name, {});
}

/** Parse a `{"name":…,"arguments":…}` or `{"function":{…}}` object (repairing if needed). */
function parseFunctionJson(rawJson: string): RecoveredToolCall | null {
  const attempts = [rawJson];
  const { repaired } = repairToolCallArguments(rawJson, "?");
  if (repaired !== rawJson) attempts.push(repaired);
  for (const candidate of attempts) {
    try {
      const obj = JSON.parse(candidate);
      if (!obj || typeof obj !== "object") continue;
      const fn = obj.function && typeof obj.function === "object" ? obj.function : obj;
      const name = typeof fn?.name === "string" ? fn.name.trim() : "";
      if (!name) continue;
      const rawArgs = fn?.arguments;
      let args: Record<string, unknown> = {};
      if (typeof rawArgs === "string") args = parseArgsJson(rawArgs, name);
      else if (rawArgs && typeof rawArgs === "object") args = rawArgs;
      return makeCall(normalizeToolName(name), args);
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

// Bare function-call JSON (no tags) — Hermes' fallback shape.
const BARE_FUNCTION_JSON_RE =
  /\{\s*"id"\s*:\s*"[^"]*"\s*,\s*"type"\s*:\s*"function"\s*,\s*"function"\s*:\s*\{[\s\S]*?\}\s*\}/g;

/**
 * Recover tool calls from a text blob, trying each known format in priority
 * order. Returns the recovered calls (possibly empty) and the text with all
 * recognized tool-call markup removed.
 */
export function extractToolCallsFromText(text: string): {
  toolCalls: RecoveredToolCall[];
  cleanedText: string;
} {
  const toolCalls: RecoveredToolCall[] = [];
  if (!text) return { toolCalls, cleanedText: "" };

  // 1. Kimi/Moonshot native tuples (with or without a section wrapper).
  const kimiRe = /<\|tool_call_begin\|>([\s\S]*?)<\|tool_call_argument_begin\|>([\s\S]*?)<\|tool_call_end\|>/g;
  let m: RegExpExecArray | null;
  while ((m = kimiRe.exec(text)) !== null) {
    const name = normalizeToolName(m[1]);
    if (name) toolCalls.push(makeCall(name, parseArgsJson(m[2], name)));
  }

  // 2. GLM / JSON-in-tag / parenthesized — anything wrapped in <tool_call>…</tool_call>.
  const tagRe = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  while ((m = tagRe.exec(text)) !== null) {
    const call = parseTagBlock(m[1]);
    if (call) toolCalls.push(call);
  }

  // 3. Unterminated `<tool_call>…` (no closing tag) — common when the call is
  // the whole turn or the stream was cut. Only if nothing matched above.
  if (toolCalls.length === 0) {
    const open = text.indexOf("<tool_call>");
    if (open !== -1) {
      const call = parseTagBlock(text.slice(open + "<tool_call>".length));
      if (call) toolCalls.push(call);
    }
  }

  // 4. Bare function-call JSON fallback — only when no tagged calls were found.
  if (toolCalls.length === 0) {
    while ((m = BARE_FUNCTION_JSON_RE.exec(text)) !== null) {
      const call = parseFunctionJson(m[0]);
      if (call) toolCalls.push(call);
    }
  }

  return { toolCalls, cleanedText: stripToolCallTokens(text) };
}

/** Remove every tool-call marker (and the text between begin/end) from a blob. */
export function stripToolCallTokens(text: string): string {
  if (!text) return "";
  let out = text;

  // Complete Kimi sections, then bare Kimi tuples.
  out = out.replace(/<\|tool_calls_section_begin\|>[\s\S]*?<\|tool_calls_section_end\|>/g, "");
  out = out.replace(/<\|tool_call_begin\|>[\s\S]*?<\|tool_call_end\|>/g, "");
  // Complete GLM blocks.
  out = out.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "");

  // Unclosed openers — drop from the earliest dangling opener to end.
  for (const opener of ["<|tool_calls_section_begin|>", "<|tool_call_begin|>", "<tool_call>"]) {
    const idx = out.indexOf(opener);
    if (idx !== -1) out = out.slice(0, idx);
  }

  // Stray arg markup with no wrapping block (truncated leaks).
  out = out.replace(/<arg_key>[\s\S]*?<\/arg_key>/g, "");
  out = out.replace(/<arg_value>[\s\S]*?<\/arg_value>/g, "");

  // Any leftover individual markers.
  for (const marker of ALL_MARKERS) out = out.split(marker).join("");
  return out.trim();
}

/**
 * Stateful streaming filter. Feed it chunks; it returns only text safe to
 * display, suppressing anything inside a tool-call block and holding back a
 * partial trailing marker that may complete on the next chunk. Handles every
 * marker pair in `MARKER_PAIRS` uniformly.
 */
export class ToolCallStreamFilter {
  private buf = "";
  /** The close marker we're waiting for while suppressing, or null. */
  private waitingFor: string | null = null;

  push(chunk: string): string {
    if (!chunk) return "";
    this.buf += chunk;
    let out = "";

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this.waitingFor) {
        const end = this.buf.indexOf(this.waitingFor);
        if (end === -1) {
          // Still inside a block — drop all but a short tail (the close marker
          // may be split across the next chunk).
          if (this.buf.length > LONGEST_MARKER) this.buf = this.buf.slice(-LONGEST_MARKER);
          return out;
        }
        this.buf = this.buf.slice(end + this.waitingFor.length);
        this.waitingFor = null;
        continue;
      }

      // Find the earliest opener of any pair in the buffer.
      let bestIdx = -1;
      let bestPair: (typeof MARKER_PAIRS)[number] | null = null;
      for (const pair of MARKER_PAIRS) {
        const idx = this.buf.indexOf(pair.open);
        if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
          bestIdx = idx;
          bestPair = pair;
        }
      }

      if (bestPair) {
        out += this.buf.slice(0, bestIdx);
        this.buf = this.buf.slice(bestIdx + bestPair.open.length);
        this.waitingFor = bestPair.close;
        continue;
      }

      // No opener present. Emit everything except a possible partial trailing
      // marker (a "<" that could be the start of any opener).
      const lastLt = this.buf.lastIndexOf("<");
      if (lastLt !== -1) {
        const tail = this.buf.slice(lastLt);
        if (!tail.includes(">") && MARKER_PAIRS.some((p) => p.open.startsWith(tail))) {
          out += this.buf.slice(0, lastLt);
          this.buf = tail;
          return out;
        }
      }
      out += this.buf;
      this.buf = "";
      return out;
    }
  }

  /** Emit any safe remainder at the end of a model run. */
  flush(): string {
    if (this.waitingFor) {
      // Unterminated block — discard it entirely rather than leak markup.
      this.buf = "";
      this.waitingFor = null;
      return "";
    }
    const remainder = stripToolCallTokens(this.buf);
    this.buf = "";
    return remainder;
  }
}
