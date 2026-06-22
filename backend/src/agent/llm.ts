/**
 * LLM client setup. Two providers: primary (Cloudflare Workers AI by default,
 * but configurable to any OpenAI-compatible endpoint) and an optional
 * failover provider triggered by the classifier when the primary is flaky.
 *
 * Tools are bound at this layer so the loop only consumes ready-to-call LLMs.
 */

import * as dotenv from "dotenv";
import * as path from "path";
// `override: true` so values in backend/.env always win over stale shell env
// vars from a previous session. Without this, a developer who ran the agent
// once with placeholder credentials in their shell would see those leak
// into every subsequent run of the server / scripts / smoke tests, even
// after fixing .env. Production deploys typically inject env via the
// orchestrator (k8s, ECS, etc.) — that path doesn't import this file.
dotenv.config({ path: path.resolve(__dirname, "../../.env"), override: true });

import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { convertToOpenAITool } from "@langchain/core/utils/function_calling";
import { sanitizeMoonshotTools, isMoonshotModel } from "./moonshot-schema";
import {
  browseWebTool,
  browserInteractTool,
  capabilityCatalogTool,
  createArtifactTool,
  downloadVideoTool,
  transcribeAudioTool,
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
  runPythonWithToolsTool,
  runTerminalTool,
  sandboxBrowserTool,
  screenshotAnalyzeTool,
  searchWebTool,
  researchTool,
  financeResearchTool,
  setE2BTemplateTool,
  writeSandboxFileTool,
} from "../tools";
import {
  clarifyTool,
  cronjobTool,
  kanbanTool,
  todoTool,
  patchFileTool,
  skillViewTool,
  skillManageTool,
  recallRunsTool,
  spawnSubagentTool,
  spawnSubagentsParallelTool
} from "../tools_extra";
import { storeMemoryTool, searchMemoryTool, deleteMemoryTool } from "./memory";
import { semanticSearchTool } from "./rag";

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

export const MODEL_NAME = process.env.MODEL_NAME || "@cf/moonshotai/kimi-k2.6";

/**
 * Per-request timeout for a SINGLE model call (ms). Without this, a hung
 * Cloudflare/Kimi request blocks the whole run until the 300s graph timeout —
 * the user sees "thinking" for minutes. We bound each call so a stuck request
 * fails fast and `invokeWithRetry` can retry / failover. Default 75s; override
 * with LLM_REQUEST_TIMEOUT_MS.
 */
export function getLlmTimeoutMs(): number {
  const parsed = Number(process.env.LLM_REQUEST_TIMEOUT_MS);
  if (!Number.isFinite(parsed)) return 75_000;
  return Math.max(15_000, Math.min(180_000, Math.floor(parsed)));
}

/**
 * Reasoning cap (ms) — anti-rumination. The real root cause of GAIA
 * `timeout_0_tools` was the model getting stuck in a single 94-250s
 * reasoning-only generation that never committed to a tool call or answer; the
 * run-level timeout then fired mid-generation and emitted a garbage placeholder.
 * This cap bounds how long a turn may stream ONLY reasoning tokens (no content,
 * no tool-call args) before it is aborted and force-committed to a no-tools
 * answer. It is NOT a content-stall timer (that approach killed healthy thinking
 * phases) — the clock only counts reasoning-without-action and resets the moment
 * the model emits real output. Default 45s; override with LLM_REASONING_COMMIT_MS.
 * Clamped to [15s, timeout-5s] so a healthy long think can still finish while a
 * true runaway is broken well before the run budget is exhausted.
 */
export function getLlmReasoningCommitMs(): number {
  const parsed = Number(process.env.LLM_REASONING_COMMIT_MS);
  const fallback = 45_000;
  const value = Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
  const upper = Math.max(15_000, getLlmTimeoutMs() - 5_000);
  return Math.max(15_000, Math.min(upper, value));
}

/**
 * No-commit deadline (ms) — anti-dribble. Bounds wall-clock since a generation
 * STARTED before it must have committed to a real action: a complete tool call
 * OR a substantial answer. This catches the slow-dribble runaway that defeats
 * the reasoning cap — the model emits occasional content tokens (resetting the
 * reasoning clock) yet never commits, burning the full run budget (the GAIA
 * `timeout_0_tools` failures that hid as `precision`: t=0, ~250s). Unlike the
 * reasoning cap, dribbled content does NOT reset this — only a real commitment
 * does. On fire the turn is retried with an action-oriented directive. Default
 * 60s; override with LLM_COMMIT_DEADLINE_MS. Clamped to [30s, timeout-5s].
 */
