/**
 * ============================================================================
 * COMMAND APPROVAL GATE
 * ============================================================================
 * AionUi-style approval flow for shell commands. The tool layer asks an
 * `ApprovalGate` whether a command may run; the gate is established
 * per-connection by `server.ts` and forwarded to the agent run via
 * AsyncLocalStorage. This keeps tool signatures unchanged and avoids global
 * mutable state.
 *
 * Design notes:
 * - Risk classification short-circuits before the gate is consulted:
 *   `low` commands run without prompting, `high` commands are auto-rejected.
 * - `allow_always` is *per-connection* only. It does not persist to disk and
 *   does not affect other clients or future sessions.
 * - The gate API stays narrow (one async function) so the same plumbing can
 *   later cover write-class tools like `manage_sandbox_files` or
 *   `install_packages` if we want to widen the policy.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export type ApprovalDecision = "allow_once" | "allow_always" | "reject";
export type ApprovalRiskLevel = "low" | "medium" | "high";

export interface ApprovalRequest {
  command: string;
  riskLevel: ApprovalRiskLevel;
  reason?: string;
}

/** A gate decides whether a tool action may proceed. */
export type ApprovalGate = (request: ApprovalRequest) => Promise<ApprovalDecision>;

interface ApprovalStore {
  gate?: ApprovalGate;
}

const approvalStore = new AsyncLocalStorage<ApprovalStore>();

/**
 * Run `fn` with `gate` in scope. Tool implementations call `getApprovalGate()`
 * to retrieve it. If `gate` is undefined (e.g. a script or test invocation),
 * no prompting happens and the existing behavior is preserved.
 */
export function withApprovalContext<T>(gate: ApprovalGate | undefined, fn: () => Promise<T>): Promise<T> {
  return approvalStore.run({ gate }, fn);
}

export function getApprovalGate(): ApprovalGate | undefined {
  return approvalStore.getStore()?.gate;
}

/**
 * Heuristic risk classifier. Conservative on purpose: anything we cannot
 * confidently classify as read-only falls into `medium` and is shown to the
 * user for explicit approval.
 */
export function classifyCommandRisk(command: string): ApprovalRiskLevel {
  const cmd = command.trim();
  if (!cmd) return "low";

  // Hard-reject patterns (return "high" so the gate auto-rejects).
  const hardReject = [
    /\brm\s+-(?:rf|fr)\s+\/(?!home\/user|tmp|var\/tmp)/i,
    /\bmkfs(?:\.\w+)?\b/i,
    /\bdd\s+[^|]*of=\/dev\//i,
    /:\s*\(\s*\)\s*\{\s*:\|:&\s*\}\s*;:/, // fork bomb
    />\s*\/dev\/(?:sd|nvme|hd|disk)/i,
    /\bchmod\s+-?R?\s*777\s+\/(?!home\/user)/i,
    /\bchown\s+-R\s+\S+\s+\/(?!home\/user)/i,
    /\bshutdown\b|\breboot\b|\bhalt\b|\bpoweroff\b/i,
    /\bcurl\s+[^|]*\|\s*(?:bash|sh)\b/i,
    /\bwget\s+[^|]*\|\s*(?:bash|sh)\b/i,
  ];
  if (hardReject.some((pattern) => pattern.test(cmd))) return "high";

  // Read-only / inspection commands. We only mark `low` if the *whole*
  // command is in this allow-list (no `&&`, `;`, `|` smuggling other ops).
  const onlyReadCommands = /^(?:ls|pwd|whoami|id|date|uname|cat|head|tail|file|stat|wc|du|df|ps|env|printenv|hostname|tree|jq|grep|rg|sort|uniq|cut|awk|sed -n|find\s+[\w./-]+\s+-(?:name|type|maxdepth)|ffprobe|identify|exiftool|md5sum|sha256sum|tesseract\s+[^|;&]+stdout)\b/i;
  if (onlyReadCommands.test(cmd) && !/[;&|]/.test(cmd) && !/`|\$\(/.test(cmd)) {
    return "low";
  }

  return "medium";
}
