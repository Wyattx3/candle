import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { retrieveDynamicContext } from "./context";
import { redactSecrets, redactSecretsDeep } from "./security";
import {
  browseWebTool,
  browserInteractTool,
  capabilityCatalogTool,
  createArtifactTool,
  downloadVideoTool,
  getSandboxFileUrlTool,
  httpRequestTool,
  inspectSandboxFileTool,
  installPackagesTool,
  listE2BTemplatesTool,
  listSandboxFilesTool,
  manageSandboxFilesTool,
  officialAndroidAppTool,
  readSandboxFileTool,
  runNodeTool,
  runPythonTool,
  runTerminalTool,
  screenshotAnalyzeTool,
  searchWebTool,
  setE2BTemplateTool,
  writeSandboxFileTool
} from "./tools";

/**
 * ============================================================================
 * CLOUDFLARE AI CLIENT
 * ============================================================================
 */

const CF_API_KEY = process.env.CLOUDFLARE_API_KEY;
const CF_BASE_URL = process.env.CLOUDFLARE_BASE_URL;

if (!CF_API_KEY || !CF_BASE_URL) {
  throw new Error(
    "Missing required env vars: CLOUDFLARE_API_KEY and CLOUDFLARE_BASE_URL must be set in backend/.env"
  );
}

const cfConfig = {
  apiKey: CF_API_KEY,
  configuration: {
    baseURL: CF_BASE_URL,
    defaultHeaders: { Authorization: `Bearer ${CF_API_KEY}` },
  },
};


/**
 * Tool registry.
 */
const tools = [
  runPythonTool,
  runTerminalTool,
  runNodeTool,
  installPackagesTool,
  inspectSandboxFileTool,
  readSandboxFileTool,
  writeSandboxFileTool,
  manageSandboxFilesTool,
  httpRequestTool,
  listE2BTemplatesTool,
  setE2BTemplateTool,
  listSandboxFilesTool,
  getSandboxFileUrlTool,
  createArtifactTool,
  capabilityCatalogTool,
  downloadVideoTool,
  officialAndroidAppTool,
  searchWebTool,
  browseWebTool,
  browserInteractTool,
  screenshotAnalyzeTool,
];

const toolNode = new ToolNode(tools);

const MODEL_NAME = process.env.MODEL_NAME || "@cf/moonshotai/kimi-k2.6";

/**
 * LLM instances:
 * - agentLLM: default with tools bound (for moderate/complex queries)
 * - noToolsLLM: without tools (for simple queries and budget-exceeded forced answers)
 * - researchLLM: higher temperature for research/identification tasks
 */
const agentLLM = new ChatOpenAI({
  modelName: MODEL_NAME,
  temperature: 0,
  streaming: true,
  ...cfConfig,
}).bindTools(tools, { tool_choice: "auto" });

const noToolsLLM = new ChatOpenAI({
  modelName: MODEL_NAME,
  temperature: 0.2,
  streaming: true,
  ...cfConfig,
});

const researchLLM = new ChatOpenAI({
  modelName: MODEL_NAME,
  temperature: 0.4,
  streaming: true,
  ...cfConfig,
}).bindTools(tools, { tool_choice: "auto" });

/**
 * ============================================================================
 * ARTIFACT REGISTRY
 * ============================================================================
 * Tracks generated files/URLs across turns so the agent can reference them
 * when the user asks "give me that file from earlier".
 */

export interface ArtifactEntry {
  toolName: string;
  path?: string;
  url?: string;
  filename?: string;
  timestamp: number;
  description?: string;
}

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


/**
 * ============================================================================
 * REPEATED FAILURE DETECTION
 * ============================================================================
 */

interface ToolFailure {
  toolName: string;
  errorPrefix: string;
  count: number;
  lastSeen: number;
}

