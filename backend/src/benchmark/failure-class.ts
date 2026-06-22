/**
 * Failure-class triage for GAIA results.
 *
 * Separates INFRASTRUCTURE failures (the run never produced an answer — a
 * timeout or empty completion) from QUALITY failures (it answered but got it
 * wrong — a precision/normalization slip vs. a research-depth/source miss).
 * The two need completely different fixes, so bucketing them makes each
 * benchmark iteration actionable instead of a single opaque pass-rate.
 *
 * Kept in its own module (not run-gaia.ts) because the runner auto-executes
 * `main()` on import; this lets the classifier be unit-tested in isolation.
 */

export type FailureClass =
  | "pass"
  | "error"
  | "timeout_0_tools"
  | "timeout"
  | "empty"
  | "precision"
  | "depth";

export interface FailureClassInput {
  correct: boolean;
  error?: string;
  modelAnswer: string;
  toolCallCount: number;
  durationMs: number;
}

export function classifyFailure(r: FailureClassInput): FailureClass {
  if (r.correct) return "pass";
  if (r.error) return "error";
  const ans = (r.modelAnswer ?? "").trim();
  // A timeout can surface three ways: the legacy `⏱️` banner placeholder, a raw
  // "timed out" message, OR the turn-explainer's user-friendly phrasing ("I ran
  // out of time on this task…"). The explainer was added to replace the mojibake
  // placeholder for real users — but for SCORING it's still a timeout, so we must
  // recognise it here or timeouts silently re-bucket as precision/depth.
  const timedOut =
    ans.startsWith("⏱️") ||
    /timed out/i.test(ans) ||
    /ran out of time/i.test(ans) ||
    /best answer from what I had/i.test(ans);
  if (timedOut) return r.toolCallCount === 0 ? "timeout_0_tools" : "timeout";
  if (ans === "") return "empty";
  // Leaked planning preamble / repetition-collapse as the "answer" with 0 tool
  // calls is a throttle-degeneration artifact, not a real quality miss — the
  // model never produced a genuine attempt ("Let me read the file…", "Plan: 1)…",
  // or "Let me ...Let me ..." garbage) before the turn aborted. Bucket it as an
  // infra failure ("empty") so --retries re-runs it instead of recording a false
  // quality failure. Only fires with 0 tools, so a real answer that happens to
  // open with "I'll" after doing work is unaffected.
  const noGenuineAttempt =
    r.toolCallCount === 0 &&
    (/^(let me\b|i'?ll\b|first,?\s+i\b|i need to\b|i will\b|plan:|i'?m going to\b|step\s*1)/i.test(ans) ||
      /(let me\b.*){3,}/is.test(ans));
  if (noGenuineAttempt) return "empty";
  // Answered but wrong. Heuristic split: if it used research tools it's more
  // likely a depth/source miss; otherwise a precision/normalization slip.
  return r.toolCallCount >= 3 ? "depth" : "precision";
}
