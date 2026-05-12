/**
 * ============================================================================
 * RATE LIMITER
 * ============================================================================
 * Per-connection and global rate limiting to prevent abuse and control costs.
 * Tracks requests per IP/connection with sliding window.
 */

export interface RateLimitConfig {
  /** Max requests per window per connection. Default: 20 */
  maxRequestsPerWindow: number;
  /** Window duration in milliseconds. Default: 60_000 (1 minute) */
  windowMs: number;
  /** Max concurrent agent runs globally. Default: 10 */
  maxConcurrentRuns: number;
  /** Cooldown after hitting limit (ms). Default: 10_000 */
  cooldownMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequestsPerWindow: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 20,
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  maxConcurrentRuns: Number(process.env.RATE_LIMIT_MAX_CONCURRENT) || 10,
  cooldownMs: Number(process.env.RATE_LIMIT_COOLDOWN_MS) || 10_000,
};

interface ConnectionState {
  timestamps: number[];
  cooldownUntil: number;
}

const connections = new Map<string, ConnectionState>();
let activeConcurrentRuns = 0;

function cleanupOldEntries(state: ConnectionState, now: number, windowMs: number) {
  const cutoff = now - windowMs;
  state.timestamps = state.timestamps.filter((ts) => ts > cutoff);
}

export function checkRateLimit(
  connectionId: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): { allowed: boolean; reason?: string; retryAfterMs?: number } {
  const now = Date.now();

  // Check global concurrency
  if (activeConcurrentRuns >= config.maxConcurrentRuns) {
    return {
      allowed: false,
      reason: `Server is at capacity (${config.maxConcurrentRuns} concurrent runs). Please wait.`,
      retryAfterMs: 5_000,
    };
  }

  // Get or create connection state
  let state = connections.get(connectionId);
  if (!state) {
    state = { timestamps: [], cooldownUntil: 0 };
    connections.set(connectionId, state);
  }

  // Check cooldown
  if (now < state.cooldownUntil) {
    return {
      allowed: false,
      reason: "Rate limit cooldown active. Please wait before sending more requests.",
      retryAfterMs: state.cooldownUntil - now,
    };
  }

  // Clean old timestamps and check window limit
  cleanupOldEntries(state, now, config.windowMs);

  if (state.timestamps.length >= config.maxRequestsPerWindow) {
    state.cooldownUntil = now + config.cooldownMs;
    return {
      allowed: false,
      reason: `Rate limit exceeded (${config.maxRequestsPerWindow} requests per ${config.windowMs / 1000}s). Cooling down.`,
      retryAfterMs: config.cooldownMs,
    };
  }

  // Allow and record
  state.timestamps.push(now);
  return { allowed: true };
}

export function acquireConcurrencySlot(): boolean {
  if (activeConcurrentRuns >= DEFAULT_CONFIG.maxConcurrentRuns) return false;
  activeConcurrentRuns++;
  return true;
}

export function releaseConcurrencySlot(): void {
  activeConcurrentRuns = Math.max(0, activeConcurrentRuns - 1);
}

export function removeConnection(connectionId: string): void {
  connections.delete(connectionId);
}

/** Periodic cleanup of stale connection entries (call every few minutes) */
export function cleanupStaleConnections(maxAgeMs = 300_000): void {
  const now = Date.now();
  for (const [id, state] of connections.entries()) {
    cleanupOldEntries(state, now, maxAgeMs);
    if (state.timestamps.length === 0 && now > state.cooldownUntil) {
      connections.delete(id);
    }
  }
}

// Auto-cleanup every 5 minutes
setInterval(() => cleanupStaleConnections(), 300_000).unref();