class FailureTracker {
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

/**
 * ============================================================================
 * CONVERSATION SUMMARIZER
 * ============================================================================
 * When history exceeds a threshold, summarize older messages to prevent
 * context window overflow while preserving essential information.
 */

const SUMMARIZE_THRESHOLD = 16;

function summarizeOldHistory(history: ChatHistoryMessage[]): ChatHistoryMessage[] {
  if (history.length <= SUMMARIZE_THRESHOLD) return history;

  // Keep the most recent messages intact, summarize older ones
  const keepRecent = Math.min(10, Math.floor(history.length * 0.4));
  const oldMessages = history.slice(0, history.length - keepRecent);
  const recentMessages = history.slice(history.length - keepRecent);

  // Extract important information from old messages before summarizing
  const preservedUrls: string[] = [];
  const preservedDecisions: string[] = [];
  const summaryParts: string[] = [];

  for (const msg of oldMessages) {
    // Preserve file URLs and artifact references
    const urls = msg.content.match(/https?:\/\/[^\s"'<>]+/g);
    if (urls) {
      preservedUrls.push(...urls.slice(0, 3)); // max 3 URLs per message
    }

    // Preserve key user decisions/preferences
    if (msg.role === "user" && msg.content.length > 5) {
      const preview = msg.content.slice(0, 200).replace(/\n/g, " ").trim();
      preservedDecisions.push(preview);
    }

    // Build compact summary
    const preview = msg.content.slice(0, 120).replace(/\n/g, " ").trim();
    if (preview) {
      summaryParts.push(`[${msg.role}]: ${preview}${msg.content.length > 120 ? "..." : ""}`);
    }
  }

  // Build summary with preserved context
  let summaryContent =
    `[CONVERSATION SUMMARY — ${oldMessages.length} earlier messages condensed]\n`;

  if (preservedUrls.length > 0) {
    summaryContent += `Key URLs from earlier: ${[...new Set(preservedUrls)].slice(0, 5).join(", ")}\n`;
  }

  if (preservedDecisions.length > 0) {
    summaryContent += `User requests: ${preservedDecisions.slice(-4).join(" | ")}\n`;
  }

  summaryContent += `\nExchange summary:\n${summaryParts.slice(-6).join("\n")}`;
  summaryContent += `\n[End of summary. Recent conversation follows.]`;

  const summaryMessage: ChatHistoryMessage = {
    role: "assistant",
    content: summaryContent,
  };

  return [summaryMessage, ...recentMessages];
}

/**
 * ============================================================================
 * LLM RETRY WITH EXPONENTIAL BACKOFF
 * ============================================================================
 */

async function invokeWithRetry(
  messages: any[],
  signal?: AbortSignal,
  maxRetries = 3
): Promise<any> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (signal?.aborted) throw new AgentAbortError();
    try {
      return await agentLLM.invoke(messages);
    } catch (error: any) {
      lastError = error;
      const msg = String(error?.message ?? "").toLowerCase();
      // Don't retry on auth errors or invalid requests
      if (msg.includes("401") || msg.includes("403") || msg.includes("invalid")) {
        throw error;
      }
      // Retry on timeouts, 429, 500+, network errors
      if (attempt < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.warn(`[model:retry] attempt ${attempt + 1} failed: ${msg.slice(0, 100)}. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (signal?.aborted) throw new AgentAbortError();
      }
    }
  }
  throw lastError;
}


/**
 * ============================================================================
 * TOOL-CALLING AGENT GRAPH
 * ============================================================================
 */

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * ============================================================================
 * TOOL CALL BUDGET ENFORCEMENT
 * ============================================================================
 * Classifies prompts by complexity using intent analysis (not just keywords)
 * and enforces hard limits on tool calls to prevent runaway agent loops.
 */

type QueryComplexity = "simple" | "moderate" | "complex";

interface ToolBudget {
  maxToolCalls: number;
  maxSearchCalls: number;
  maxBrowseCalls: number;
  warningAt: number;
}

const TOOL_BUDGETS: Record<QueryComplexity, ToolBudget> = {
  simple: { maxToolCalls: 3, maxSearchCalls: 1, maxBrowseCalls: 0, warningAt: 2 },
  moderate: { maxToolCalls: 12, maxSearchCalls: 4, maxBrowseCalls: 2, warningAt: 8 },
  complex: { maxToolCalls: 30, maxSearchCalls: 8, maxBrowseCalls: 4, warningAt: 22 },
};

function classifyQueryComplexity(prompt: string, historyLength: number): QueryComplexity {
  const lower = prompt.toLowerCase().trim();
  const wordCount = lower.split(/\s+/).length;

  // Trivial: acknowledgements, thanks, confirmations — no tools needed
  const trivialPatterns = [
    /^(ok|okay|thanks|thank you|thx|ကျေးဇူးပါ|ကျေးဇူးတင်ပါတယ်|ဟုတ်ကဲ့|ဟုတ်|အိုကေ|ရပြီ|good|great|nice|cool|got it|understood)\s*[.!]?\s*$/i,
  ];

  if (trivialPatterns.some((p) => p.test(lower))) {
    return "simple";
  }

  // Simple: short factual questions, greetings, definitions
  const simplePatterns = [
    /^(who|what|when|where|which|how much|how many|how old)\b.{0,100}\??\s*$/,
    /^(ဘယ်သူ|ဘာ|ဘယ်တုန်း|ဘယ်မှာ|ဘယ်လောက်|ဘယ်နှစ်).{0,100}$/,
    /^(hi|hello|hey|mingalarbar|မင်္ဂလာပါ|ဟိုင်း)/,
    /^(define|explain|tell me about|what is|what are)\b.{0,80}$/,
    /^.{0,50}(capital|president|population|currency|language|flag)\b.{0,50}$/,
    /^.{0,30}(ဘယ်သူလဲ|ဘာလဲ|ဘယ်လဲ).{0,30}$/,
  ];

  if (wordCount <= 20 && simplePatterns.some((p) => p.test(lower))) {
    return "simple";
  }

  // Intent-based complexity: check if the sentence STRUCTURE implies action vs question
  // "What is download" = question about the word → simple
  // "Download this file" = imperative action → complex
  const isQuestion = /^(what|who|when|where|why|how|is|are|was|were|do|does|did|can|could|ဘာ|ဘယ်)\b/i.test(lower) || lower.endsWith("?");
  const isImperative = /^(download|create|build|generate|write|develop|implement|convert|install|find|search|get|make|run|execute|ဒေါင်းလုဒ်|ဖန်တီး|ရေး|လုပ်|တည်ဆောက်|ရှာ)/i.test(lower);

  // If it's a question about a concept (even if it contains action words), it's simpler
  if (isQuestion && !isImperative && wordCount <= 15) {
    return wordCount <= 8 ? "simple" : "moderate";
  }

  // Complex: imperative tasks that need multiple steps
  const complexIndicators = [
    // Imperative action verbs at start
    isImperative,
    // Delivery tasks (make something for me)
    /\b(for me|ပေး|ပေးပါ|လုပ်ပေး)\b/.test(lower),
    // Multi-step research
    /\b(step.by.step|multiple|all|every|compare|analyze|research)\b/.test(lower),
    // Identification by description (long descriptions = needs research)
    /ရှာပေး|ရှာပေးပါ|ရအောင်ရှာ|ရှာဖွေ/.test(lower),
    // Long prompts with lots of detail
    wordCount > 40,
  ];

  const complexScore = complexIndicators.filter(Boolean).length;
  if (complexScore >= 2 || (isImperative && wordCount > 10)) {
    return "complex";
  }

  // Short follow-ups with history
  if (historyLength > 0 && wordCount <= 15) {
    const continuationPatterns = [
      /ထပ်|ကြိုးစား|keep|try|again|more|next|continue|another|else/i,
      /ပြင်|change|update|modify|fix/i,
    ];
    if (continuationPatterns.some((p) => p.test(lower))) {
      return "complex";
    }
    return "moderate";
  }

  return "moderate";
}


/**
 * ============================================================================
 * RUN CONTEXT (Per-Connection, No Global State)
 * ============================================================================
 * Each WebSocket connection gets its own RunContext instance passed through
 * the graph via closure — eliminates the race condition from global state.
 */

class RunContext {
  budget: ToolBudget;
  complexity: QueryComplexity;
  toolCallCount = 0;
  searchCallCount = 0;
  browseCallCount = 0;
  budgetWarningIssued = false;
  budgetExceeded = false;
  recentModelOutputs: string[] = [];
  loopNudgeSent = false;
  /** Tracks tool failures so the model can see them in context */
  pendingFailureHint: string | null = null;
  private readonly loopWindow = 6;

  constructor(prompt: string, historyLength: number) {
    this.complexity = classifyQueryComplexity(prompt, historyLength);
    this.budget = TOOL_BUDGETS[this.complexity];
    console.log(`[budget] Query classified as "${this.complexity}" — max ${this.budget.maxToolCalls} tool calls, ${this.budget.maxSearchCalls} searches`);
  }

  trackToolCall(toolName: string): "ok" | "warning" | "exceeded" {
    this.toolCallCount++;
    if (toolName === "search_web") this.searchCallCount++;
    if (toolName === "browse_web") this.browseCallCount++;

    if (
      this.toolCallCount > this.budget.maxToolCalls ||
      this.searchCallCount > this.budget.maxSearchCalls ||
      this.browseCallCount > this.budget.maxBrowseCalls
    ) {
      this.budgetExceeded = true;
      return "exceeded";
    }

    if (this.toolCallCount >= this.budget.warningAt && !this.budgetWarningIssued) {
      this.budgetWarningIssued = true;
      return "warning";
    }

    return "ok";
  }

  getModelOutputSignature(response: any): string {
    const toolCalls = response.tool_calls ?? [];
    if (toolCalls.length > 0) {
      return toolCalls
        .map((t: any) => `${t.name}:${JSON.stringify(t.args ?? {}).slice(0, 80)}`)
        .sort()
        .join("|");
    }
    return contentToText(response.content).slice(0, 200).trim();
  }

  detectLoop(signature: string): "ok" | "nudge" | "stop" {
    this.recentModelOutputs.push(signature);
    if (this.recentModelOutputs.length > this.loopWindow) {
      this.recentModelOutputs.shift();
    }

    let consecutive = 1;
    for (let i = this.recentModelOutputs.length - 2; i >= 0; i--) {
      if (this.recentModelOutputs[i] === signature) {
        consecutive++;
      } else {
        const similarity = this.stringSimilarity(this.recentModelOutputs[i], signature);
        if (similarity > 0.7) {
          consecutive++;
        } else {
          break;
        }
      }
    }

    if (consecutive >= 3) return "stop";
    if (consecutive >= 2) return "nudge";
    return "ok";
  }

  private stringSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (!a || !b) return 0;
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    if (longer.length === 0) return 1;
    let matches = 0;
    for (let i = 0; i < shorter.length; i++) {
      if (shorter[i] === longer[i]) matches++;
    }
    return matches / longer.length;
  }
}

/**
 * ============================================================================
 * TOOL OUTPUT EXTRACTION HELPERS
 * ============================================================================
 * Tool-type-aware content extraction for the observation summarizer.
 */

function extractSearchResults(content: string): string {
  // Extract titles, snippets, and URLs from search results
  const lines = content.split("\n");
  const results: string[] = [];
  let charCount = 0;
  const MAX_CHARS = 3000;

  for (const line of lines) {
    // Keep lines that look like titles, snippets, or URLs
    if (
      line.match(/^(title|snippet|url|link|description|#|\d+\.)/i) ||
      line.match(/https?:\/\//) ||
      line.match(/^[-•*]/) ||
      line.trim().length > 20
    ) {
      if (charCount + line.length > MAX_CHARS) break;
      results.push(line);
      charCount += line.length;
    }
  }

  return results.length > 0
    ? results.join("\n")
    : content.slice(0, MAX_CHARS) + "\n[... truncated]";
}

function extractMainContent(content: string): string {
  // Strip navigation, footer, cookie banners from browsed page content
  const lines = content.split("\n");
  const filtered: string[] = [];
  let charCount = 0;
  const MAX_CHARS = 3500;

  const skipPatterns = [
    /^(nav|menu|footer|header|sidebar|cookie|banner|advertisement)/i,
    /^(skip to|jump to|go to|back to top)/i,
    /^(copyright|©|all rights reserved|privacy policy|terms of)/i,
    /^\s*$/,
  ];

  for (const line of lines) {
    if (skipPatterns.some((p) => p.test(line.trim()))) continue;
    if (charCount + line.length > MAX_CHARS) break;
    filtered.push(line);
    charCount += line.length;
  }

  return filtered.length > 0
    ? filtered.join("\n")
    : content.slice(0, MAX_CHARS) + "\n[... truncated]";
}

function extractCodeOutput(content: string): string {
  // For code execution: prioritize stdout, stderr, and return values
  const MAX_CHARS = 3500;

  // Look for common output markers
  const stdoutMatch = content.match(/(?:stdout|output|result)[\s:]*\n?([\s\S]*?)(?:\n(?:stderr|error)|$)/i);
  const stderrMatch = content.match(/(?:stderr|error)[\s:]*\n?([\s\S]*?)$/i);

  let result = "";

  if (stdoutMatch?.[1]) {
    result += "=== OUTPUT ===\n" + stdoutMatch[1].slice(0, MAX_CHARS * 0.7) + "\n";
  }

  if (stderrMatch?.[1] && stderrMatch[1].trim()) {
    result += "=== ERRORS ===\n" + stderrMatch[1].slice(0, MAX_CHARS * 0.3) + "\n";
  }

  if (!result) {
    // No markers found, just take head + tail
    result = content.slice(0, Math.floor(MAX_CHARS * 0.8)) +
      "\n[...]\n" +
      content.slice(-Math.floor(MAX_CHARS * 0.2));
  }

  return result.slice(0, MAX_CHARS);
}

/**
 * Detect if the current conversation is a research/identification task
 * (used to select researchLLM with higher temperature).
 */
function isResearchQuery(messages: any[]): boolean {
  // Check the user's last message for research indicators
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user" || msg?.kwargs?.role === "user") {
      const text = contentToText(msg.content ?? msg?.kwargs?.content ?? "").toLowerCase();
      // Must have research-specific keywords AND not be a code/execution task
      const hasResearchKeywords = /\b(find|identify|search|ရှာ|ရှာပေး|what is this|name of|title of|ဘယ်.*လဲ)\b/.test(text);
      const isCodeTask = /\b(run|execute|code|script|function|class|import|pip|npm|စစ်|ပြင်)\b/.test(text) ||
        text.includes("```") || text.includes("def ") || text.includes("const ");
      // Only classify as research if it has research keywords and is NOT a code task
      return hasResearchKeywords && !isCodeTask;
    }
  }
  return false;
}

/**
 * ============================================================================
 * AGENT GRAPH FACTORY (Per-Run Instance)
 * ============================================================================
 * Creates a fresh graph per run with RunContext captured in closure.
 * This eliminates the global `activeRunContext` race condition entirely.
 */

function createAgentGraph(runCtx: RunContext, signal?: AbortSignal) {
  /**
   * Observation summarizer: compresses large tool outputs before they go back
   * to the agent. Uses tool-type-aware extraction to preserve the most
   * relevant information instead of blind truncation.
   */
  async function summarizeObservation(state: typeof MessagesAnnotation.State) {
    const messages = state.messages;
    const lastMsg = messages[messages.length - 1] as any;

    // Only summarize tool messages that are excessively long
    if (lastMsg?.role !== "tool" && !lastMsg?.type?.includes("tool")) {
      return { messages: [] }; // pass through unchanged
    }

    const content = contentToText(lastMsg.content ?? lastMsg.kwargs?.content ?? "");
    const SUMMARIZE_THRESHOLD = 4000;

    if (content.length <= SUMMARIZE_THRESHOLD) {
      return { messages: [] }; // short enough, pass through
    }

    // Tool-type-aware summarization
    const toolName = lastMsg.name || lastMsg.tool_call_id || "";
    let condensed: string;

    if (toolName.includes("search") || toolName === "search_web") {
      // For search results: extract titles, snippets, and URLs only
      condensed = extractSearchResults(content);
    } else if (toolName.includes("browse") || toolName === "browse_web") {
      // For browsed pages: extract main content, strip nav/footer
      condensed = extractMainContent(content);
    } else if (toolName.includes("python") || toolName.includes("terminal") || toolName.includes("node")) {
      // For code execution: keep stdout/stderr, trim verbose logs
      condensed = extractCodeOutput(content);
    } else {
      // Default: smart head + tail
      condensed =
        content.slice(0, 2500) +
        "\n\n[... middle content omitted for brevity ...]\n\n" +
        content.slice(-800);
    }

    console.log(`[observe] Condensed ${toolName} output from ${content.length} to ${condensed.length} chars`);
    const condensedMsg = { ...lastMsg, content: condensed };
    return { messages: [condensedMsg] };
  }

  async function callAgentModel(state: typeof MessagesAnnotation.State) {
    const msgCount = state.messages.length;
    console.log(`[model:call] messages in state: ${msgCount}`);

    // Inject pending failure hint into messages so model can see it
    let effectiveMessages: any[] = state.messages;
    if (runCtx.pendingFailureHint) {
      const failureMsg = {
        role: "system" as const,
        content: runCtx.pendingFailureHint,
      };
      effectiveMessages = [...state.messages, failureMsg];
      runCtx.pendingFailureHint = null; // consume it
      console.log(`[model:call] Injected failure hint into context`);
    }

    // Budget enforcement: if exceeded, force the model to respond without tools
    if (runCtx.budgetExceeded) {
      console.warn(`[model:call] ⚠️ BUDGET EXCEEDED — forcing final answer (${runCtx.toolCallCount} calls used)`);
      const budgetStopMsg = {
        role: "system" as const,
        content:
          "⚠️ TOOL BUDGET EXHAUSTED. You MUST now give your final answer using ONLY the information you have already gathered. " +
          "Do NOT request any more tool calls. Respond directly to the user NOW.\n\n" +
          "RULES FOR YOUR RESPONSE:\n" +
          "- Present what you found clearly and concisely.\n" +
          "- If no exact match, suggest closest matches with brief reasoning.\n" +
          "- Ask 1-2 SHORT clarifying questions to help narrow down.\n" +
          "- Keep it SHORT — 3-5 sentences max.",
      };
      const messagesWithStop = [...effectiveMessages, budgetStopMsg];
      const response = await noToolsLLM.invoke(messagesWithStop);
      const text = contentToText(response.content);
      console.log(`[model:call] → forced text response (${text.length} chars): ${text.slice(0, 120).replace(/\n/g, " ")}`);
      return { messages: [response] };
    }

    // Select LLM based on context:
    // - Simple queries: noToolsLLM (no tools bound = faster, cheaper)
    // - Research tasks: researchLLM (higher temperature for diversity)
    // - After loop nudge: researchLLM (diversity to escape loop)
    // - Default: agentLLM (temperature 0, tools bound)
    let response: any;

    if (runCtx.complexity === "simple" && runCtx.toolCallCount === 0) {
      // Simple queries: no tools, just answer directly
      response = await noToolsLLM.invoke(effectiveMessages);
      console.log(`[model:call] Using noToolsLLM (simple query, no tools)`);
    } else if (runCtx.loopNudgeSent || (runCtx.complexity === "complex" && isResearchQuery(effectiveMessages))) {
      // Research or post-loop: higher temperature for diversity
      response = await researchLLM.invoke(effectiveMessages);
      console.log(`[model:call] Using researchLLM (temp 0.4)`);
    } else {
      response = await invokeWithRetry(effectiveMessages, signal);
    }

    const toolCalls = (response as any).tool_calls ?? [];

    // Reasoning enforcement: if model makes tool calls without any reasoning text,
    // inject a "think first" nudge as a system message. This doesn't block the tool
    // calls (which would double latency) but teaches the model for subsequent turns.
    if (toolCalls.length > 0 && runCtx.toolCallCount === 0 && runCtx.complexity !== "simple") {
      const reasoningText = contentToText(response.content).trim();
      if (!reasoningText || reasoningText.length < 10) {
        console.warn(`[model:call] ⚠️ No reasoning before first tool call (${toolCalls.length} calls)`);
        // Inject a reminder for the NEXT turn (after tool results come back)
        const reasoningReminder = {
          role: "system" as const,
          content: "Remember: after observing tool results, state what you learned in 1 line before your next action or final answer.",
        };
        return { messages: [reasoningReminder, response] };
      }
    }

    // Budget tracking — account for ALL parallel tool calls in one batch
    if (toolCalls.length > 0) {
      // Check if the entire batch would exceed budget
      const projectedTotal = runCtx.toolCallCount + toolCalls.length;
      if (projectedTotal > runCtx.budget.maxToolCalls) {
        console.warn(`[model:call] ⚠️ Parallel batch of ${toolCalls.length} would exceed budget (${runCtx.toolCallCount}+${toolCalls.length} > ${runCtx.budget.maxToolCalls}). Marking exceeded.`);
        runCtx.budgetExceeded = true;
        // Still let this batch through but force answer on next turn
      }

      for (const tc of toolCalls) {
        const status = runCtx.trackToolCall(tc.name);
        if (status === "exceeded") {
          console.warn(`[model:call] ⚠️ BUDGET EXCEEDED after ${runCtx.toolCallCount} calls (limit: ${runCtx.budget.maxToolCalls}). Will force answer on next turn.`);
          break;
        }
        if (status === "warning") {
          console.warn(`[model:call] ⚠️ Budget warning: ${runCtx.toolCallCount}/${runCtx.budget.maxToolCalls} calls used`);
        }
      }
    }

    // Loop detection
    const signature = runCtx.getModelOutputSignature(response);
    const loopStatus = runCtx.detectLoop(signature);

    if (loopStatus === "stop") {
      console.warn(`[model:call] ⚠️ LOOP DETECTED — forcing end. Signature: ${signature.slice(0, 100)}`);
      const loopMsg = {
        ...response,
        tool_calls: undefined,
        content: contentToText(response.content) ||
          "I noticed I was repeating the same steps. Let me stop here and share what I found so far.",
      };
      return { messages: [loopMsg] };
    }

    if (loopStatus === "nudge" && !runCtx.loopNudgeSent) {
      runCtx.loopNudgeSent = true;
      console.warn(`[model:call] ⚠️ Possible loop — injecting nudge.`);
      const nudge = {
        role: "system" as const,
        content:
          "⚠️ You are repeating the same action. STOP and either: " +
          "(1) deliver your final answer with what you have, or " +
          "(2) try a completely different approach/tool. Do NOT repeat the same tool call.",
      };
      return { messages: [nudge, response] };
    }

    // Budget warning injection
    if (runCtx.budgetWarningIssued && toolCalls.length > 0) {
      const wrapUpNudge = {
        role: "system" as const,
        content:
          `⚠️ You have used ${runCtx.toolCallCount}/${runCtx.budget.maxToolCalls} tool calls. ` +
          "Wrap up now. Only use another tool if absolutely critical.",
      };
      return { messages: [wrapUpNudge, response] };
    }

    if (toolCalls.length > 0) {
      console.log(`[model:call] → tool_calls (${toolCalls.length}): ${toolCalls.map((t: any) => t.name).join(", ")} [${runCtx.toolCallCount}/${runCtx.budget.maxToolCalls}]`);
    } else {
      const text = contentToText(response.content);
      console.log(`[model:call] → text response (${text.length} chars): ${text.slice(0, 120).replace(/\n/g, " ")}`);
    }
    return { messages: [response] };
  }

  function shouldContinue(state: typeof MessagesAnnotation.State) {
    const last = state.messages[state.messages.length - 1] as any;
    return last.tool_calls?.length > 0 ? "tools" : "__end__";
  }

  const workflow = new StateGraph(MessagesAnnotation)
    .addNode("agent", callAgentModel)
    .addNode("tools", toolNode)
    .addNode("observe", summarizeObservation)
    .addEdge("__start__", "agent")
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("tools", "observe")
    .addEdge("observe", "agent");

  return workflow.compile();
}

// Keep a default compiled graph for backward compatibility (non-streaming usage)
export const agentApp = createAgentGraph(new RunContext("default", 0));


/**
 * ============================================================================
 * CONTENT HELPERS
 * ============================================================================
 */

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((p: any) => (typeof p === "string" ? p : (p?.text ?? p?.content ?? ""))).join("");
  }
  return "";
}

function parseMaybeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeToolInput(input: unknown): unknown {
  let current = typeof input === "string" ? parseMaybeJson(input) : input;

  for (let i = 0; i < 3; i += 1) {
    if (!current || typeof current !== "object" || !("input" in current)) break;
    const nested = (current as { input?: unknown }).input;
    current = typeof nested === "string" ? parseMaybeJson(nested) : nested;
  }

  return current;
}

function normalizeToolOutput(output: unknown): string {
  const payload = (output as any)?.content
    ?? (output as any)?.kwargs?.content
    ?? (output as any)?.output
    ?? (output as any)?.result
    ?? output;
  const text = contentToText(payload);
  const raw = text || (typeof payload === "string" ? payload : "") || "Tool completed.";
  const redacted = redactSecrets(raw);

  // Smart truncation: for JSON, try to preserve structure
  if (redacted.length > MAX_TOOL_OUTPUT_CHARS) {
    // If it looks like JSON, try to parse and summarize
    if (redacted.trimStart().startsWith("{") || redacted.trimStart().startsWith("[")) {
      try {
        const parsed = JSON.parse(redacted);
        const summarized = JSON.stringify(parsed, null, 0).slice(0, MAX_TOOL_OUTPUT_CHARS);
        return summarized + "\n[... JSON truncated for brevity]";
      } catch {
        // Fall through to default truncation
      }
    }
    const head = redacted.slice(0, Math.floor(MAX_TOOL_OUTPUT_CHARS * 0.7));
    const tail = redacted.slice(-Math.floor(MAX_TOOL_OUTPUT_CHARS * 0.2));
    return `${head}\n\n... [truncated ${redacted.length - MAX_TOOL_OUTPUT_CHARS} chars] ...\n\n${tail}`;
  }
  return redacted;
}

function compactValue(value: unknown): string {
  if (value == null) return "";
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return redactSecrets(raw).replace(/\s+/g, " ").trim();
}

// Module-level constants parsed once at startup
const MAX_TOOL_OUTPUT_CHARS = Number(process.env.MAX_TOOL_OUTPUT_CHARS) || 16_000;
const MAX_SINGLE_MESSAGE_CHARS = Number(process.env.MAX_SINGLE_MESSAGE_CHARS) || 12_000;

function getMaxAgentSteps() {
  const parsed = Number(process.env.MAX_AGENT_STEPS);
  if (!Number.isFinite(parsed)) return 80;
  return Math.max(4, Math.min(120, Math.floor(parsed)));
}

function getRunTimeoutMs() {
  const parsed = Number(process.env.AGENT_RUN_TIMEOUT_MS);
  if (!Number.isFinite(parsed)) return 300_000;
  return Math.max(30_000, Math.min(600_000, Math.floor(parsed)));
}

function getMaxPromptLength() {
  const parsed = Number(process.env.MAX_PROMPT_LENGTH);
  if (!Number.isFinite(parsed)) return 8_000;
  return Math.max(100, Math.min(32_000, Math.floor(parsed)));
}

function normalizeHistory(history: ChatHistoryMessage[] = []) {
  return history
    .filter((message) => message.content.trim())
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, MAX_SINGLE_MESSAGE_CHARS),
    }));
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

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new AgentAbortError();
}


