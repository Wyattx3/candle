/**
 * Turn-completion explainer — never return a blank/empty final answer.
 *
 * Ported from Hermes' `turn_finalizer.py` (the "turn-completion explainer",
 * L214-261). When a turn ends abnormally — empty content after retries, a
 * truncated/partial fragment, or a budget/deadline limit — Hermes converts the
 * exit reason into a single user-visible explanation instead of showing a blank
 * box. Candle previously returned a bare `⏱️ timed out` / empty placeholder.
 *
 * Two cases, mirroring Hermes:
 *   - Empty / "(empty)" sentinel  → REPLACE with the actionable explanation.
 *   - Short truncated fragment    → APPEND the reason (keep what arrived).
 * A genuine answer is returned unchanged.
 *
 * Dependency-free so it can be unit-tested in isolation.
 */

/** Terminal punctuation that marks a string as a "complete" short answer. */
const TERMINAL_PUNCT = new Set([".", "!", "?", "。", "！", "？", "`", ")", "%", "\""]);

/** Max length for a string to be treated as a possibly-truncated fragment. */
const FRAGMENT_MAX_LEN = 24;

/**
 * Map a coarse exit reason to a short, honest, user-facing explanation. Kept
 * deliberately terse (one or two sentences) — this is surfaced in the chat, not
 * a log. The wording avoids blaming the user and always implies a best-effort.
 */
export function explanationForExitReason(exitReason: string | undefined | null): string {
  const reason = (exitReason ?? "").toLowerCase();
  if (reason.includes("budget") || reason.includes("max_iteration") || reason.includes("tool")) {
    return (
      "I stopped here after using up the tool/work budget for this task. " +
      "Above is my best answer from what I gathered — if it's incomplete, ask me to continue and I'll pick up where I left off."
    );
  }
  if (reason.includes("deadline") || reason.includes("time") || reason.includes("timeout")) {
    return (
      "I ran out of time on this task before fully finishing. " +
      "Above is my best answer from what I had — ask me to continue if you need more."
    );
  }
  if (reason.includes("stall") || reason.includes("stream")) {
    return (
      "The model connection stalled before it finished responding. " +
      "Above is what I managed to recover — ask me to retry if it looks cut off."
    );
  }
  // Generic fallback for unknown abnormal exits.
  return (
    "I wasn't able to produce a complete answer this time. " +
    "Tell me to continue or rephrase and I'll try again."
  );
}

/**
 * Decide whether a final response is an empty terminal sentinel (blank or the
 * literal "(empty)" marker).
 */
export function isEmptyFinal(text: string | undefined | null): boolean {
  const t = (text ?? "").trim();
  return t === "" || t === "(empty)";
}

/**
 * Decide whether a final response is a suspiciously short truncated fragment
 * (e.g. "The") — short, and lacking sentence-ending punctuation. A real short
 * answer (e.g. "42." or "Paris") keeps its text.
 */
export function isTruncatedFragment(text: string | undefined | null): boolean {
  const t = (text ?? "").trim();
  if (t === "" || t.length > FRAGMENT_MAX_LEN) return false;
  const last = t.slice(-1);
  return !TERMINAL_PUNCT.has(last);
}

/**
 * The core port. Given the final response text and the turn's exit reason,
 * return the text that should actually be shown to the user:
 *   - empty/"(empty)"  → the explanation (replaces the blank)
 *   - short fragment   → "<fragment>\n\n<explanation>" (keeps what arrived)
 *   - real answer      → unchanged
 *
 * `isAbnormalExit` lets the caller suppress explainer behavior on healthy exits
 * (e.g. a deliberate terse "Done.") — when false, the text is returned as-is.
 */
export function explainEmptyFinal(
  finalText: string | undefined | null,
  exitReason: string | undefined | null,
  isAbnormalExit = true
): string {
  const text = finalText ?? "";
  if (!isAbnormalExit) return text;

  if (isEmptyFinal(text)) {
    return explanationForExitReason(exitReason);
  }
  if (isTruncatedFragment(text)) {
    return `${text.trim()}\n\n${explanationForExitReason(exitReason)}`;
  }
  return text;
}
