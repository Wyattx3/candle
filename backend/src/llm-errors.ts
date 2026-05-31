/**
 * ============================================================================
 * LLM ERROR CLASSIFIER (Hermes-style)
 * ============================================================================
 * Classifies errors thrown by the LangChain `ChatOpenAI` client (or any
 * underlying HTTP fetch) into a stable taxonomy so the retry/failover policy
 * can make consistent decisions.
 *
 * The classifier is intentionally permissive on retry: when in doubt, retry.
 * Anything that looks user-induced (auth, schema, prompt size) bubbles up
 * immediately so we don't silently mask config bugs.
 */

export type LlmErrorClass =
  | "auth"            // 401, 403, invalid api key, signature mismatch
  | "bad_request"     // 400 with schema/validation errors
  | "rate_limit"      // 429
  | "quota"           // monthly quota exhausted, billing
  | "timeout"         // ETIMEDOUT, AbortError due to timeout, gateway timeouts
  | "network"         // ECONNRESET, ENOTFOUND, EAI_AGAIN, etc.
  | "server"          // 500, 502, 503, 504, "internal error"
  | "model_unavailable" // model name not found, capacity exceeded
  | "context_length"  // token limit exceeded
  | "content_policy"  // provider safety filter rejected the prompt (deterministic)
  | "unknown";

export interface LlmErrorClassification {
  /** Stable error class — drives retry/failover decisions. */
  class: LlmErrorClass;
  /** True when the same call is likely to succeed if we wait + retry. */
  retryable: boolean;
  /** True when failing over to a secondary provider is likely to help. */
  failoverable: boolean;
  /** Sanitized human-readable summary for logs. */
  summary: string;
  /** Original status code if extractable, else undefined. */
  statusCode?: number;
}

