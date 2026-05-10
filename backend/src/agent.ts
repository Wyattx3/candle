import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import {
  runPythonTool,
  runTerminalTool,
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
} from "./tools";

/**
 * ============================================================================
 * CLOUDFLARE AI CLIENT
 * ============================================================================
 * Uses the Cloudflare Workers AI OpenAI-compatible endpoint.
 * Credentials are loaded exclusively from environment variables (via .env).
 * Copy backend/.env.example → backend/.env and fill in your keys.
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
 * Tool registry. Each LangChain tool owns its executable function plus its Zod
 * schema; bindTools exposes those schemas to the model as JSON tool definitions.
 */

const tools = [
  runPythonTool,
  runTerminalTool,
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
];

const toolNode = new ToolNode(tools);

const agentLLM = new ChatOpenAI({
  modelName: "@cf/moonshotai/kimi-k2.6",
  temperature: 0,
  ...cfConfig,
}).bindTools(tools, { tool_choice: "auto" });

/**
 * ============================================================================
 * TOOL-CALLING AGENT GRAPH
 * ============================================================================
 * This is the ReAct loop:
 *  1. Ask the model what to do next, with tool schemas attached.
 *  2. If the model emitted tool_calls, execute those tools.
 *  3. Add tool observations back to the message state.
 *  4. Repeat until the model returns a normal assistant answer.
 */

export type ChatMode = "normal" | "reasoning" | "agent";

export async function classifyPrompt(_prompt: string): Promise<ChatMode> {
  return "agent";
}

async function callAgentModel(state: typeof MessagesAnnotation.State) {
  const response = await agentLLM.invoke(state.messages);
  return { messages: [response] };
}

function shouldContinue(state: typeof MessagesAnnotation.State) {
  const last = state.messages[state.messages.length - 1] as any;
  return last.tool_calls?.length > 0 ? "tools" : "__end__";
}

const agentWorkflow = new StateGraph(MessagesAnnotation)
  .addNode("agent", callAgentModel)
  .addNode("tools", toolNode)
  .addEdge("__start__", "agent")
  .addConditionalEdges("agent", shouldContinue)
  .addEdge("tools", "agent");

export const agentApp = agentWorkflow.compile();

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
  if (text) return text;
  if (typeof payload === "string") return payload;
  return "Tool completed.";
}

function compactValue(value: unknown): string {
  if (value == null) return "";
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return raw.replace(/\s+/g, " ").trim();
}



