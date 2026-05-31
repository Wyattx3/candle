# Project Structure

```
candle/
├── app/                          # Expo Router screens (file-based routing)
│   ├── _layout.tsx               # Root stack + theme provider
│   ├── index.tsx                 # Main chat screen (AiBubble, streaming, tool UI)
│   ├── modal.tsx
│   └── (tabs)/                   # Tab group routes
│
├── components/                   # Reusable UI
│   ├── AgentTaskUI.tsx           # Agent task progress visuals
│   ├── ArtifactResults.tsx       # Renders generated files / links
│   ├── ChatBubble.tsx            # User / assistant bubble primitives
│   ├── DataCards.tsx
│   ├── Header.tsx
│   ├── InputArea.tsx             # Chat composer
│   ├── LiquidGlass.tsx
│   ├── MarkdownText.tsx          # Streaming markdown renderer with chat modes
│   ├── WelcomeState.tsx
│   ├── themed-text.tsx, themed-view.tsx, parallax-scroll-view.tsx
│   ├── haptic-tab.tsx, hello-wave.tsx, external-link.tsx
│   └── ui/                       # Lower-level UI primitives
│
├── hooks/
│   ├── useStableWebSocket.ts     # Reconnect / heartbeat WS client (the agent transport)
│   ├── use-color-scheme.ts(.web)
│   └── use-theme-color.ts
│
├── constants/
│   └── theme.ts                  # Color tokens / spacing
│
├── assets/
│   ├── candle-agent.mp4
│   └── images/                   # Icons, splash, adaptive icons
│
├── scripts/                      # Dev helpers
│   ├── dev-all.js                # Boot frontend + backend together
│   ├── backend-tunnel.js         # ngrok tunnel for backend
│   ├── reset-project.js          # Move starter to app-example/
│   ├── patch-expo-keep-awake.js
│   └── patch-expo-ngrok.js
│
├── backend/                      # Standalone Node service
│   ├── src/
│   │   ├── server.ts             # Express + WebSocket entry, per-connection state
│   │   ├── agent/                # Agent package (refactored from monolithic agent.ts)
│   │   │   ├── index.ts          # Public entrypoint — runAgentStream + re-exports
│   │   │   ├── loop.ts           # LangGraph state machine + invokeWithRetry + executeToolsNode
│   │   │   ├── llm.ts            # parentTools / subagentTools registries + LLM client setup (primary + failover)
│   │   │   ├── prompts.ts        # Tiered (stable/context/volatile) prompt builder, env hints, model-specific guidance
│   │   │   ├── budget.ts         # Complexity classifier, tool budgets, cost weights, isResearchQuery
│   │   │   ├── run-context.ts    # Per-run mutable state (budget, cost, loop signals)
│   │   │   ├── registry.ts       # ArtifactRegistry + FailureTracker
│   │   │   ├── subagent.ts       # runSubagent — isolated worker graph
│   │   │   ├── trajectory.ts     # TrajectoryLogger — per-step performance tracing
│   │   │   ├── helpers.ts        # Content/JSON parsing, history summarizer, observation summarizers
│   │   │   ├── session.ts        # AsyncLocalStorage<SessionContext> — session id + signal propagation
│   │   │   ├── checkpoint.ts     # File-backed run checkpoints — list/load/resume across restarts
│   │   │   ├── memory.ts         # PersistentMemoryStore + store_memory / search_memory tools
│   │   │   ├── guardrails.ts     # Tool-call guardrail (warn/block/halt; idempotent vs mutating tool split)
│   │   │   ├── todo.ts           # Per-session in-memory TodoStore (plan survives compression)
│   │   │   ├── background-review.ts # Post-turn closed-loop learning (memory + skill review, do-NOT-capture guards)
│   │   │   ├── curator.ts        # Pure no-LLM skill-lifecycle FSM (active→stale→archived, pin-protected)
│   │   │   ├── cron.ts           # File-backed CronManager (data/cron_state.json)
│   │   │   ├── context-compressor.ts # History/observation compression strategies
│   │   │   ├── error-diag.ts     # Tool/run error diagnostics + remediation hints
│   │   │   ├── file-safety.ts    # Guards for destructive file operations
│   │   │   ├── hermes-tokens.ts  # Hermes-style tool-call token parsing
│   │   │   ├── message-sanitization.ts # Strip/normalize unsafe message content
│   │   │   ├── moonshot-schema.ts # Kimi/Moonshot tool-call schema shims
│   │   │   ├── rate-limit-tracker.ts # Adaptive provider rate-limit tracking
│   │   │   ├── reasoning.ts      # Reasoning-trace extraction / streaming
│   │   │   ├── skill-miner.ts    # Offline skill miner over data/checkpoints/
│   │   │   ├── title-generator.ts # Session-title generation
│   │   │   ├── token-estimate.ts # Token counting / budget estimation
│   │   │   ├── rag.ts            # semantic_search tool (in-sandbox file content search)
│   │   │   └── types.ts          # ChatHistoryMessage, SubagentResult, AgentAbortError, etc.
│   │   ├── tools.ts              # Core agent tools (E2B sandbox, web, files, video, skills, etc.)
│   │   ├── tools_extra.ts        # Auxiliary tools + spawn_subagent runner registration glue
│   │   ├── mcp.ts                # MCP host — runtime-pluggable external tool servers (init/shutdown/catalog)
│   │   ├── skills.ts             # Procedural-memory skill registry (Hermes-style SKILL.md)
│   │   ├── skill-usage.ts        # Skill usage + lifecycle sidecar (data/skill_usage.json) for the curator
│   │   ├── approvals.ts          # Command-approval gate (low/medium/high classifier + AsyncLocalStorage)
│   │   ├── clarification.ts      # Clarification gate (UI modal round-trip + AsyncLocalStorage)
│   │   ├── llm-errors.ts         # Provider-error classifier + backoff helper
│   │   ├── context.ts            # Pinecone-backed dynamic instruction retrieval
│   │   ├── rate-limiter.ts       # Per-connection rate + concurrency limits
│   │   └── security.ts           # redactSecrets / redactSecretsDeep
│   ├── context/
│   │   ├── instructions.json     # Static fallback instructions (Pinecone seed)
│   │   └── skills/               # Procedural-memory skill bodies — see README.md
│   ├── scripts/                  # E2B template build scripts
│   ├── e2b.Dockerfile            # Sandbox image definition
│   ├── .env.example              # All backend env vars
│   ├── package.json
│   └── tsconfig.json
│
├── app.json                      # Expo config (name=Candle, scheme=maii, plugins)
├── package.json                  # Frontend deps + scripts
├── tsconfig.json                 # extends expo/tsconfig.base, paths @/* → ./*
├── tailwind.config.js
├── babel.config.js
├── metro.config.js
├── eslint.config.js
├── global.css                    # Tailwind / NativeWind globals
└── nativewind-env.d.ts
```

