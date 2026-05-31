/**
 * ============================================================================
 * REASONING / THINKING EXTRACTION
 * ============================================================================
 * Ported & adapted from NousResearch/hermes-agent (`agent/agent_runtime_helpers.py`
 * `extract_reasoning` and `agent/think_scrubber.py`).
 *
 * Candle's primary model is `@cf/moonshotai/kimi-k2.6` (Cloudflare Workers AI).
 * Reasoning ("thinking") can reach us in TWO shapes and a model/provider may
 * use either or both:
 *
 *   1. STRUCTURED fields on the message / streaming chunk's `additional_kwargs`:
 *        - `reasoning_content`   (Moonshot/Kimi, Novita, …)
 *        - `reasoning`           (DeepSeek, Qwen, OpenRouter unified, …)
 *        - `reasoning_details[]` (OpenRouter unified — array of
 *                                 {summary|thinking|content|text})
 *
 *   2. INLINE XML tags embedded directly in the assistant `content`:
 *        <think>…</think>, <thinking>…</thinking>, <reasoning>…</reasoning>,
 *        <thought>…</thought>, <REASONING_SCRATCHPAD>…</REASONING_SCRATCHPAD>
 *
 * Before this module Candle only read `additional_kwargs.reasoning_content` and
 * did NOTHING about inline tags — so a model that reasons via `<think>` blocks
 * leaked the raw tags (and its private chain-of-thought) straight into the
 * user-facing answer bubble and the saved history.
 *
 * This module provides pure, testable helpers plus a stateful streaming filter
 * (`ThinkStreamFilter`) that separates inline reasoning from answer text on the
 * token stream — even when a tag is split across chunk boundaries.
 */

/** Reasoning tag names we recognize (case-insensitive). */
export const REASONING_TAGS = [
  "REASONING_SCRATCHPAD",
  "thinking",
  "reasoning",
  "thought",
  "think",
] as const;

// Alternation source like "REASONING_SCRATCHPAD|thinking|reasoning|thought|think".
// Longer names first so the regex engine prefers them on a tie.
const TAG_ALT = REASONING_TAGS.join("|");

// Matches a complete block: <tag …optional attrs…> … </tag>. DOTALL via [\s\S].
const FULL_BLOCK_RE = new RegExp(
  `<(${TAG_ALT})\\b[^>]*>([\\s\\S]*?)</\\1>`,
  "gi"
);

// Matches any opening reasoning tag.
const OPEN_TAG_RE = new RegExp(`<(?:${TAG_ALT})\\b[^>]*>`, "i");
// Matches any closing reasoning tag.
const CLOSE_TAG_RE = new RegExp(`</(?:${TAG_ALT})\\s*>`, "i");
// Matches a stray opening or closing reasoning tag anywhere.
const STRAY_TAG_RE = new RegExp(`</?(?:${TAG_ALT})\\b[^>]*>`, "gi");

/** True if the text contains any inline reasoning tag (open or close). */
export function containsInlineReasoning(text: string): boolean {
  if (!text) return false;
  return OPEN_TAG_RE.test(text) || CLOSE_TAG_RE.test(text);
}

/**
 * Pull every inline reasoning block out of `content`. Returns the joined
 * reasoning text (blocks separated by a blank line) and the content with all
 * reasoning blocks AND stray reasoning tags removed.
 *
 * Handles the common "ran out of tokens mid-thought" case: an opening tag with
 * no matching close. Everything from that opening tag to the end is treated as
 * reasoning so the dangling tag never leaks into the answer.
 */
export function extractInlineReasoning(content: string): {
  reasoning: string;
  cleaned: string;
} {
  if (!content || typeof content !== "string") {
    return { reasoning: "", cleaned: content ?? "" };
  }

  const parts: string[] = [];
  let cleaned = content.replace(FULL_BLOCK_RE, (_m, _tag, inner) => {
    const trimmed = String(inner).trim();
    if (trimmed) parts.push(trimmed);
    return "";
  });

  // Unterminated reasoning block: opening tag with no matching close. Capture
  // from the opening tag to end-of-string as reasoning, drop it from content.
  const openMatch = cleaned.match(OPEN_TAG_RE);
  if (openMatch && openMatch.index !== undefined) {
    const after = cleaned.slice(openMatch.index + openMatch[0].length);
    // Only treat as dangling reasoning if there is no later close tag (there
    // isn't, since FULL_BLOCK_RE already consumed balanced pairs).
    const trimmed = after.trim();
    if (trimmed) parts.push(trimmed);
    cleaned = cleaned.slice(0, openMatch.index);
  }

  // Remove any stray orphan open/close tags that slipped through.
  cleaned = cleaned.replace(STRAY_TAG_RE, "");

  return { reasoning: parts.join("\n\n").trim(), cleaned: cleaned.trim() };
}

/**
 * Remove inline reasoning blocks (and stray tags) from text, discarding the
 * reasoning. Thin wrapper over `extractInlineReasoning` for callers that only
 * want clean answer content.
 */