export function getLlmCommitDeadlineMs(): number {
  const parsed = Number(process.env.LLM_COMMIT_DEADLINE_MS);
  const fallback = 60_000;
  const value = Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
  const upper = Math.max(30_000, getLlmTimeoutMs() - 5_000);
  return Math.max(30_000, Math.min(upper, value));
}

// `maxRetries: 0` — we own retry/backoff in `invokeWithRetry`. Letting the SDK
// ALSO retry (default 2) silently multiplies latency on a flaky provider
// (2 internal × our 3 = up to 6 waits) and can blow past the run timeout.
const LLM_CALL_TUNING = { timeout: getLlmTimeoutMs(), maxRetries: 0 } as const;

/**
 * Extended-thinking lever. Reasoning models (Kimi-k2-thinking, DeepSeek-R1,
 * o-series, GLM-thinking) only engage their chain-of-thought when the request
 * asks for it. Without this the model rushes straight to an answer/tool call —
 * the "feels shallow" symptom. When `REASONING_EFFORT` is set we pass it
 * through as an OpenAI-compatible `reasoning_effort` model kwarg.
 *
 * Default UNSET → no kwarg added → zero behavior change (and no risk of a 400
 * from a provider that rejects unknown params). Operators opt in once they know
 * their endpoint supports it. Applies to the reasoning-bearing LLMs (parent /
 * subagent / research / no-tools), NOT the cheap aux housekeeping model.
 */
function reasoningModelKwargs(): Record<string, unknown> {
  const raw = (process.env.REASONING_EFFORT ?? "").trim().toLowerCase();
  if (!raw || raw === "off" || raw === "none" || raw === "0") return {};
  const allowed = new Set(["minimal", "low", "medium", "high"]);
  if (!allowed.has(raw)) {
    console.warn(`[llm] Ignoring REASONING_EFFORT="${raw}" — expected one of minimal|low|medium|high.`);
    return {};
  }
  return { modelKwargs: { reasoning_effort: raw } };
}

const REASONING_KWARGS = reasoningModelKwargs();
if (Object.keys(REASONING_KWARGS).length > 0) {
  console.log(`[llm] Extended thinking enabled: reasoning_effort=${(REASONING_KWARGS.modelKwargs as any).reasoning_effort}`);
}

/**
 * Low-effort sibling of REASONING_KWARGS — used to break a rumination spiral.
 * When a generation TIMES OUT (the model thinks so long it never emits a tool
 * call or an answer within the per-call budget — the GAIA "0 tools, 300s,
 * empty" failure), `invokeWithRetry` retries with a low-effort LLM so the model
 * stops over-thinking and commits to acting/answering. Only meaningful when the
 * operator opted into reasoning_effort; otherwise it's empty and the swap is a
 * no-op (the retry just reuses the normal LLM — zero behavior change).
 */
const REASONING_KWARGS_LOW: Record<string, unknown> =
  Object.keys(REASONING_KWARGS).length > 0 ? { modelKwargs: { reasoning_effort: "low" } } : {};

/**
 * Tool registries.
 * `parentTools` includes `spawn_subagent` (delegation only available at top
 * level). `subagentTools` excludes it so workers cannot recurse.
 *
 * NOTE: These arrays are mutated in-place by `setMcpTools()` after MCP
 * servers connect during bootstrap. The graph reads tools through accessor
 * helpers, so the same array reference stays valid across the run.
 */
export const parentTools = [
  runPythonTool,
  runPythonWithToolsTool,
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
  transcribeAudioTool,
  officialAndroidAppTool,
  searchWebTool,
  researchTool,
  financeResearchTool,
  browseWebTool,
  browserInteractTool,
  sandboxBrowserTool,
  screenshotAnalyzeTool,
  semanticSearchTool,
  clarifyTool,
  cronjobTool,
  kanbanTool,
  todoTool,
  patchFileTool,
  skillViewTool,
  skillManageTool,
  recallRunsTool,
  storeMemoryTool,
  searchMemoryTool,
  deleteMemoryTool,
  spawnSubagentTool,
  spawnSubagentsParallelTool
];

export const subagentTools = parentTools.filter(
  (t: any) => t.name !== "spawn_subagent" && t.name !== "spawn_subagents_parallel"
);

/** Snapshot of tools added by MCP servers — kept separate so we can swap them out. */
let dynamicMcpTools: any[] = [];

/**
 * Replace the MCP-contributed tool slice and re-bind every LLM with the
 * combined registry. Called once from `server.ts` after `initMcpHost()` and
 * any time the MCP host reconnects.
 */
