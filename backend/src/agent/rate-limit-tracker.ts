/**
 * ============================================================================
 * RATE-LIMIT HEADER TRACKER
 * ============================================================================
 * Ported from NousResearch/hermes-agent (`agent/rate_limit_tracker.py`).
 *
 * Parses `x-ratelimit-*` response headers (Cloudflare Workers AI, OpenRouter,
 * and OpenAI-compatible providers follow this convention) into typed buckets,
 * so Candle can surface "you're at 80% of your token-per-minute budget,
 * resets in 12s" before the provider starts returning 429s.
 *
 * Header schema:
 *   x-ratelimit-limit-requests        / -1h    RPM / RPH cap
 *   x-ratelimit-limit-tokens          / -1h    TPM / TPH cap
 *   x-ratelimit-remaining-requests    / -1h    requests left
 *   x-ratelimit-remaining-tokens      / -1h    tokens left
 *   x-ratelimit-reset-requests        / -1h    seconds until reset
 *   x-ratelimit-reset-tokens          / -1h    seconds until reset
 */

export interface RateLimitBucket {
  limit: number;
  remaining: number;
  resetSeconds: number;
  capturedAt: number; // Date.now() ms
}

export interface RateLimitState {
  requestsMin: RateLimitBucket;
  requestsHour: RateLimitBucket;
  tokensMin: RateLimitBucket;
  tokensHour: RateLimitBucket;
  capturedAt: number;
  provider: string;
}

function emptyBucket(): RateLimitBucket {
  return { limit: 0, remaining: 0, resetSeconds: 0, capturedAt: 0 };
}

function safeInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function safeFloat(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function bucketUsed(b: RateLimitBucket): number {
  return Math.max(0, b.limit - b.remaining);
}

export function bucketUsagePct(b: RateLimitBucket): number {
  return b.limit <= 0 ? 0 : (bucketUsed(b) / b.limit) * 100;
}

export function bucketRemainingSecondsNow(b: RateLimitBucket): number {
  const elapsed = (Date.now() - b.capturedAt) / 1000;
  return Math.max(0, b.resetSeconds - elapsed);
}

/**
 * Parse `x-ratelimit-*` headers into a RateLimitState. Accepts a Headers
 * instance, a plain object, or a Map. Returns null if no rate-limit headers
 * are present.
 */
export function parseRateLimitHeaders(
  headers: Headers | Record<string, string> | Map<string, string> | undefined,
  provider = ""
): RateLimitState | null {
  if (!headers) return null;

  const lowered: Record<string, string> = {};
  const entries: Iterable<[string, string]> =
    headers instanceof Headers
      ? headers.entries()
      : headers instanceof Map
        ? headers.entries()
        : Object.entries(headers);
  for (const [k, v] of entries) lowered[k.toLowerCase()] = String(v);

  if (!Object.keys(lowered).some((k) => k.startsWith("x-ratelimit-"))) return null;

  const now = Date.now();
  const bucket = (resource: string, suffix = ""): RateLimitBucket => {
    const tag = `${resource}${suffix}`;
    return {
      limit: safeInt(lowered[`x-ratelimit-limit-${tag}`]),
      remaining: safeInt(lowered[`x-ratelimit-remaining-${tag}`]),
      resetSeconds: safeFloat(lowered[`x-ratelimit-reset-${tag}`]),
      capturedAt: now,
    };
  };

  return {
    requestsMin: bucket("requests"),
    requestsHour: bucket("requests", "-1h"),
    tokensMin: bucket("tokens"),
    tokensHour: bucket("tokens", "-1h"),
    capturedAt: now,
    provider,
  };
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtSeconds(seconds: number): string {
  const s = Math.max(0, Math.trunc(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return sec ? `${m}m ${sec}s` : `${m}m`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** One-line compact summary for status events. */
export function formatRateLimitCompact(state: RateLimitState | null): string {
  if (!state || state.capturedAt === 0) return "No rate limit data.";
  const parts: string[] = [];
  const { requestsMin: rm, requestsHour: rh, tokensMin: tm, tokensHour: th } = state;
  if (rm.limit > 0) parts.push(`RPM: ${rm.remaining}/${rm.limit}`);
  if (rh.limit > 0) parts.push(`RPH: ${fmtCount(rh.remaining)}/${fmtCount(rh.limit)} (resets ${fmtSeconds(bucketRemainingSecondsNow(rh))})`);
  if (tm.limit > 0) parts.push(`TPM: ${fmtCount(tm.remaining)}/${fmtCount(tm.limit)}`);
  if (th.limit > 0) parts.push(`TPH: ${fmtCount(th.remaining)}/${fmtCount(th.limit)} (resets ${fmtSeconds(bucketRemainingSecondsNow(th))})`);
  return parts.join(" | ");
}

/**
 * Return warning strings for any bucket at/over the threshold (default 80%).
 * Lets the agent proactively slow down before hitting a hard 429.
 */
export function rateLimitWarnings(state: RateLimitState | null, thresholdPct = 80): string[] {
  if (!state || state.capturedAt === 0) return [];
  const warnings: string[] = [];
  const checks: [string, RateLimitBucket][] = [
    ["requests/min", state.requestsMin],
    ["requests/hr", state.requestsHour],
    ["tokens/min", state.tokensMin],
    ["tokens/hr", state.tokensHour],
  ];
  for (const [label, b] of checks) {
    if (b.limit > 0 && bucketUsagePct(b) >= thresholdPct) {
      warnings.push(`${label} at ${bucketUsagePct(b).toFixed(0)}% — resets in ${fmtSeconds(bucketRemainingSecondsNow(b))}`);
    }
  }
  return warnings;
}
