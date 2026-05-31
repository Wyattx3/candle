---
inclusion: manual
---

# Agent Architecture Improvements

Source: `candle_agent_improvements.md` (provided by the user). Five-part overhaul porting Hermes Agent / Aion UI patterns into Candle while preserving all existing safety nets (per-connection RunContext, classifier-driven retry, approval gate, subagent delegation, cost ceilings).

## Status

| # | Improvement | Status | Key files |
| - | ----------- | ------ | --------- |
| 1 | Modular refactor of `agent.ts` → `agent/` subfolder | ✅ done | New `backend/src/agent/` package: `index.ts`, `loop.ts`, `llm.ts`, `prompts.ts`, `budget.ts`, `run-context.ts`, `registry.ts`, `subagent.ts`, `trajectory.ts`, `helpers.ts`, `types.ts` |
| 2 | Tiered system prompt (stable / context / volatile) | ✅ done | `buildSystemPrompt` + `buildAgentSystemPrompt` + `buildSubagentSystemPrompt` in `backend/src/agent/prompts.ts` |
| 3 | Dynamic environment sensing block | ✅ done | `getEnvironmentHints("e2b" | "wsl" | "local")` in `backend/src/agent/prompts.ts`, called from the stable tier |
| 4 | Model-specific operational directives | ✅ done | `getModelOperationalGuidance(modelName)` in `backend/src/agent/prompts.ts`, covers Kimi/Moonshot, Gemini, Claude, GPT-4 |
| 5 | Trajectory logger for per-step performance tracing | ✅ done | `TrajectoryLogger` in `backend/src/agent/trajectory.ts`, opt-in disk persistence via `CANDLE_TRAJECTORY_DIR` |

## Key conventions

### Refactor (#1)

- The original `backend/src/agent.ts` (1810 lines) is gone. All consumers (`server.ts`, `tools.ts`) keep working unchanged because `backend/src/agent/index.ts` re-exports the same public surface (`runAgentStream`, `runSubagent`, `agentApp`, `ArtifactRegistry`, `AgentAbortError`, `AgentTimeoutError`, types `ChatHistoryMessage` and `SubagentResult`, plus the new `TrajectoryLogger`).
- Module boundaries chosen for compile-time independence: `types.ts` and `helpers.ts` have no LangChain/LangGraph dependency so they're cheap to import from anywhere. `llm.ts` owns the heavy ChatOpenAI bindings and is the only module that throws on startup if `CLOUDFLARE_*` env vars are missing.
- `RunContext` lives in its own `run-context.ts` rather than `types.ts` because it's a stateful class with logic, not a plain interface. Following Hermes's separation of "state" vs "value types".
- Lazy registration of `spawn_subagent` runner sits at the very bottom of `index.ts`, after `runSubagent` is defined. Avoids the circular import between `tools.ts` (which exports the tool) and `agent/subagent.ts` (which implements the runner).

### Tiered prompt (#2)

- `buildSystemPrompt({ stable, context, volatile })` joins the three tiers with `\n\n` separators, top to bottom.
- Stable tier: identity, decision framework, output format, tool strategy, reasoning protocol, error recovery, ambiguity handling, constraints, few-shot examples, env hints, model directives. Identical for all turns of the same model and sandbox — providers with prompt caching get max KV reuse here.
- Context tier: skill index (varies as skills are added), subagent delegation block (parent only), planning-required block (complex queries only). Stable within a process lifetime but composition varies per call.
- Volatile tier: `Current time (UTC)`, dynamic context (Pinecone retrieval), artifact summary. Always at the bottom so it never invalidates the cache prefix above it.
- Subagent prompt = parent prompt with `isParent: false` (drops the SUBAGENT DELEGATION block) plus a final `## SUBAGENT SCOPE` block documenting the worker's constraints.

### Environment sensing (#3)

- `getEnvironmentHints(sandboxType: "e2b" | "local" | "wsl")` returns a paragraph the model can read at parse time. E2B variant lists pip/npm/apt as the package managers, the workspace path, the persistent browser profile path, and the headless requirement. WSL and local variants exist for future flexibility.
- The hint block is injected as part of the stable tier so it's cached. Currently `buildAgentSystemPrompt` defaults to `"e2b"` because that's where Candle actually runs; the parameter exists so a future deployment can swap this without code changes.

### Model directives (#4)

- `getModelOperationalGuidance(modelName)` matches by substring — "kimi"/"moonshot", "gemini", "claude", "gpt-4"/"openai" — and emits a short block with the model's known quirks. Anything unrecognized returns `""` (no-op, keeps the prompt clean).
- Kimi gets pushed toward code-execution-first for data tasks. Gemini gets the absolute-paths and parallel-tools nudge. Claude gets parallel-tools and "ask one targeted question" guidance. GPT-4 gets structured-output preferences.

### Trajectory logger (#5)

- `new TrajectoryLogger(sessionId?)` — sessionId auto-generated if omitted (`<timestamp>-<rand>`).
- `logStep({ node, detail?, toolCalls?, llmTokens?, error? })` — duration is computed automatically from the previous tick.
- `getSummary()` — in-memory snapshot for live debug views.
- `flushToDisk()` — writes `<dir>/trajectory-<sessionId>.json` if `CANDLE_TRAJECTORY_DIR` is set. No-op otherwise. Logging is best-effort: write errors are swallowed with a warning so they can never break a run.
- The agent run logs `init`, every `tool` end, `done` (or `timeout`/`error`), and flushes once at the end.

## Verification

- Backend `npm run typecheck` passes clean across all 11 new modules + the unchanged `server.ts`/`tools.ts`.
- A 33-case smoke test (now removed) exercised: public exports preserved, `agentApp` default graph compiles, classifier buckets correct, prompt builders emit all three tiers in the right order with cache-friendly composition, env hints/model directives work for all variants, RunContext + cost ceiling integrate, TrajectoryLogger captures steps. All passed.

## What did NOT change

- `runAgentStream` signature is unchanged. `server.ts` does not need to be touched.
- Tool implementations in `tools.ts` are unchanged. The lazy-registration pattern for `spawn_subagent` continues to work.
- All existing skills under `backend/context/skills/` continue to load identically (reading `name`/`description`/`tags` front-matter).
- The agent's external behavior (decision framework, mode selection, search strategy, error recovery, approval gate, subagent delegation, cost weights) is unchanged. The refactor is purely structural.
