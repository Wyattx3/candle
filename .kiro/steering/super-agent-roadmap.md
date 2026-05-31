---
inclusion: manual
---

# Super-Agent Roadmap

Source: `super_agent_blueprint.md` (provided by the user). Goal: evolve Candle into a Manus-style autonomous agent by porting proven patterns from Hermes Agent and AionUi while preserving Candle's existing strengths (per-connection RunContext, tool-budget enforcement, multilingual prompt classification).

## The 5 pillars

1. **Dynamic Skill System** — procedural memory with closed-loop learning
2. **General-purpose Computer / Browser Use** — E2B desktop template + Playwright + visual interaction
3. **Hierarchy of Agents** — Planner / Worker LangGraph pattern
4. **Standardized Tool Registry** — MCP host integration so community servers plug in dynamically
5. **Failover & Cost-Safety** — error classification, model fallover, runaway-cost mechanism

## Implementation status

| Step | Description | Status | Key files |
| ---- | ----------- | ------ | --------- |
| 1 | Skills directory + skill_view / skill_manage tools + system-prompt index injection | ✅ done | `backend/src/skills.ts`, `backend/context/skills/`, `skillViewTool` and `skillManageTool` in `backend/src/tools_extra.ts`, registered in `parentTools` in `backend/src/agent/llm.ts` |
| 2 | In-sandbox Playwright browser with persistent profile, downloads + screenshots delivered as artifacts | ✅ done (template rebuild required) | `backend/e2b.Dockerfile` (Playwright + Chromium + tesseract installed), `sandboxBrowserTool` in `backend/src/tools.ts`, `backend/context/skills/sandbox-browser-workflow/SKILL.md` |
| 3 | WebSocket approval flow for terminal commands (`allow_once` / `allow_always` / `reject`) with risk classification | ✅ done | `backend/src/approvals.ts`, `backend/src/server.ts` (gate + WS plumbing), `runTerminalTool` in `backend/src/tools.ts`, frontend `ApprovalCard` + `ApprovalContext` in `app/index.tsx`, `backend/context/skills/command-approval-workflow/SKILL.md` |
| 4 | Planner / Worker subagent delegation via `spawn_subagent` tool with isolated RunContext | ✅ done | `runSubagent` in `backend/src/agent/subagent.ts`, parametric `createAgentGraph` in `backend/src/agent/loop.ts`, `spawnSubagentTool` in `backend/src/tools_extra.ts` (lazy registration via `registerSpawnSubagentRunner` from `backend/src/agent/index.ts`), frontend tool labels in `app/index.tsx`, `backend/context/skills/subagent-delegation-workflow/SKILL.md` |
| 5a | MCP host integration | ✅ done | `backend/src/mcp.ts` (host module — connect/shutdown/catalog), `setMcpTools` in `backend/src/agent/llm.ts` (re-bind tools at runtime), `initMcpHost` + `shutdownMcpHost` wiring in `backend/src/server.ts`, system-prompt block in `backend/src/agent/prompts.ts` |
| 6 | Run checkpoints + crash recovery + resume API | ✅ done | `backend/src/agent/checkpoint.ts` (file-backed `CheckpointStore`), incremental save in `backend/src/agent/index.ts`, `markStaleAsInterrupted` at boot in `backend/src/server.ts`, `GET /runs`, `GET /runs/:id`, `DELETE /runs/:id`, `POST /runs/:id/resume` HTTP API |
| 5b | API error classifier + main/failover model swap | ✅ done | `backend/src/llm-errors.ts` (classifier + backoff helper), `invokeWithRetry` in `backend/src/agent.ts` (classifier-driven retry + opt-in failover via `FAILOVER_*` env), user-facing message routing in `backend/src/server.ts` |
| 5c | Per-tool cost weights + cost ceiling on top of the existing call/search/browse caps | ✅ done | `TOOL_COST_WEIGHTS`, `COST_CEILINGS`, `RunContext.costScore`/`costCeiling` in `backend/src/agent.ts` |

## Step 1 conventions (already shipped)

