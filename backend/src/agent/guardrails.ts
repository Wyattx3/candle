/**
 * Tool-call guardrail controller.
 *
 * Ported and adapted from Hermes' `agent/tool_guardrails.py`. Three layered
 * loop-detection heuristics, each emitting a graduated decision
 * (`allow → warn → block → halt`):
 *
 *  1. **Exact-failure loop** — the SAME tool with the SAME canonical args
 *     failed K times (warn@2, block@5). Args are canonicalized (sorted keys,
 *     compact JSON) before hashing so reordering can't defeat detection.
 *  2. **Same-tool failure** — a tool fails with ANY args repeatedly
 *     (warn@3, halt@8). Catches a tool that's simply broken/unavailable.
 *  3. **Idempotent no-progress** — for READ-ONLY tools only, the same args
 *     returning the same result hash N times (warn@2, block@5). Catches an
 *     agent re-reading the same file / re-running the same search and getting
 *     nowhere — a failure mode pure call-count loop detection misses.
 *
 * The idempotent/mutating distinction is the key addition over the previous
 * implementation: it would flag a legitimately-repeated mutating call (e.g.
 * appending to a file twice) as "no progress", and it ran no-progress checks
 * on writes. Now mutating tools are exempt from no-progress entirely, and
 * only known read-only tools participate.
 */

import * as crypto from "crypto";

export interface ToolCallGuardrailConfig {
  exactFailureWarnAfter: number;
  exactFailureBlockAfter: number;
  sameToolFailureWarnAfter: number;
  sameToolFailureHaltAfter: number;
  noProgressWarnAfter: number;
  noProgressBlockAfter: number;
}

export const DEFAULT_GUARDRAIL_CONFIG: ToolCallGuardrailConfig = {
  exactFailureWarnAfter: 2,
  exactFailureBlockAfter: 5,
  sameToolFailureWarnAfter: 3,
  sameToolFailureHaltAfter: 8,
  noProgressWarnAfter: 2,
  noProgressBlockAfter: 5,
};

/**
 * Read-only tools where repeating the same call with the same args and
 * getting the same result means no progress is being made. Mirrors Candle's
 * tool registry names.
 */
export const IDEMPOTENT_TOOL_NAMES: ReadonlySet<string> = new Set([
  "search_web",
  "browse_web",
  "read_sandbox_file",
  "inspect_sandbox_file",
  "list_sandbox_files",
  "get_sandbox_file_url",
  "list_e2b_templates",
  "capability_catalog",
  "semantic_search",
  "search_memory",
  "skill_view",
  "screenshot_analyze",
]);

/**
 * Tools that change state. These are NEVER subject to the no-progress
 * heuristic — re-running them legitimately can produce the same textual
 * result (e.g. writing the same bytes, an idempotent install) without being
 * a stuck loop.
 */
export const MUTATING_TOOL_NAMES: ReadonlySet<string> = new Set([
  "write_sandbox_file",
  "manage_sandbox_files",
  "create_artifact",
  "patch",
  "run_python",
  "run_node",
  "run_terminal",
  "install_packages",
  "download_video",
  "http_request",
  "store_memory",
  "delete_memory",
  "skill_manage",
  "set_e2b_template",
  "cronjob",
  "todo",
  "spawn_subagent",
  "spawn_subagents_parallel",
]);

export type ToolGuardrailDecisionAction = "allow" | "warn" | "block" | "halt";

export interface ToolGuardrailDecision {
  action: ToolGuardrailDecisionAction;
  feedback?: string;
}

export class ToolCallSignature {
  constructor(
    public toolName: string,
    public argsHash: string,
    public rawArgs: Record<string, any>
  ) {}

  static fromCall(toolName: string, args: Record<string, any>): ToolCallSignature {
    const safeArgs = args && typeof args === "object" ? args : {};
    const canonicalArgs = JSON.stringify(safeArgs, Object.keys(safeArgs).sort());
    const argsHash = crypto.createHash("sha256").update(canonicalArgs).digest("hex");
    return new ToolCallSignature(toolName, argsHash, safeArgs);
  }

  isExactMatch(other: ToolCallSignature): boolean {
    return this.toolName === other.toolName && this.argsHash === other.argsHash;
  }
}

export class ToolCallGuardrailController {
  private config: ToolCallGuardrailConfig;
  private callHistory: {
    signature: ToolCallSignature;
    success: boolean;
    outputHash?: string;
  }[] = [];

  constructor(config: Partial<ToolCallGuardrailConfig> = {}) {
    this.config = { ...DEFAULT_GUARDRAIL_CONFIG, ...config };
  }

  resetForTurn(): void {
    // History is intentionally kept per-session so cross-turn loops are still
    // visible. Hook retained for parity with Hermes' per-turn controller.
  }

  private isIdempotent(toolName: string): boolean {
    if (MUTATING_TOOL_NAMES.has(toolName)) return false;
    return IDEMPOTENT_TOOL_NAMES.has(toolName);
  }