const REDACT = [
  /sk-[A-Za-z0-9_-]{12,}/g,           // OpenAI-style keys
  /eyJ[A-Za-z0-9_.-]{20,}/g,          // JWT-ish tokens
  /Bearer\s+[A-Za-z0-9._-]+/gi,       // Authorization headers
  /api[_-]?key["'=\s:]+[A-Za-z0-9_-]+/gi,
];

function sanitize(text: string): string {
  let out = text;
  for (const pattern of REDACT) {
    out = out.replace(pattern, "<redacted>");
  }
  return out;
}

/**
 * Content-policy / safety-filter phrases (ported from Hermes error_classifier).
 * Each is a verbatim provider phrase narrow enough not to collide with
 * billing/auth/format errors. A match means the provider deterministically
 * refused THIS prompt — retrying unchanged is wasteful.
 */
const CONTENT_POLICY_PATTERNS = [
  "flagged for possible cybersecurity risk",
  "violates our usage policies",
  "violates openai's usage policies",
  "your request was flagged by",
  "prompt was flagged by our safety",
  "responses cannot be generated due to safety",
  "content_filter",
  "responsibleaipolicyviolation",
];

/** Billing-exhaustion phrases — distinct from transient rate limits. */
const BILLING_PATTERNS = [
  "insufficient credits",
  "insufficient_quota",
  "insufficient balance",
  "credit balance",
  "credits exhausted",
  "payment required",
  "billing hard limit",
  "exceeded your current quota",
  "account is deactivated",
  "out of funds",
  "balance_depleted",
];

function extractStatus(error: any): number | undefined {
  const direct = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
  if (Number.isFinite(direct) && direct >= 100) return direct;

  const msg = String(error?.message ?? "");
  const match = msg.match(/\b(4\d\d|5\d\d)\b/);
  return match ? Number(match[1]) : undefined;
}

/**
 * Classify an arbitrary error coming out of an LLM call. The function is
 * defensive — anything we can't confidently bucket goes to `unknown` with
 * `retryable=true` so the existing exponential backoff still gets a chance.
 */
export function classifyLlmError(error: any): LlmErrorClassification {
  const message = sanitize(String(error?.message ?? error ?? "")).slice(0, 500);
  const lower = message.toLowerCase();
  const status = extractStatus(error);
  const code = String(error?.code ?? "").toUpperCase();
  const errType = String(error?.type ?? error?.error?.type ?? "").toLowerCase();

  // Content-policy / safety-filter blocks (ported from Hermes error_classifier).
  // The provider made a DETERMINISTIC refusal about this exact prompt — retrying
  // unchanged just reproduces it and burns attempts. Don't retry; failover may
  // help if the secondary provider has a different policy. Must run BEFORE the
  // status checks so a 400 safety block isn't downgraded to bad_request.
  if (CONTENT_POLICY_PATTERNS.some((p) => lower.includes(p))) {
    return { class: "content_policy", retryable: false, failoverable: true, summary: message, statusCode: status };
  }

  // Auth — never retry, never failover. Almost always a misconfiguration.
  if (
    status === 401 || status === 403 ||
    /invalid[_\s]api[_\s]key|invalid[_\s]token|unauthorized|forbidden|signature[_\s]mismatch/.test(lower) ||
    errType === "authentication_error"
  ) {
    return { class: "auth", retryable: false, failoverable: false, summary: message, statusCode: status };
  }

  // Quota / billing — retrying immediately won't help; failover may help.
  if (
    BILLING_PATTERNS.some((p) => lower.includes(p)) ||
    /quota|billing|insufficient[_\s]funds|payment[_\s]required/.test(lower) ||
    status === 402
  ) {
    return { class: "quota", retryable: false, failoverable: true, summary: message, statusCode: status };
  }

  // Rate limit — retry with backoff first, then failover.
  if (status === 429 || /rate[\s_-]*limit|too[\s_-]*many[\s_-]*requests|throttled|resource[_\s]exhausted/.test(lower)) {
    return { class: "rate_limit", retryable: true, failoverable: true, summary: message, statusCode: status };
  }

  // Context length — neither retry nor failover will help; the prompt itself is too big.
  if (/context[_\s]length|context[_\s]window|token[_\s]limit|maximum[_\s]context|maximum[_\s]model[_\s]length|max_model_len|prompt[_\s]too[_\s]long|prompt[_\s]is[_\s]too[_\s]long|input[_\s]is[_\s]too[_\s]long|reduce[_\s]the[_\s]length/.test(lower)) {
    return { class: "context_length", retryable: false, failoverable: false, summary: message, statusCode: status };
  }

  // Bad request — most likely a schema/validation issue, don't retry.
  if (status === 400 || errType === "invalid_request_error") {
    return { class: "bad_request", retryable: false, failoverable: false, summary: message, statusCode: status };
  }

  // Model unavailable — model name typo, region issue, or temporary capacity. Failover often fixes this.
  if (
    /model[_\s]not[_\s]found|model[_\s]unavailable|model_overloaded|no[_\s]such[_\s]model/.test(lower) ||
    status === 404
  ) {
    return { class: "model_unavailable", retryable: true, failoverable: true, summary: message, statusCode: status };
  }

  // Timeout — usually network or model-side latency spike. Retry, then failover.
  if (
    code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT" ||
    error?.name === "TimeoutError" ||
    /timeout|timed[_\s]out|gateway[_\s]timeout/.test(lower) ||
    status === 504
  ) {
    return { class: "timeout", retryable: true, failoverable: true, summary: message, statusCode: status };
  }

  // Network — DNS, connection reset, etc. Retry, then failover.
  if (
    /^(ECONN|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH)/.test(code) ||
    /network[_\s]error|connection[_\s]reset|dns|unreachable|fetch[_\s]failed/.test(lower)
  ) {
    return { class: "network", retryable: true, failoverable: true, summary: message, statusCode: status };
  }

  // 5xx — provider-side issue. Retry, then failover.
  if ((status && status >= 500 && status < 600) || /internal[_\s]server[_\s]error|bad[_\s]gateway|service[_\s]unavailable|cloudflare/.test(lower)) {
    return { class: "server", retryable: true, failoverable: true, summary: message, statusCode: status };
  }

  // Default — unknown but retryable. Failover only if it persists.
  return { class: "unknown", retryable: true, failoverable: true, summary: message, statusCode: status };
}

/**
 * Suggested backoff (ms) for the Nth retry attempt. Caps at 8 s. Adds a small
 * jitter so concurrent retries don't synchronize.
 */
export function backoffMs(attempt: number, baseMs = 1000, capMs = 8000): number {
  const exp = Math.min(baseMs * Math.pow(2, attempt), capMs);
  const jitter = exp * (0.85 + Math.random() * 0.3);
  return Math.round(jitter);
}