- Skill files live under `backend/context/skills/<skill-name>/SKILL.md` with YAML front-matter (`name`, `description`, optional `tags`).
- Only the index (name + description + tags) goes into the system prompt — bodies are loaded on demand via `skill_view`.
- `skill_manage(action="create")` persists new skills for closed-loop learning. The agent should only create skills after solving a non-trivial, generalizable task.
- The skill tool definitions live in `backend/src/tools.ts` and are registered in the `tools` array in `backend/src/agent.ts`. The `getSkillIndexText()` function from `backend/src/skills.ts` is interpolated into the static system prompt template (`{{skill_index}}` placeholder).
- README at `backend/context/skills/README.md` documents the convention for human contributors.

## Step 2 conventions (already shipped)

- The E2B sandbox image now has Playwright + Chromium + tesseract pre-installed (`backend/e2b.Dockerfile`). The image must be rebuilt before the new tool works: `cd backend && npm run e2b:template:create`.
- A new `sandbox_browser` tool runs Playwright **inside** the sandbox using `python3` + `playwright.sync_api`. It lives next to the existing `browser_interact` (Kernel) and `browse_web` (read-only) tools — agent picks based on need.
- Persistent profile path: `/home/user/.candle_browser_profile`. Cookies/localStorage carry across tool calls in the same sandbox session. Pass `reset_profile: true` to wipe.
- Downloads land in `/home/user/downloads`, screenshots in `/home/user/screenshots`. Each artifact in the response is auto-enriched with a sandbox `downloadUrl` so the model doesn't need a follow-up `get_sandbox_file_url` call.
- An auto-screenshot is captured on success so the multimodal client always has visual state for the final page.
- Action surface: `goto | click | type | press | select | scroll | wait | extract | screenshot | download`.
- Companion skill: `backend/context/skills/sandbox-browser-workflow/SKILL.md`.

## Step 3 conventions (already shipped)

- `backend/src/approvals.ts` exposes `classifyCommandRisk` (low/medium/high heuristic) and an `AsyncLocalStorage`-based `ApprovalGate` plumbed via `withApprovalContext`. Tool code calls `getApprovalGate()` to retrieve the current gate without changing tool signatures.
- `runTerminalTool` consults the gate: `low` runs immediately; `high` is auto-rejected without prompting; `medium` returns a structured rejection JSON when the user declines so the model can recover instead of retrying.
- Two new WebSocket events: server emits `approval_request { requestId, command, riskLevel, reason, timeoutMs }`, client replies with `approval_response { requestId, decision }` where `decision ∈ {allow_once, allow_always, reject}`. Server also emits `approval_decision { source, decision, command }` for non-user resolutions (auto/cache/timeout) so the UI can update.
- Per-connection state in `server.ts`: `pendingApprovals` map (timeout = 120 s, default reject on timeout) and `allowAlwaysCommands` cache (per-connection only, never persisted to disk). Pending approvals are flushed when a new prompt arrives or the connection closes.
- Frontend in `app/index.tsx`: new `approval` variant on `AiStreamNode`, `ApprovalCard` component rendered inside the action pane, `ApprovalContext` provider at `ChatScreen` so cards can dispatch decisions back through the same socket.
- Companion skill: `backend/context/skills/command-approval-workflow/SKILL.md` teaches the model how to behave around the gate (don't probe, don't retry on rejection, prefer single-purpose commands).

## Step 4 conventions (already shipped)