  beforeCall(toolName: string, args: Record<string, any>): ToolGuardrailDecision {
    const signature = ToolCallSignature.fromCall(toolName, args);
    let exactFailures = 0;
    let toolFailures = 0;

    // Count backwards to find consecutive failures for this tool.
    for (let i = this.callHistory.length - 1; i >= 0; i--) {
      const record = this.callHistory[i];
      if (record.success) {
        if (record.signature.toolName === toolName) {
          break; // a success for this tool breaks the failure streak
        }
        continue;
      }

      if (record.signature.toolName === toolName) {
        toolFailures++;
        if (record.signature.isExactMatch(signature)) {
          exactFailures++;
        }
      } else {
        break; // streak broken by a different tool's failure
      }
    }

    if (exactFailures >= this.config.exactFailureBlockAfter) {
      return {
        action: "block",
        feedback: `[Guardrail Blocked] "${toolName}" has failed ${exactFailures} times with these exact arguments. Stop repeating it unchanged — change strategy or explain the blocker.`,
      };
    }

    if (toolFailures >= this.config.sameToolFailureHaltAfter) {
      return {
        action: "halt",
        feedback: this.recoveryHint(toolName, toolFailures, /* halt */ true),
      };
    }

    // Idempotent no-progress BLOCK (read-only tool returning identical
    // results repeatedly). Checked here so it can stop the call before it
    // runs again.
    if (this.isIdempotent(toolName)) {
      const noProgress = this.countTrailingNoProgress(signature);
      if (noProgress >= this.config.noProgressBlockAfter) {
        return {
          action: "block",
          feedback: `[Guardrail Blocked] "${toolName}" returned the same result ${noProgress} times for the same input. Use the result you already have or change the query — don't repeat it.`,
        };
      }
    }

    if (exactFailures >= this.config.exactFailureWarnAfter) {
      return {
        action: "warn",
        feedback: `[Guardrail Warning] "${toolName}" already failed ${exactFailures} times with these exact arguments. This looks like a loop — inspect the error and change something before retrying.`,
      };
    }

    if (toolFailures >= this.config.sameToolFailureWarnAfter) {
      return {
        action: "warn",
        feedback: this.recoveryHint(toolName, toolFailures, /* halt */ false),
      };
    }

    return { action: "allow" };
  }

  afterCall(toolName: string, args: Record<string, any>, result: string, isError: boolean): ToolGuardrailDecision {
    const signature = ToolCallSignature.fromCall(toolName, args);
    const outputHash = crypto.createHash("sha256").update(result ?? "").digest("hex");

    // No-progress only applies to successful read-only calls.
    let noProgressCount = 0;
    if (!isError && this.isIdempotent(toolName)) {
      for (let i = this.callHistory.length - 1; i >= 0; i--) {
        const record = this.callHistory[i];
        if (
          record.success &&
          record.signature.isExactMatch(signature) &&
          record.outputHash === outputHash
        ) {
          noProgressCount++;
        } else if (record.signature.toolName === toolName) {
          // same tool but different args/result → streak broken
          break;
        }
      }
    }

    this.callHistory.push({ signature, success: !isError, outputHash });

    if (noProgressCount >= this.config.noProgressBlockAfter) {
      return {
        action: "block",
        feedback: `[Guardrail Blocked] "${toolName}" keeps returning the same output without progress. Stop calling it and use what you have.`,
      };
    }

    if (noProgressCount >= this.config.noProgressWarnAfter) {
      return {
        action: "warn",
        feedback: `[Guardrail Warning] "${toolName}" returned the same output as before. Make sure you're actually making progress instead of repeating the call.`,
      };
    }

    return { action: "allow" };
  }

  /** Count how many trailing successful idempotent calls share this signature + result. */
  private countTrailingNoProgress(signature: ToolCallSignature): number {
    if (this.callHistory.length === 0) return 0;
    const lastForSig = [...this.callHistory]
      .reverse()
      .find((r) => r.signature.isExactMatch(signature) && r.success);
    if (!lastForSig?.outputHash) return 0;

    let count = 0;
    for (let i = this.callHistory.length - 1; i >= 0; i--) {
      const record = this.callHistory[i];
      if (
        record.success &&
        record.signature.isExactMatch(signature) &&
        record.outputHash === lastForSig.outputHash
      ) {
        count++;
      } else if (record.signature.toolName === signature.toolName) {
        break;
      }
    }
    return count;
  }

  private recoveryHint(toolName: string, count: number, halt: boolean): string {
    const label = halt ? "Guardrail Halted" : "Guardrail Warning";
    const common =
      `[${label}] "${toolName}" has failed ${count} times. This looks like a loop. ` +
      `Don't switch to a text-only reply — keep using tools, but diagnose before retrying. ` +
      `Inspect the latest error and verify your assumptions first. `;
    if (toolName === "run_terminal") {
      return (
        common +
        "For terminal failures, run a small diagnostic like `pwd && ls -la` first, then try an absolute path, a simpler command, a different working directory, or a different tool (read_sandbox_file / write_sandbox_file / patch)."
      );
    }
    return (
      common +
      "Try different arguments, a narrower query/path, an absolute path where relevant, or a different tool that can make progress. If the blocker is external, report it after one diagnostic attempt instead of repeating the same failing path."
    );
  }
}
