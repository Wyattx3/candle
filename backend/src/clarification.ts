/**
 * Clarification gate — symmetric to `approvals.ts`.
 *
 * The `clarify` tool needs to (a) push a question to the active client,
 * (b) pause the agent until the client replies, (c) inject the reply as the
 * tool's output. Because tools cannot synchronously block the run loop, we
 * carry the gate via AsyncLocalStorage and let the server install a per-run
 * implementation that returns a Promise resolved when the
 * `clarification_response` WS message lands.
 *
 * If no gate is in scope (CLI scripts, tests, the timeout already fired),
 * the tool falls back to its previous behaviour: return a JSON envelope
 * stating that no human is available, so the agent can still proceed
 * without hanging.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export interface ClarificationRequest {
  question: string;
  options: string[];
}

export type ClarificationGate = (request: ClarificationRequest) => Promise<string>;

interface ClarificationStore {
  gate?: ClarificationGate;
}

const store = new AsyncLocalStorage<ClarificationStore>();

export function withClarificationContext<T>(
  gate: ClarificationGate | undefined,
  fn: () => Promise<T>
): Promise<T> {
  return store.run({ gate }, fn);
}

export function getClarificationGate(): ClarificationGate | undefined {
  return store.getStore()?.gate;
}