/**
 * ============================================================================
 * SYSTEM PROMPT — STRUCTURED FOR AGENTIC WORKFLOW
 * ============================================================================
 * Structure: Identity → Decision Framework → Output Format → Tool Strategy →
 *            Error Recovery → Constraints → Dynamic Context
 *
 * This structure ensures the model knows WHO it is, HOW to decide, WHAT format
 * to use, and WHEN to use which tools — in that priority order.
 */

const STATIC_AGENT_SYSTEM_PROMPT_TEMPLATE =
  // ─── SECTION 1: IDENTITY & ROLE ───────────────────────────────────────────
  "## IDENTITY\n" +
  "You are **Candle** — a fast, autonomous execution agent built for Myanmar and English-speaking users. " +
  "Your personality: direct, resourceful, and action-oriented. You solve problems, you don't discuss them.\n\n" +

  "**Core principle:** Execute first, explain only if asked. You are measured by results delivered, not words written.\n\n" +

  // ─── SECTION 2: DECISION FRAMEWORK ────────────────────────────────────────
  "## DECISION FRAMEWORK\n" +
  "Before every response, classify the request into one of these modes:\n\n" +
  "| Mode | When | Action |\n" +
  "|------|------|--------|\n" +
  "| **Instant** | Factual Q, greeting, definition, opinion | Answer directly from knowledge. Zero tool calls. |\n" +
  "| **Lookup** | Current facts, recent events, verification | 1 search_web → answer from snippets. |\n" +
  "| **Research** | Identify something by description, compare options | 1-3 searches with different angles, browse if needed. |\n" +
  "| **Execute** | Download, create, build, convert, install | Plan → execute with tools → deliver artifact. |\n" +
  "| **Multi-step** | Complex tasks needing chained tools | Plan steps → execute sequentially → verify → deliver. |\n\n" +

  "**Classification rules:**\n" +
  "- If you can answer from training data → Instant (no tools)\n" +
  "- If the user asks a question about a concept (even using action words like 'download') → Lookup or Instant\n" +
  "- If the user gives an imperative command → Execute or Multi-step\n" +
  "- When in doubt, choose the FASTER mode\n\n" +

  // ─── SECTION 3: OUTPUT FORMAT ─────────────────────────────────────────────
  "## OUTPUT FORMAT\n" +
  "- **Language:** Always match the user's language (Myanmar/English/mixed). Default to Myanmar if unclear.\n" +
  "- **Length:** Proportional to complexity. Simple → 1-3 sentences. Complex → structured but concise.\n" +
  "- **Structure:** Use headers/bullets only for multi-part answers. Plain text for simple responses.\n" +
  "- **Files/URLs:** Place download links or file URLs at the END of your response, clearly labeled.\n" +
  "- **No filler:** Never start with 'Sure!', 'Of course!', 'Let me help you with that'. Just answer.\n" +
  "- **No repetition:** Never re-list files, URLs, or information from previous turns unless explicitly asked.\n\n" +

  // ─── SECTION 4: TOOL STRATEGY ─────────────────────────────────────────────
  "## TOOL STRATEGY\n\n" +

  "### Efficiency Rules (CRITICAL)\n" +
  "Every tool call costs ~2 seconds. Minimize them ruthlessly.\n" +
  "- **1 search is enough** for simple facts. Never 'verify' with a second search.\n" +
  "- **Use snippets first.** Only browse_web if snippets are insufficient.\n" +
  "- **Batch operations.** If you need to install packages AND run code, do install first then code — don't check if installed.\n" +
  "- **No redundant checks.** If you wrote a file, it exists. Don't list_sandbox_files to confirm.\n\n" +

  "### Tool Selection Guide\n" +
  "| Need | Tool | Notes |\n" +
  "|------|------|-------|\n" +
  "| Current facts, URLs | search_web | Use specific keywords, not generic queries |\n" +
  "| Read a webpage | browse_web | Only when snippets aren't enough |\n" +
  "| Interactive web tasks | browser_interact | Login, form fill, navigation |\n" +
  "| Visual verification | screenshot_analyze | OCR, layout check, visual content |\n" +
  "| Code execution | run_python / run_node | Prefer Python for data/files |\n" +
  "| Shell commands | run_terminal | System ops, ffprobe, curl |\n" +
  "| File creation | write_sandbox_file / create_artifact | Text/code files |\n" +
  "| File delivery | get_sandbox_file_url | Always verify file exists first |\n" +
  "| HTTP APIs | http_request | When you know the exact endpoint |\n" +
  "| Package install | install_packages | pip, npm, or apt |\n" +
  "| Video download | download_video | YouTube, social media |\n" +
  "| App sourcing | app_source | Play Store / App Store |\n\n" +

  "### Search Strategy (for Research mode)\n" +
  "1. **First search:** Use the MOST DISTINCTIVE details as keywords. Target Reddit, forums, Q&A sites.\n" +
  "2. **If no match:** Try a COMPLETELY DIFFERENT angle — different language, different details, different platform.\n" +
  "3. **Never:** Rephrase the same keywords. That wastes a tool call.\n" +
  "4. **Browse:** Only promising threads/results, not random pages.\n" +
  "5. **Give up gracefully:** After 3 failed searches, present closest matches + ask 1-2 narrowing questions.\n\n" +

  // ─── SECTION 5: REASONING PROTOCOL (ReAct) ─────────────────────────────────
  "## REASONING PROTOCOL\n" +
  "For Execute and Multi-step modes, follow Think → Act → Observe:\n\n" +
  "**Before EVERY tool call**, state in 1 line:\n" +
  "- What you need and why this tool/approach\n\n" +
  "**After EVERY tool result**, state in 1 line:\n" +
  "- What you learned → next action OR deliver answer\n\n" +
  "**For Multi-step tasks**, output a 2-4 step plan BEFORE your first tool call:\n" +
  "```\n" +
  "Plan: 1) ... 2) ... 3) ...\n" +
  "```\n" +
  "This keeps you focused and prevents wasted tool calls. Skip this for Instant/Lookup modes.\n\n" +

  // ─── SECTION 6: ERROR RECOVERY ────────────────────────────────────────────
  "## ERROR RECOVERY\n" +
  "When a tool fails, follow this decision tree:\n\n" +
  "```\n" +
  "Tool failed?\n" +
  "├── Network/timeout error → Retry once with same params\n" +
  "├── 404/not found → Try alternative source (different URL, different search)\n" +
  "├── Permission denied → Try different approach (different library, different method)\n" +
  "├── Parse error → Fix input format and retry\n" +
  "└── Same error 3x → STOP. Report what you tried and suggest alternatives.\n" +
  "```\n\n" +
  "**Never:** Retry the same failing call more than once. Each retry must change something.\n\n" +

  // ─── SECTION 7: HANDLING AMBIGUITY ────────────────────────────────────────
  "## HANDLING AMBIGUITY\n" +
  "When the request is unclear:\n" +
  "1. Infer intent from conversation history and common sense.\n" +
  "2. Pick the most practical interpretation and execute.\n" +
  "3. State your assumption briefly at the start: 'X လို့ ယူဆပြီး...'\n" +
  "4. Only ask for clarification if you have ZERO context to work with.\n\n" +

  "**Follow-up shortcuts:**\n" +
  "- 'အဲဒါလုပ်ပေး' → do the last discussed thing\n" +
  "- 'ဒေါင်းပေး' → download what was just mentioned\n" +
  "- 'ပြင်ပေး' → fix the most obvious issue\n" +
  "- 'ထပ်ရှာပေး' → search with DIFFERENT strategy, not same keywords\n\n" +

  // ─── SECTION 8: CONSTRAINTS ───────────────────────────────────────────────
  "## CONSTRAINTS\n" +
  "- **No lectures.** Never explain why you can't do something. Find a way or report what you tried.\n" +
  "- **No disclaimers.** No moral commentary unless explicitly asked.\n" +
  "- **No secrets exposure.** Never print API keys, tokens, cookies, or env vars.\n" +
  "- **No binary dumps.** Never output raw binary/audio/video to chat. Process in sandbox.\n" +
  "- **No URL repetition.** Only share URLs for files created in the CURRENT turn.\n" +
  "- **Context awareness.** You have limited context window. Be concise in internal reasoning.\n\n" +

  // ─── SECTION 9: FEW-SHOT EXAMPLES ─────────────────────────────────────────
  "## EXAMPLES\n\n" +
  "**Example 1 — Instant (no tools):**\n" +
  "User: 'ရန်ကုန်က မြန်မာနိုင်ငံရဲ့ မြို့တော်လား'\n" +
  "→ Mode: Instant. Answer: 'နေပြည်တော်က မြို့တော်ပါ။ ရန်ကုန်က စီးပွားရေးမြို့တော်ပါ။'\n\n" +

  "**Example 2 — Lookup (1 search):**\n" +
  "User: 'ရန်ကုန်မှာ အခု ရာသီဥတု ဘယ်လိုလဲ'\n" +
  "→ Mode: Lookup. search_web('Yangon weather today') → answer from snippet.\n\n" +

  "**Example 3 — Execute (action):**\n" +
  "User: 'ဒီ video ဒေါင်းပေး https://youtube.com/watch?v=xxx'\n" +
  "→ Mode: Execute. Plan: 1) download_video 2) get_sandbox_file_url 3) deliver link.\n\n" +

  "**Example 4 — Research (identification):**\n" +
  "User: 'ကောင်မလေးတစ်ယောက် ပင်လယ်ထဲ ကျသွားပြီး ငါးမင်းသမီး ဖြစ်သွားတဲ့ anime'\n" +
  "→ Mode: Research. search_web('anime girl falls into ocean becomes mermaid') → if no match, try 'anime 海 人魚 少女' → browse promising result.\n\n" +

  // ─── SECTION 10: DYNAMIC CONTEXT (injected at runtime) ────────────────────
  "## TASK-SPECIFIC CONTEXT\n" +
  "{{dynamic_context}}\n" +
  "{{artifact_context}}\n";


