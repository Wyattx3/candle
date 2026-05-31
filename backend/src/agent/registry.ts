/**
 * ArtifactRegistry & FailureTracker.
 *
 * - ArtifactRegistry tracks generated files/URLs across a session so the
 *   agent can reference earlier artifacts and so the final answer assembly
 *   knows which files were created in the current turn.
 * - FailureTracker watches for repeated identical tool failures and emits
 *   a hint the agent can read to switch tactics.
 */

import { ArtifactEntry } from "./types";

export class ArtifactRegistry {
  private artifacts: ArtifactEntry[] = [];
  private readonly maxEntries = 50;

  record(entry: ArtifactEntry): void {
    this.artifacts.push(entry);
    if (this.artifacts.length > this.maxEntries) {
      this.artifacts = this.artifacts.slice(-this.maxEntries);
    }
  }

  /** Extract artifact info from tool outputs automatically */
  extractFromToolOutput(toolName: string, output: string): void {
    // Try structured JSON extraction first (more reliable than regex)
    try {
      const parsed = JSON.parse(output);
      const url = parsed?.url || parsed?.file_url || parsed?.download_url;
      const filePath = parsed?.path || parsed?.file_path || parsed?.filepath;
      const filename = parsed?.filename || parsed?.name;

      if (url || filePath) {
        this.record({
          toolName,
          url: typeof url === "string" ? url : undefined,
          path: typeof filePath === "string" ? filePath : undefined,
          filename: typeof filename === "string" ? filename : filePath?.split("/").pop(),
          timestamp: Date.now(),
        });
        return;
      }
    } catch {
      // Not valid JSON, fall through to regex
    }

    // Fallback: regex extraction for non-JSON outputs
    const urlMatch = output.match(/"url"\s*:\s*"(https?:\/\/[^"]+)"/);
    const pathMatch = output.match(/"path"\s*:\s*"([^"]+)"/);
    const filenameMatch = output.match(/"filename"\s*:\s*"([^"]+)"/);

    if (urlMatch || pathMatch) {
      this.record({
        toolName,
        url: urlMatch?.[1],
        path: pathMatch?.[1],
        filename: filenameMatch?.[1] || pathMatch?.[1]?.split("/").pop(),
        timestamp: Date.now(),
      });
    }
  }

  /** Get summary for injection into context */
  getSummary(): string {
    if (!this.artifacts.length) return "";
    const recent = this.artifacts.slice(-3);
    const lines = recent.map((a, i) => {
      const name = a.filename || a.path?.split("/").pop() || "artifact";
      return `  ${i + 1}. ${name} (via ${a.toolName})`;
    });
    return (
      `\n### PRIOR SESSION ARTIFACTS (reference only)\n` +
      `The following files were created earlier in this conversation. ` +
      `DO NOT re-list them or re-share their URLs unless the user explicitly ` +
      `asks for an earlier file by name. Only mention NEW files you create ` +
      `in the current turn.\n` +
      `${lines.join("\n")}\n`
    );
  }

  /** Get full artifact details (used internally, not injected into context) */
  getRecentUrls(limit = 5): { name: string; url?: string; path?: string }[] {
    return this.artifacts.slice(-limit).map((a) => ({
      name: a.filename || a.path?.split("/").pop() || "artifact",
      url: a.url,
      path: a.path,
    }));
  }

  clear(): void {
    this.artifacts = [];
  }
}

interface ToolFailure {
  toolName: string;
  errorPrefix: string;
  count: number;
  lastSeen: number;
}

export class FailureTracker {
  private failures: ToolFailure[] = [];
  private readonly maxRepeats = 3;

  recordFailure(toolName: string, output: string): string | null {
    const errorPrefix = output.slice(0, 100).trim();
    const existing = this.failures.find(
      (f) => f.toolName === toolName && f.errorPrefix === errorPrefix
    );

    if (existing) {
      existing.count++;
      existing.lastSeen = Date.now();
      if (existing.count >= this.maxRepeats) {
        return `⚠️ Tool "${toolName}" has failed ${existing.count} times with the same error. Try a completely different approach or tool.`;
      }
    } else {
      this.failures.push({ toolName, errorPrefix, count: 1, lastSeen: Date.now() });
    }
    return null;
  }

  recordSuccess(toolName: string): void {
    this.failures = this.failures.filter((f) => f.toolName !== toolName);
  }

  clear(): void {
    this.failures = [];
  }
}
