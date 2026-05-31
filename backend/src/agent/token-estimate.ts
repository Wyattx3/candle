/**
 * ============================================================================
 * ROUGH TOKEN ESTIMATION
 * ============================================================================
 * Ported from NousResearch/hermes-agent (`agent/model_metadata.py`
 * `estimate_tokens_rough`). A cheap, dependency-free heuristic for estimating
 * token counts of message lists WITHOUT a tokenizer — used for pre-flight
 * context-overflow checks and to decide when history compression should kick
 * in, before paying for a real API round-trip.
 *
 * Heuristic: ~4 characters per token for typical English/code, with a small
 * per-message overhead for role markers and JSON framing. This is intentionally
 * an OVER-estimate so we compress a little early rather than overflow.
 */

const CHARS_PER_TOKEN = 4;
/** Per-message structural overhead (role tag, delimiters, etc.). */
const PER_MESSAGE_OVERHEAD_TOKENS = 4;
/** Extra overhead per tool call (id + function wrapper). */
const PER_TOOL_CALL_OVERHEAD_TOKENS = 8;

/** Estimate tokens for a single string. */
export function estimateStringTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function contentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p: any) => {
        if (typeof p === "string") return p;
        if (p && typeof p === "object") {
          // Image parts cost ~the URL/base64 length; text parts cost their text.
          return p.text ?? p.image_url?.url ?? "";
        }
        return "";
      })
      .join("");
  }
  return "";
}

/**
 * Estimate the total token count of an OpenAI-format message list. Counts
 * content, names, and tool-call arguments, plus structural overhead.
 */
export function estimateMessagesTokens(messages: any[]): number {
  if (!Array.isArray(messages)) return 0;
  let total = 0;
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    total += PER_MESSAGE_OVERHEAD_TOKENS;
    total += estimateStringTokens(contentToString(msg.content));
    if (typeof msg.name === "string") total += estimateStringTokens(msg.name);
    if (Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        total += PER_TOOL_CALL_OVERHEAD_TOKENS;
        const args = tc?.function?.arguments;
        if (typeof args === "string") total += estimateStringTokens(args);
        if (typeof tc?.function?.name === "string") total += estimateStringTokens(tc.function.name);
      }
    }
  }
  return total;
}

/**
 * Fraction (0–1) of the model's context window the messages occupy. Useful as
 * a compression trigger: e.g. compress when this exceeds 0.6.
 */
export function contextUsageRatio(messages: any[], contextWindow: number): number {
  if (!contextWindow || contextWindow <= 0) return 0;
  return estimateMessagesTokens(messages) / contextWindow;
}