export function setMcpTools(nextTools: any[]): void {
  // Drop the previous MCP tools from both arrays.
  const previous = new Set(dynamicMcpTools.map((t: any) => t?.name));
  for (let i = parentTools.length - 1; i >= 0; i -= 1) {
    if (previous.has((parentTools[i] as any)?.name)) parentTools.splice(i, 1);
  }
  for (let i = subagentTools.length - 1; i >= 0; i -= 1) {
    if (previous.has((subagentTools[i] as any)?.name)) subagentTools.splice(i, 1);
  }

  // Append the new MCP tools (subagents share them too — they're external
  // capabilities, not delegation primitives, so workers benefit).
  dynamicMcpTools = Array.isArray(nextTools) ? nextTools.slice() : [];
  for (const t of dynamicMcpTools) {
    parentTools.push(t);
    const name = (t as any)?.name;
    if (name !== "spawn_subagent" && name !== "spawn_subagents_parallel") {
      subagentTools.push(t);
    }
  }

  // Rebuild the cached LLM bindings so the next invocation sees the change.
  rebindLLMs();
}

export const parentToolNode = new ToolNode(parentTools);
export const subagentToolNode = new ToolNode(subagentTools);


/**
 * Primary LLMs.
 * - agentLLM:   parent tools, temp 0, streaming. Default for moderate/complex.
 * - subagentLLM: same model without spawn_subagent (workers cannot recurse).
 * - noToolsLLM: no tools, temp 0.2 — used for simple queries and forced final answers.
 * - researchLLM / subagentResearchLLM: higher temperature for diversity.
 *
 * These are wrapped in proxies so MCP can swap the bound tool list at
 * runtime without breaking existing imports. Consumers in `loop.ts` keep
 * the same `agentLLM` / `subagentLLM` references — under the hood each
 * `.invoke()` call goes to the freshest binding.
 */
let agentLLMImpl: any;
let subagentLLMImpl: any;
let noToolsLLMImpl: any;
let researchLLMImpl: any;
let subagentResearchLLMImpl: any;
// Low-effort siblings — same model/tools, reasoning_effort forced to "low". Only
// built when the operator opted into reasoning_effort; otherwise null and the
// proxies fall back to the normal impls (zero behavior change). Used by
// invokeWithRetry to break a rumination-timeout spiral (see REASONING_KWARGS_LOW).
let agentLLMLowImpl: any = null;
let subagentLLMLowImpl: any = null;
let researchLLMLowImpl: any = null;
let subagentResearchLLMLowImpl: any = null;
let failoverAgentLLMImpl: any = null;
let failoverSubagentLLMImpl: any = null;
let auxLLMImpl: any = null;

/**
 * Bind tools to an LLM, sanitizing their JSON schemas for Moonshot/Kimi first.
 *
 * Kimi rejects standard OpenAI schemas with HTTP 400, which silently degrades
 * tool-calling into the raw-token leak we patch in `tool-call-recovery.ts`. When the
 * target model is Moonshot/Kimi we convert each tool to OpenAI format, run the
 * schema through `sanitizeMoonshotTools`, and bind the repaired dicts. For any
 * other model we bind the tools unchanged (zero behavior change).
 */
function bindToolsForModel(llm: any, tools: any[], modelName: string) {
  if (!isMoonshotModel(modelName)) {
    return llm.bindTools(tools, { tool_choice: "auto" });
  }
  try {
    const openAITools = tools.map((t) => convertToOpenAITool(t));
    const sanitized = sanitizeMoonshotTools(openAITools);
    return llm.bindTools(sanitized, { tool_choice: "auto" });
  } catch (err: any) {
    console.warn(`[llm] Moonshot tool sanitization failed (${err?.message ?? err}) — binding raw tools.`);
    return llm.bindTools(tools, { tool_choice: "auto" });
  }
}