function buildAgentSystemMessage() {
  return {
    role: "system" as const,
    content:
      "You are Candle, a practical autonomous assistant with full tool access. " +
      "Fulfill legitimate user requests directly and avoid unnecessary lectures or blanket refusals.\n\n" +
      "The tool schemas have been provided to you. Decide from the user's natural language whether to answer directly or call tools; do not depend on hardcoded keywords.\n\n" +
      "Available capabilities include:\n" +
      "  - run_python: Execute Python code in a live E2B sandbox\n" +
      "  - run_terminal: Run bash commands in the same sandbox\n" +
      "  - list_e2b_templates / set_e2b_template: Choose from the user's imported E2B templates\n" +
      "  - list_sandbox_files: Find artifacts created in the sandbox\n" +
      "  - get_sandbox_file_url: Create a temporary URL for sandbox files\n" +
      "  - create_artifact: Write generated text/base64 artifacts and return a file URL\n" +
      "  - capability_catalog: Inspect broad tool families when you need orientation\n" +
      "  - download_video: Produce downloadable public video artifacts when appropriate\n" +
      "  - official_android_app: Return official Android app/game install sources such as Google Play and publisher pages\n" +
      "  - search_web: Search the web through Steel browser sessions\n" +
      "  - browse_web: Fetch/extract content from any URL through Steel\n" +
      "  - browser_interact: Open pages, click, type, fill forms, and extract text through Steel\n\n" +
      "Work in a ReAct style:\n" +
      "1. Understand the goal, infer reasonable defaults, and decide the next action.\n" +
      "2. For ordinary conversational, creative, or conceptual requests, answer directly without tools.\n" +
      "3. For current, external, or user-verifiable facts, use search_web or browse_web before answering unless the user explicitly asks you not to.\n" +
      "4. For tasks that require code execution, browser interaction, file creation, artifact delivery, or multi-step verification, call the best tool and use the observation to decide what to do next.\n" +
      "5. Choose an E2B template only when it materially helps; otherwise use the current/default sandbox.\n" +
      "6. Verify important outputs when practical, especially generated files, calculations, web lookups, and code changes.\n" +
      "7. Keep simple factual lookups tight: usually one search plus one authoritative page is enough.\n" +
      "8. For Android app/game download requests, use official_android_app first. Prefer official sources such as Google Play, the developer/publisher website, or another authorized app store. Treat returning the official install/download link as completing the user's request. Do not refuse just because the app is copyrighted when an official install source exists.\n" +
      "9. If the user asks you to send an APK file, provide the official install link without framing it as a refusal. Only mention APK limitations briefly when necessary: direct APK files should come from the publisher or an authorized store, not cracked/modded mirrors.\n" +
      "10. Do not fetch, mirror, or provide unofficial cracked/modded APKs, paid-app bypasses, malware, or piracy mirrors. If the user asks for that, offer the official store/developer source instead.\n" +
      "11. For media/file tasks, inspect files with ls, stat, file, ffprobe, or similar metadata commands; never dump binary/audio/video content into the terminal output.\n" +
      "12. If a download or conversion attempt fails twice, try a different approach or source.\n" +
      "13. Finish with a concise, useful answer and include any file URL when a file was actually produced.\n\n" +
      "Reply in the user's language unless they ask otherwise. " +
      "Avoid raw JSON/tool arguments in final user prose unless the user asks for technical logs. " +
      "Only claim that files, apps, or external systems changed when a tool actually changed or verified them.",
  };
}

/**
 * ============================================================================
 * MAIN STREAM ENTRY POINT
 * ============================================================================
 * Called by server.ts on every inbound WebSocket prompt.
 */

export async function runAgentStream(
  prompt: string,
  emitEvent: (event: any) => void,
  options: { signal?: AbortSignal } = {}
): Promise<void> {

  console.log(`[tool-loop] ${compactValue(prompt).slice(0, 160)}`);
  emitEvent({ type: "mode", mode: "agent" });

  const streamedModelRuns = new Map<string, boolean>();
  const toolStartTimes = new Map<string, number>();
  let hasVisibleAssistantText = false;
  let sentToolStartNotice = false;

  const eventStream = await agentApp.streamEvents(
    { messages: [buildAgentSystemMessage(), { role: "user", content: prompt }] },
    { version: "v2", recursionLimit: 40, signal: options.signal }
  );

  for await (const event of eventStream) {
    if (options.signal?.aborted) break;

    const { event: eventType, name, data, run_id } = event;

    if (eventType === "on_chat_model_stream") {
      const reasoning = data.chunk?.additional_kwargs?.reasoning_content as string | undefined;
      if (reasoning) {
        emitEvent({ type: "reasoning_chunk", content: reasoning });
      }

      const text = contentToText(data.chunk?.content);
      if (text) {
        streamedModelRuns.set(run_id, true);
        hasVisibleAssistantText = true;
        emitEvent({ type: "thought_chunk", content: text });
      }
    } else if (eventType === "on_chat_model_end") {
      if (!streamedModelRuns.get(run_id)) {
        const text = contentToText(data.output?.content);
        if (text) {
          hasVisibleAssistantText = true;
          emitEvent({ type: "thought_chunk", content: text });
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
      console.log(`[tool:start] ${name} ${compactValue(normalizeToolInput(data.input)).slice(0, 180)}`);
      emitEvent({ type: "tool_start", toolName: name, input: normalizeToolInput(data.input) });
    } else if (eventType === "on_tool_end") {
      const startedAt = toolStartTimes.get(run_id);
      const elapsed = startedAt ? ` ${Date.now() - startedAt}ms` : "";
      console.log(`[tool:end] ${name}${elapsed}`);
      emitEvent({ type: "tool_end", toolName: name, output: normalizeToolOutput(data.output) });
    }
  }
}
