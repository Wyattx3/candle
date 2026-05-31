/**
 * ============================================================================
 * HERMES / KIMI NATIVE TOOL-TOKEN RECOVERY
 * ============================================================================
 * Some OpenAI-compatible providers (notably Cloudflare Workers AI serving
 * `@cf/moonshotai/kimi-k2.*`) sometimes emit the model's NATIVE tool-call
 * tokens as plain assistant text instead of parsing them into structured
 * `tool_calls`. The raw output looks like:
 *
 *   <|tool_calls_section_begin|>
 *     <|tool_call_begin|>functions.search_web:0<|tool_call_argument_begin|>
 *     {"query": "..."}
 *     <|tool_call_end|>
 *   <|tool_calls_section_end|>
 *
 * When that happens the agent loop sees an empty `tool_calls` array, treats
 * the tokens as a final answer, and streams the raw markers to the user while
 * the tool never executes. This module:
 *
 *   1. `parseHermesToolCalls` — recovers structured tool calls from the text
 *      so the graph can actually run them.
 *   2. `stripHermesToolTokens` — removes the markers from any text blob.
 *   3. `HermesStreamFilter` — a stateful chunk filter so the markers never
 *      reach the UI during token-by-token streaming (markers can be split
 *      across chunks).
 *
 * Defensive by design: anything it cannot parse it strips rather than leak.
 */

import { repairToolCallArguments } from "./message-sanitization";

export const HERMES_MARKERS = {
  sectionBegin: "<|tool_calls_section_begin|>",
  sectionEnd: "<|tool_calls_section_end|>",
  callBegin: "<|tool_call_begin|>",
  argBegin: "<|tool_call_argument_begin|>",
  callEnd: "<|tool_call_end|>",
} as const;

/** Quick check — true if the text contains any Hermes/Kimi tool-call marker. */
export function containsHermesToolTokens(text: string): boolean {
  if (!text) return false;
  return (
    text.includes(HERMES_MARKERS.callBegin) ||
    text.includes(HERMES_MARKERS.sectionBegin)
  );
}

export interface RecoveredToolCall {
  name: string;
  args: Record<string, unknown>;
  id: string;
  type: "tool_call";
}

/** Normalize a raw call identifier like `functions.search_web:0` → `search_web`. */
function normalizeToolName(raw: string): string {
  let name = raw.trim();
  // Strip a leading namespace such as `functions.` or `tools.`.
  const dot = name.lastIndexOf(".");
  if (dot !== -1) name = name.slice(dot + 1);
  // Strip a trailing `:<index>` the model appends to disambiguate calls.
  const colon = name.indexOf(":");
  if (colon !== -1) name = name.slice(0, colon);
  return name.trim();
}

let recoveryCounter = 0;

/**
 * Parse Hermes/Kimi tool-call tokens out of a text blob. Returns the recovered
 * calls (possibly empty) and the text with all tool-call markup removed.
 */
export function parseHermesToolCalls(text: string): {
  toolCalls: RecoveredToolCall[];
  cleanedText: string;
} {
  const toolCalls: RecoveredToolCall[] = [];
  if (!text) return { toolCalls, cleanedText: "" };

  // Match each call tuple: <|tool_call_begin|> NAME <|tool_call_argument_begin|> ARGS <|tool_call_end|>
  const callRe =
    /<\|tool_call_begin\|>([\s\S]*?)<\|tool_call_argument_begin\|>([\s\S]*?)<\|tool_call_end\|>/g;

  let match: RegExpExecArray | null;
  while ((match = callRe.exec(text)) !== null) {
    const name = normalizeToolName(match[1]);
    if (!name) continue;
    const rawArgs = (match[2] ?? "").trim();
    let args: Record<string, unknown> = {};
    if (rawArgs) {
      try {
        const parsed = JSON.parse(rawArgs);
        args = parsed && typeof parsed === "object" ? parsed : { value: parsed };
      } catch {
        // Malformed JSON — try the tool-call argument repairer (trailing
        // commas, unclosed braces, control chars) before giving up empty.
        const { repaired } = repairToolCallArguments(rawArgs, name);
        try {
          const reparsed = JSON.parse(repaired);
          args = reparsed && typeof reparsed === "object" ? reparsed : {};
        } catch {
          args = {};
        }
      }
    }
    recoveryCounter += 1;
    toolCalls.push({
      name,
      args,
      id: `recovered_${name}_${Date.now()}_${recoveryCounter}`,
      type: "tool_call",
    });
  }

  return { toolCalls, cleanedText: stripHermesToolTokens(text) };
}