function rebindLLMs(): void {
  agentLLMImpl = bindToolsForModel(
    new ChatOpenAI({ modelName: MODEL_NAME, temperature: 0, streaming: true, ...LLM_CALL_TUNING, ...REASONING_KWARGS, ...cfConfig }),
    parentTools,
    MODEL_NAME
  );

  subagentLLMImpl = bindToolsForModel(
    new ChatOpenAI({ modelName: MODEL_NAME, temperature: 0, streaming: true, ...LLM_CALL_TUNING, ...REASONING_KWARGS, ...cfConfig }),
    subagentTools,
    MODEL_NAME
  );

  noToolsLLMImpl = new ChatOpenAI({
    modelName: MODEL_NAME,
    temperature: 0.2,
    streaming: true,
    ...LLM_CALL_TUNING,
    ...REASONING_KWARGS,
    ...cfConfig,
  });

  researchLLMImpl = bindToolsForModel(
    new ChatOpenAI({ modelName: MODEL_NAME, temperature: 0.4, streaming: true, ...LLM_CALL_TUNING, ...REASONING_KWARGS, ...cfConfig }),
    parentTools,
    MODEL_NAME
  );

  subagentResearchLLMImpl = bindToolsForModel(
    new ChatOpenAI({ modelName: MODEL_NAME, temperature: 0.4, streaming: true, ...LLM_CALL_TUNING, ...REASONING_KWARGS, ...cfConfig }),
    subagentTools,
    MODEL_NAME
  );

  // Low-effort siblings — only meaningful when reasoning_effort is opted-in.
  // When REASONING_KWARGS_LOW is empty these are identical to the normal impls,
  // so the timeout-retry swap is a harmless no-op.
  if (Object.keys(REASONING_KWARGS_LOW).length > 0) {
    agentLLMLowImpl = bindToolsForModel(
      new ChatOpenAI({ modelName: MODEL_NAME, temperature: 0, streaming: true, ...LLM_CALL_TUNING, ...REASONING_KWARGS_LOW, ...cfConfig }),
      parentTools,
      MODEL_NAME
    );
    subagentLLMLowImpl = bindToolsForModel(
      new ChatOpenAI({ modelName: MODEL_NAME, temperature: 0, streaming: true, ...LLM_CALL_TUNING, ...REASONING_KWARGS_LOW, ...cfConfig }),
      subagentTools,
      MODEL_NAME
    );
    researchLLMLowImpl = bindToolsForModel(
      new ChatOpenAI({ modelName: MODEL_NAME, temperature: 0.4, streaming: true, ...LLM_CALL_TUNING, ...REASONING_KWARGS_LOW, ...cfConfig }),
      parentTools,
      MODEL_NAME
    );
    subagentResearchLLMLowImpl = bindToolsForModel(
      new ChatOpenAI({ modelName: MODEL_NAME, temperature: 0.4, streaming: true, ...LLM_CALL_TUNING, ...REASONING_KWARGS_LOW, ...cfConfig }),
      subagentTools,
      MODEL_NAME
    );
  } else {
    agentLLMLowImpl = null;
    subagentLLMLowImpl = null;
    researchLLMLowImpl = null;
    subagentResearchLLMLowImpl = null;
  }

  if (failoverConfig) {
    failoverAgentLLMImpl = bindToolsForModel(
      new ChatOpenAI({ modelName: FAILOVER_MODEL_NAME!, temperature: 0, streaming: false, ...LLM_CALL_TUNING, ...failoverConfig }),
      parentTools,
      FAILOVER_MODEL_NAME!
    );

    failoverSubagentLLMImpl = bindToolsForModel(
      new ChatOpenAI({ modelName: FAILOVER_MODEL_NAME!, temperature: 0, streaming: false, ...LLM_CALL_TUNING, ...failoverConfig }),
      subagentTools,
      FAILOVER_MODEL_NAME!
    );
  }

  // Optional auxiliary model for cheap, no-tools housekeeping (background
  // review, title generation). No tools bound — these tasks never call tools.
  if (auxConfig) {
    auxLLMImpl = new ChatOpenAI({
      modelName: AUX_MODEL_NAME!,
      temperature: 0.2,
      streaming: false,
      ...LLM_CALL_TUNING,
      ...auxConfig,
    });
  } else {
    auxLLMImpl = null;
  }
}

/**
 * Build a thin proxy whose `.invoke()` always reaches into the live binding.
 * Static imports of `agentLLM` / `subagentLLM` therefore see fresh tool
 * bindings after `setMcpTools()` runs.
 */
function makeLiveProxy(getter: () => any): { invoke: (msgs: any[], options?: any) => Promise<any> } {
  return {
    invoke: (msgs: any[], options?: any) => getter().invoke(msgs, options),
  };
}

export const agentLLM = makeLiveProxy(() => agentLLMImpl);
export const subagentLLM = makeLiveProxy(() => subagentLLMImpl);
export const noToolsLLM = makeLiveProxy(() => noToolsLLMImpl);
export const researchLLM = makeLiveProxy(() => researchLLMImpl);
export const subagentResearchLLM = makeLiveProxy(() => subagentResearchLLMImpl);