- Tool-based delegation, not graph rewrite. The parent agent stays the planner; a new `spawn_subagent` tool runs a fresh sub-graph for a focused sub-task. Decision rationale: preserves every existing safety net (RunContext, budget tracking, loop detection, observation summarizer, failure tracker) on the parent without duplicating them.
- `createAgentGraph(runCtx, signal, { mode })` accepts `mode: "parent" | "subagent"`. Parent mode binds the full tool list including `spawn_subagent`; subagent mode strips `spawn_subagent` so workers cannot recurse.
- Two tool registries in `backend/src/agent.ts`: `parentTools` (full list) and `subagentTools` (no spawn). Each has its own `ToolNode`, default LLM (`agentLLM` / `subagentLLM`), and research-temperature LLM (`researchLLM` / `subagentResearchLLM`). `agentLLM` remains exported for the legacy `agentApp` default graph.
- Subagent budget is hard-capped: `MAX_SUBAGENT_TOOL_CALLS = 14`, `SUBAGENT_TIMEOUT_MS = 120_000`. The parent's abort signal propagates so user cancellation kills the worker too.
- Subagents inherit the parent's artifact registry. Files they create are visible in the parent's final response. The tool result reports only artifacts that are NEW since the spawn started, computed via a path/url diff.
- Lazy circular-import shim: `backend/src/tools.ts` exposes `registerSpawnSubagentRunner` and `setSubagentRunBindings`. `agent.ts` calls these once at module load (after `runSubagent` is defined). The tool itself doesn't import `agent.ts`, avoiding the cycle.
- Subagent system prompt reuses the parent's static template plus a `SUBAGENT SCOPE` section that enforces: no nested spawn, no clarifying questions, 2-6 sentence final answer.
- Frontend support in `app/index.tsx`: `spawn_subagent` calls render with action label `Subagent`, target name = the task string (truncated to 80 chars), so users can see what was delegated. Worker-internal tool calls stay invisible — exactly what we want, otherwise the timeline floods.
- Companion skill: `backend/context/skills/subagent-delegation-workflow/SKILL.md` teaches the model when delegation pays off and how to hand a self-contained task to the worker.

## Step 5b conventions (already shipped)

- `backend/src/llm-errors.ts` exposes `classifyLlmError(error)` returning `{ class, retryable, failoverable, summary, statusCode }`. Classes: `auth`, `bad_request`, `rate_limit`, `quota`, `timeout`, `network`, `server`, `model_unavailable`, `context_length`, `unknown`. Defaults to `unknown` + `retryable=true` so we don't accidentally fail closed on a new error shape.
- Auth / bad_request / context_length always bubble up — these are configuration or prompt issues, not provider problems.
- Failover provider is opt-in via three env vars (`FAILOVER_API_KEY`, `FAILOVER_BASE_URL`, `FAILOVER_MODEL_NAME`). All three must be set to enable; otherwise the existing retry behavior runs unchanged.
- Failover binds to both parent and subagent tool registries so workers also benefit. Streaming is disabled on the failover path — failover is the "just give me an answer" path, we'd rather have a complete response than stream from a flaky source.
- `invokeWithRetry` flow: (1) up to `maxRetries` attempts on the primary with classifier-driven backoff; (2) one shot at the failover provider if available and the failure class warrants it; (3) re-throw the latest error so logs reflect what actually failed last.
- Sanitized error logs — secrets matched by `sk-…` / JWT / `Bearer …` / `api_key=…` patterns are redacted before any classification summary lands in the log stream.
- User-facing error messages in `server.ts` are now classifier-driven: auth → "credentials" message, quota → "exhausted" message, context_length → "start a new chat", rate_limit → "try again in a moment", everything else → existing fallback. No raw error strings reach the client.

## Step 5c conventions (already shipped)

- Per-tool cost weights in `TOOL_COST_WEIGHTS` (in `backend/src/agent.ts`) account for the asymmetric cost of tools — `browse_web` weighs 3, `sandbox_browser` 5, `spawn_subagent` 6, while cheap lookups (`list_sandbox_files`, `read_sandbox_file`, `skill_view`) weigh 1. Anything not listed defaults to weight 1.
- `COST_CEILINGS` per complexity: simple = 4, moderate = 18, complex = 50. `RunContext.costScore` accumulates per `trackToolCall` and triggers `budgetExceeded` if the ceiling is breached, in addition to the existing call/search/browse caps. Warning fires at 75% of the ceiling.
- Subagent runs are also bounded: `subCtx.costCeiling = min(COST_CEILINGS.complex, 28)` so spawning multiple workers can't quietly exceed the parent's overall cost budget.
- The wrap-up nudge injected into the model when a warning fires now reports both `calls/maxCalls` and `costScore/costCeiling`, so the model gets the better signal of whether it's running out of budget.

## Order of execution (recommended)

Step 1 first (foundation, low risk, no external infra). Then steps 2 + 3 in parallel since they're independent (sandbox plumbing vs UI/transport). Step 4 last because the Planner/Worker rewrite changes how every other piece is invoked. The cross-cutting items (5a/5b/5c) slot in opportunistically — 5b in particular is small and can ship anytime.