/**
 * ============================================================================
 * SYSTEM MESSAGE BUILDER
 * ============================================================================
 */

async function buildAgentSystemMessage(prompt: string, artifactRegistry: ArtifactRegistry, complexity: QueryComplexity) {
  // Skip Pinecone round-trip for simple/trivial queries — unnecessary latency
  const dynamicContext = complexity === "simple"
    ? "No task-specific instructions needed for this query."
    : await retrieveDynamicContext(prompt);
  const artifactContext = artifactRegistry.getSummary();

  let content = STATIC_AGENT_SYSTEM_PROMPT_TEMPLATE
    .replace("{{dynamic_context}}", dynamicContext)
    .replace("{{artifact_context}}", artifactContext);

  // For complex tasks, inject explicit planning requirement
  if (complexity === "complex") {
    content +=
      "\n\n## ⚡ PLANNING REQUIRED\n" +
      "This is a complex task. Before your FIRST tool call, output a brief plan:\n" +
      "```\n" +
      "Plan:\n" +
      "1) [first step]\n" +
      "2) [second step]\n" +
      "3) [deliver result]\n" +
      "```\n" +
      "Then execute the plan step by step. Adjust if a step fails.";
  }

  return {
    role: "system" as const,
    content,
  };
}

/**
 * ============================================================================
 * GLOBAL RUN TIMEOUT
 * ============================================================================
 */

