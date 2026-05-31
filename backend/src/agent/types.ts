/**
 * Shared types for the agent package. Kept dependency-light so any module
 * (loop, budget, prompts, registry, subagent) can import these without
 * dragging in LangGraph or LangChain.
 */

export type QueryComplexity = "simple" | "moderate" | "complex";

export interface ToolBudget {
  maxToolCalls: number;
  maxSearchCalls: number;
  maxBrowseCalls: number;
  warningAt: number;
}

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export interface ArtifactEntry {
  toolName: string;
  path?: string;
  url?: string;
  filename?: string;
  timestamp: number;
  description?: string;
}

export interface SubagentResult {
  ok: boolean;
  summary: string;
  toolCallsUsed: number;
  toolCallBudget: number;
  artifacts: { path?: string; url?: string; filename?: string; toolName: string }[];
  error?: string;
}

export class AgentAbortError extends Error {
  constructor(message = "Agent run aborted.") {
    super(message);
    this.name = "AbortError";
  }
}

export class AgentTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Agent run timed out after ${Math.round(timeoutMs / 1000)}s.`);
    this.name = "TimeoutError";
  }
}
