/**
 * Per-run session context propagated via Node's AsyncLocalStorage so tools
 * can read the active session id (and abort signal) without changing the
 * LangChain tool signatures.
 *
 * Two consumers:
 *  - The keyed sandbox registry in `../tools.ts` uses `getSessionId()` to
 *    look up the per-session E2B sandbox.
 *  - The trajectory logger / future telemetry can use the same id to group
 *    events.
 *
 * If a tool is called outside any session context (scripts, tests), the
 * fallback session id `"_default"` is returned. Sandboxes created under the
 * fallback are tied together — that's intentional, it preserves the previous
 * single-sandbox behaviour for ad-hoc invocations.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface SessionContext {
  sessionId: string;
  signal?: AbortSignal;
}

const sessionStore = new AsyncLocalStorage<SessionContext>();

export function withSessionContext<T>(ctx: SessionContext, fn: () => Promise<T>): Promise<T> {
  return sessionStore.run(ctx, fn);
}

export function getSessionId(): string {
  return sessionStore.getStore()?.sessionId ?? "_default";
}

export function getSessionSignal(): AbortSignal | undefined {
  return sessionStore.getStore()?.signal;
}

/** Whether a real session is in scope (vs the implicit `_default`). */
export function hasActiveSession(): boolean {
  return Boolean(sessionStore.getStore()?.sessionId);
}