function createTimeoutSignal(
  userSignal?: AbortSignal,
  timeoutMs?: number
): { signal: AbortSignal; cleanup: () => void } {
  const effectiveTimeout = timeoutMs ?? getRunTimeoutMs();
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort(new AgentTimeoutError(effectiveTimeout));
  }, effectiveTimeout);

  const onUserAbort = () => controller.abort(userSignal?.reason);
  userSignal?.addEventListener("abort", onUserAbort);

  const cleanup = () => {
    clearTimeout(timer);
    userSignal?.removeEventListener("abort", onUserAbort);
  };

  return { signal: controller.signal, cleanup };
}

/**
 * ============================================================================
 * MAIN STREAM ENTRY POINT
 * ============================================================================
 * Called by server.ts on every inbound WebSocket prompt.
 * Each call gets its own RunContext and compiled graph — no shared mutable state.
 */

export async function runAgentStream(
  prompt: string,
  emitEvent: (event: any) => void,
  options: {
    signal?: AbortSignal;
    history?: ChatHistoryMessage[];
    artifactRegistry?: ArtifactRegistry;
  } = {}
): Promise<string> {
  // Input validation
  const maxPromptLen = getMaxPromptLength();
  if (prompt.length > maxPromptLen) {
    const truncated = prompt.slice(0, maxPromptLen);
    console.warn(`[agent:start] prompt truncated from ${prompt.length} to ${maxPromptLen} chars`);
    prompt = truncated;
  }

  if (!prompt.trim()) {
    emitEvent({ type: "error", content: "Empty prompt received." });
    return "";
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`[agent:start] prompt  : ${compactValue(prompt).slice(0, 200)}`);
  console.log(`[agent:start] history : ${(options.history ?? []).length} messages`);
  console.log(`[agent:start] steps   : max ${getMaxAgentSteps()}`);
  console.log(`[agent:start] timeout : ${getRunTimeoutMs() / 1000}s`);
  console.log(`${"═".repeat(60)}`);
  emitEvent({ type: "mode", mode: "agent" });

  // Create per-run context — each connection gets its own isolated state
  const runCtx = new RunContext(prompt, (options.history ?? []).length);

  // Setup timeout
  const { signal: runSignal, cleanup: cleanupTimeout } = createTimeoutSignal(
    options.signal,
    getRunTimeoutMs()
  );

  // Create a per-run graph with RunContext captured in closure (no global state)
  const perRunGraph = createAgentGraph(runCtx, runSignal);

  const artifactRegistry = options.artifactRegistry ?? new ArtifactRegistry();
  const failureTracker = new FailureTracker();
  const streamedModelRuns = new Map<string, boolean>();
  const toolStartTimes = new Map<string, number>();
  let hasVisibleAssistantText = false;
  let sentToolStartNotice = false;
  const assistantTextChunks: string[] = [];

  try {
    // Summarize old history to prevent context overflow
    const processedHistory = summarizeOldHistory(options.history ?? []);
    const systemMessage = await buildAgentSystemMessage(prompt, artifactRegistry, runCtx.complexity);
    throwIfAborted(runSignal);

    const eventStream = perRunGraph.streamEvents(
      { messages: [systemMessage, ...normalizeHistory(processedHistory), { role: "user", content: prompt }] },
      { version: "v2", recursionLimit: getMaxAgentSteps(), signal: runSignal }
    );

    for await (const event of eventStream) {
      throwIfAborted(runSignal);

      const { event: eventType, name, data, run_id } = event;

      if (eventType === "on_chat_model_stream") {
        const reasoning = data.chunk?.additional_kwargs?.reasoning_content as string | undefined;
        if (reasoning) {
          emitEvent({ type: "reasoning_chunk", content: redactSecrets(reasoning) });
        }

        const text = contentToText(data.chunk?.content);
        if (text) {
          streamedModelRuns.set(run_id, true);
          hasVisibleAssistantText = true;
          const safeText = redactSecrets(text);
          assistantTextChunks.push(safeText);
          emitEvent({ type: "thought_chunk", content: safeText });
        }
      } else if (eventType === "on_chat_model_end") {
        if (!streamedModelRuns.get(run_id)) {
          const text = contentToText(data.output?.content);
          if (text) {
            hasVisibleAssistantText = true;
            const safeText = redactSecrets(text);
            assistantTextChunks.push(safeText);
            emitEvent({ type: "thought_chunk", content: safeText });
          }
        }
      } else if (eventType === "on_tool_start") {
        if (!hasVisibleAssistantText && !sentToolStartNotice) {
          sentToolStartNotice = true;
          hasVisibleAssistantText = true;
          emitEvent({
            type: "thought_chunk",
            content: "I will take this from here and keep you posted as I work.",
          });
        }

        toolStartTimes.set(run_id, Date.now());
        const toolInput = normalizeToolInput(data.input);
        console.log(`\n${"─".repeat(60)}`);
        console.log(`[tool:start] ▶ ${name}`);
        console.log(`[tool:start]   run_id : ${run_id}`);
        console.log(`[tool:start]   input  : ${compactValue(toolInput).slice(0, 400)}`);
        emitEvent({ type: "tool_start", toolName: name, input: redactSecretsDeep(toolInput), toolIndex: runCtx.toolCallCount, budget: runCtx.budget.maxToolCalls });
      } else if (eventType === "on_tool_end") {
        const startedAt = toolStartTimes.get(run_id);
        const elapsed = startedAt ? `${Date.now() - startedAt}ms` : "?ms";
        const rawOutput = normalizeToolOutput(data.output);
        const isError = /^(Failed to|Error:|refused)/i.test(rawOutput.trim());
        const outputPreview = rawOutput.slice(0, 600);

        if (isError) {
          console.error(`[tool:end]   ✗ ${name} (${elapsed})`);
          console.error(`[tool:end]   ERROR: ${outputPreview}`);
          const hint = failureTracker.recordFailure(name, rawOutput);
          if (hint) {
            console.warn(`[tool:end]   ⚠️ Repeated failure detected for ${name}`);
            // Inject hint into RunContext so model sees it on next call
            runCtx.pendingFailureHint = hint;
            emitEvent({ type: "thought_chunk", content: `\n${hint}\n` });
          }
        } else {
          console.log(`[tool:end]   ✓ ${name} (${elapsed})`);
          console.log(`[tool:end]   output : ${outputPreview}`);
          failureTracker.recordSuccess(name);
          artifactRegistry.extractFromToolOutput(name, rawOutput);
        }
        console.log(`${"─".repeat(60)}\n`);
        emitEvent({ type: "tool_end", toolName: name, output: rawOutput });
      }
    }

    throwIfAborted(runSignal);
    const finalText = assistantTextChunks.join("").trim();
    console.log(`\n${"═".repeat(60)}`);
    console.log(`[agent:done] final response: ${finalText.slice(0, 200).replace(/\n/g, " ")}`);
    console.log(`[agent:done] tool calls used: ${runCtx.toolCallCount}/${runCtx.budget.maxToolCalls}`);
    console.log(`${"═".repeat(60)}\n`);
    return finalText;
  } catch (error: any) {
    if (error instanceof AgentTimeoutError) {
      const partial = assistantTextChunks.join("").trim();
      const timeoutMsg = "⏱️ The agent run timed out. Here's what was completed so far:";
      emitEvent({ type: "thought_chunk", content: `\n\n${timeoutMsg}` });
      console.warn(`[agent:timeout] Run timed out after ${getRunTimeoutMs() / 1000}s`);
      return partial ? `${partial}\n\n${timeoutMsg}` : timeoutMsg;
    }
    throw error;
  } finally {
    cleanupTimeout();
  }
}