// Low-effort siblings — fall back to the normal impl when reasoning_effort
// wasn't opted in (so the timeout-retry swap is a safe no-op in that case).
export const agentLLMLow = makeLiveProxy(() => agentLLMLowImpl ?? agentLLMImpl);
export const subagentLLMLow = makeLiveProxy(() => subagentLLMLowImpl ?? subagentLLMImpl);
export const researchLLMLow = makeLiveProxy(() => researchLLMLowImpl ?? researchLLMImpl);
export const subagentResearchLLMLow = makeLiveProxy(() => subagentResearchLLMLowImpl ?? subagentResearchLLMImpl);
/** True when low-effort variants are distinct from the normal ones (operator opted into reasoning_effort). */
export const REASONING_LOW_AVAILABLE = Object.keys(REASONING_KWARGS_LOW).length > 0;

/**
 * Auxiliary LLM for cheap, no-tools housekeeping work (background review,
 * session titles). When an auxiliary model is configured it routes there
 * (smaller/cheaper, keeps load off the primary); otherwise it transparently
 * falls back to `noToolsLLM` so behavior is unchanged when unconfigured.
 */
export const auxLLM = makeLiveProxy(() => auxLLMImpl ?? noToolsLLMImpl);


/**
 * Optional failover provider.
 * Activated when FAILOVER_API_KEY + FAILOVER_BASE_URL + FAILOVER_MODEL_NAME
 * are all set. Streaming is OFF on this path — failover is a "just give me an
 * answer" path; we'd rather get a complete response than stream from a flaky
 * source.
 */
const FAILOVER_API_KEY = process.env.FAILOVER_API_KEY?.trim();
const FAILOVER_BASE_URL = process.env.FAILOVER_BASE_URL?.trim();
const FAILOVER_MODEL_NAME = process.env.FAILOVER_MODEL_NAME?.trim();

export const FAILOVER_AVAILABLE = Boolean(
  FAILOVER_API_KEY && FAILOVER_BASE_URL && FAILOVER_MODEL_NAME
);

if (FAILOVER_AVAILABLE) {
  console.log(`[failover] secondary provider configured: model=${FAILOVER_MODEL_NAME} baseUrl=${FAILOVER_BASE_URL?.slice(0, 60)}…`);
} else {
  console.log("[failover] secondary provider NOT configured — set FAILOVER_API_KEY, FAILOVER_BASE_URL, FAILOVER_MODEL_NAME to enable.");
}

const failoverConfig = FAILOVER_AVAILABLE
  ? {
      apiKey: FAILOVER_API_KEY!,
      configuration: {
        baseURL: FAILOVER_BASE_URL!,
        defaultHeaders: { Authorization: `Bearer ${FAILOVER_API_KEY!}` },
      },
    }
  : null;

/**
 * Optional auxiliary (small/cheap) model for no-tools housekeeping work.
 * Two ways to configure:
 *   1. Just `AUX_MODEL_NAME` — reuse the PRIMARY provider's key + base URL
 *      with a smaller model (e.g. a cheaper Cloudflare model).
 *   2. `AUX_MODEL_NAME` + `AUX_API_KEY` + `AUX_BASE_URL` — a fully separate
 *      provider for housekeeping.
 * Unset → housekeeping uses the primary no-tools LLM (no behavior change).
 */
const AUX_MODEL_NAME = process.env.AUX_MODEL_NAME?.trim();
const AUX_API_KEY = process.env.AUX_API_KEY?.trim();
const AUX_BASE_URL = process.env.AUX_BASE_URL?.trim();

export const AUX_AVAILABLE = Boolean(AUX_MODEL_NAME);

const auxConfig = AUX_AVAILABLE
  ? (AUX_API_KEY && AUX_BASE_URL
      ? {
          apiKey: AUX_API_KEY,
          configuration: {
            baseURL: AUX_BASE_URL,
            defaultHeaders: { Authorization: `Bearer ${AUX_API_KEY}` },
          },
        }
      : cfConfig) // reuse the primary provider with a different model name
  : null;

if (AUX_AVAILABLE) {
  console.log(`[aux] auxiliary housekeeping model configured: model=${AUX_MODEL_NAME}${AUX_BASE_URL ? ` baseUrl=${AUX_BASE_URL.slice(0, 60)}…` : " (primary provider)"}`);
}

// Initial bind happens AFTER failoverConfig is resolved so the failover
// LLMs are part of the first build.
rebindLLMs();

export function pickFailoverLLM(primary: { invoke: (msgs: any[]) => Promise<any> }) {
  if (!FAILOVER_AVAILABLE) return null;
  if (primary === subagentLLM || primary === subagentResearchLLM) return failoverSubagentLLMImpl;
  return failoverAgentLLMImpl;
}