export function stripInlineReasoning(content: string): string {
  return extractInlineReasoning(content).cleaned;
}

/**
 * Extract reasoning from the STRUCTURED fields of a LangChain/OpenAI message or
 * streaming chunk. Mirrors Hermes' `extract_reasoning`, reading (in order):
 *   - additional_kwargs.reasoning_content
 *   - additional_kwargs.reasoning
 *   - additional_kwargs.reasoning_details[] (summary|thinking|content|text)
 * Also tolerates these fields sitting directly on the object (some SDKs hoist
 * them) rather than under `additional_kwargs`.
 *
 * Returns the combined reasoning text, or "" when there is none.
 */
export function extractStructuredReasoning(message: any): string {
  if (!message || typeof message !== "object") return "";

  const kwargs = (message.additional_kwargs && typeof message.additional_kwargs === "object")
    ? message.additional_kwargs
    : {};

  const parts: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string") {
      const t = v.trim();
      if (t && !parts.includes(t)) parts.push(t);
    }
  };

  // Field may live on additional_kwargs (LangChain) or directly on the message.
  push(kwargs.reasoning_content);
  push(message.reasoning_content);
  push(kwargs.reasoning);
  push(message.reasoning);

  const details = kwargs.reasoning_details ?? message.reasoning_details;
  if (Array.isArray(details)) {
    for (const d of details) {
      if (d && typeof d === "object") {
        push((d as any).summary ?? (d as any).thinking ?? (d as any).content ?? (d as any).text);
      }
    }
  }

  return parts.join("\n\n").trim();
}

/**
 * Stateful streaming filter that pulls inline reasoning OUT of a token stream.
 * Feed it chunks; it returns `{ answer, reasoning }` for that chunk where:
 *   - `reasoning` is text that was inside a reasoning tag
 *   - `answer`    is the visible text outside any reasoning tag
 *
 * Tags may be split across chunk boundaries, so the filter holds back a small
 * trailing tail that looks like the start of a tag until it can resolve it.
 *
 * Designed to run AFTER `HermesStreamFilter` (which removes Kimi tool tokens),
 * so it only ever sees plain prose + reasoning tags.
 */
export class ThinkStreamFilter {
  private buf = "";
  private inReasoning = false;

  /** Longest tag string we might need to recognize, to bound the held tail. */
  private static readonly MAX_TAG_LEN = "</REASONING_SCRATCHPAD>".length;

  push(chunk: string): { answer: string; reasoning: string } {
    if (!chunk) return { answer: "", reasoning: "" };
    this.buf += chunk;
    let answer = "";
    let reasoning = "";

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this.inReasoning) {
        const close = this.matchTag(CLOSE_TAG_RE);
        if (!close) {
          // Still inside reasoning. Emit what we safely can, holding back a
          // tail that might be a partial close tag.
          const safe = this.takeSafePrefix();
          reasoning += safe;
          return { answer, reasoning };
        }
        reasoning += this.buf.slice(0, close.index);
        this.buf = this.buf.slice(close.index + close.length);
        this.inReasoning = false;
        continue;
      }

      const open = this.matchTag(OPEN_TAG_RE);
      if (!open) {
        const safe = this.takeSafePrefix();
        answer += safe;
        return { answer, reasoning };
      }
      answer += this.buf.slice(0, open.index);
      this.buf = this.buf.slice(open.index + open.length);
      this.inReasoning = true;
    }
  }

  /** Flush any remainder at the end of a model run. */
  flush(): { answer: string; reasoning: string } {
    const remainder = this.buf;
    this.buf = "";
    if (this.inReasoning) {
      // Unterminated reasoning block — keep it as reasoning, never answer.
      this.inReasoning = false;
      return { answer: "", reasoning: remainder };
    }
    return { answer: remainder, reasoning: "" };
  }

  /**
   * Find the first complete tag matching `re` in the buffer. Returns its index
   * and matched length, or null if none is fully present yet.
   */
  private matchTag(re: RegExp): { index: number; length: number } | null {
    const m = re.exec(this.buf);
    if (!m || m.index === undefined) return null;
    return { index: m.index, length: m[0].length };
  }

  /**
   * Return the portion of the buffer that is safe to emit now — everything up
   * to a possible partial tag at the very end. A '<' with no matching '>' (and
   * short enough to still be completing a tag) is held back for the next chunk.
   */
  private takeSafePrefix(): string {
    const lastLt = this.buf.lastIndexOf("<");
    if (lastLt !== -1) {
      const tail = this.buf.slice(lastLt);
      // If the tail has no '>' and is short enough to be a forming tag, hold it.
      if (!tail.includes(">") && tail.length <= ThinkStreamFilter.MAX_TAG_LEN) {
        const out = this.buf.slice(0, lastLt);
        this.buf = tail;
        return out;
      }
    }
    const out = this.buf;
    this.buf = "";
    return out;
  }
}