/** Remove every Hermes/Kimi tool-call marker (and any text between them). */
export function stripHermesToolTokens(text: string): string {
  if (!text) return "";
  let out = text;

  // 1. Remove complete sections, begin..end.
  out = out.replace(
    /<\|tool_calls_section_begin\|>[\s\S]*?<\|tool_calls_section_end\|>/g,
    ""
  );
  // 2. Remove an unclosed section (begin without a matching end).
  const danglingBegin = out.indexOf(HERMES_MARKERS.sectionBegin);
  if (danglingBegin !== -1) out = out.slice(0, danglingBegin);
  // 3. Remove standalone call tuples that lacked a section wrapper.
  out = out.replace(
    /<\|tool_call_begin\|>[\s\S]*?<\|tool_call_end\|>/g,
    ""
  );
  // 4. Remove any stray individual markers.
  for (const marker of Object.values(HERMES_MARKERS)) {
    out = out.split(marker).join("");
  }
  return out.trim();
}

/**
 * Stateful streaming filter. Feed it chunks; it returns only the text that is
 * safe to display, suppressing anything inside a tool-call section and holding
 * back partial trailing markers that may complete on the next chunk.
 */
export class HermesStreamFilter {
  private buf = "";
  private suppressing = false;

  push(chunk: string): string {
    if (!chunk) return "";
    this.buf += chunk;
    let out = "";

    // Longest marker length, used to bound the held-back tail.
    const maxMarker = HERMES_MARKERS.argBegin.length;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this.suppressing) {
        const end = this.buf.indexOf(HERMES_MARKERS.sectionEnd);
        if (end === -1) {
          // Still inside a section — drop everything but keep a small tail in
          // case the end marker is split across the next chunk.
          if (this.buf.length > maxMarker) this.buf = this.buf.slice(-maxMarker);
          return out;
        }
        this.buf = this.buf.slice(end + HERMES_MARKERS.sectionEnd.length);
        this.suppressing = false;
        continue;
      }

      const begin = this.buf.indexOf(HERMES_MARKERS.sectionBegin);
      if (begin !== -1) {
        out += this.buf.slice(0, begin);
        this.buf = this.buf.slice(begin + HERMES_MARKERS.sectionBegin.length);
        this.suppressing = true;
        continue;
      }

      // Also suppress bare call tuples that arrive without a section wrapper.
      const callBegin = this.buf.indexOf(HERMES_MARKERS.callBegin);
      if (callBegin !== -1) {
        const callEnd = this.buf.indexOf(HERMES_MARKERS.callEnd, callBegin);
        if (callEnd === -1) {
          // Wait for the rest of the tuple. Emit text before the call marker.
          out += this.buf.slice(0, callBegin);
          this.buf = this.buf.slice(callBegin);
          return out;
        }
        out += this.buf.slice(0, callBegin);
        this.buf = this.buf.slice(callEnd + HERMES_MARKERS.callEnd.length);
        continue;
      }

      // No markers. Emit everything except a possible partial trailing marker.
      const lastLt = this.buf.lastIndexOf("<");
      if (lastLt !== -1) {
        const tail = this.buf.slice(lastLt);
        const looksPartial = tail === "<" || tail.startsWith("<|");
        if (looksPartial && !tail.includes("|>")) {
          out += this.buf.slice(0, lastLt);
          this.buf = this.buf.slice(lastLt);
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
    if (this.suppressing) {
      this.buf = "";
      this.suppressing = false;
      return "";
    }
    const remainder = stripHermesToolTokens(this.buf);
    this.buf = "";
    return remainder;
  }
}