## Where things go

- **New screen** → `app/<route>.tsx` (file = route under expo-router).
- **New shared component** → `components/`. Themed primitives live next to `themed-*.tsx`.
- **New hook** → `hooks/use-<name>.ts`. Web-specific override: `<name>.web.ts`.
- **New theme token** → `constants/theme.ts`.
- **New agent tool** → define with `tool(...)` in `backend/src/tools.ts` (or `backend/src/tools_extra.ts` for auxiliary tools), then register it in the `parentTools` array in `backend/src/agent/llm.ts`. Update budgets / failure tracking in `backend/src/agent/budget.ts` if it's a heavy tool.
- **New prompt block** → add it to the appropriate tier in `backend/src/agent/prompts.ts`. Stable tier (top): identity / framework / strategy / examples / env hints / model directives. Context tier (middle): skill index, subagent block, planning. Volatile tier (bottom): dynamic context, artifacts, timestamp. Bottom-up = better cache hits.
- **New agent skill (procedural memory)** → drop a `<name>/SKILL.md` file under `backend/context/skills/` with `name`, `description`, and (optional) `tags` front-matter. The index auto-injects into the system prompt; the model loads the body via `skill_view`. See `backend/context/skills/README.md`.
- **Browser automation choice** → `browse_web` for read-only fetches, `browser_interact` for stealth/external one-shots, `sandbox_browser` for persistent login state and in-sandbox downloads/screenshots that need to flow into other tools.
- **WebSocket events** → emit from the agent (`backend/src/agent/index.ts` via `emitEvent`), route through `server.ts`, handle on the client in `hooks/useStableWebSocket.ts` and render in `app/index.tsx`. Approval flow uses dedicated events: server → `approval_request` / `approval_decision`, client → `approval_response`.
- **New env var** → add to `backend/.env.example`, read where it's consumed (typically `backend/src/agent/*.ts`, `server.ts`, or `tools.ts`), and document in `.kiro/steering/tech.md`.

## Architecture flow (one chat turn)

1. Client opens WebSocket via `useStableWebSocket` → backend `server.ts`.
2. User sends `{ type: "prompt", content }`.
3. `server.ts` checks rate limit + concurrency, builds `ArtifactRegistry`, wraps the call in `withSessionContext({ sessionId: connectionId })` and `withApprovalContext`, then calls `runAgentStream`.
4. `agent/index.ts` builds a per-run `RunContext` (complexity-classified budget) and a fresh LangGraph (`createAgentGraph`) — no global agent state.
5. The graph alternates `model → tools → observe(summarize) → model` with budget, loop, and failure guards.
6. Each step emits typed events (`thinking`, `thought_chunk`, `tool_start`, `tool_end`, `status`, `error`, `cancelled`).
7. Client `app/index.tsx` accumulates events into `MessageItem.nodes` (`text | reasoning | tool`) and renders via `AiBubble`.
8. On finish, history is trimmed (`trimChatHistory`) and stored on the connection for the next turn.
