# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Candle — Project Memory

> Mobile-first, sandboxed, multi-tier-memory autonomous agent app.
> Expo / React Native client + LangGraph TypeScript backend running an
> OpenAI-compatible LLM (default Cloudflare Workers AI / Kimi-K2) inside a
> per-session E2B Linux container.

This file is the high-level orientation. Detailed conventions live under
`.kiro/steering/` (`product.md`, `tech.md`, `structure.md`,
`agent-improvements.md`, `agent-improvements-v2.md`, `super-agent-roadmap.md`).
Read those before non-trivial changes.

---

## Quick repo map

```
candle/
├── app/                       Expo Router screens (chat UI, skill-suggestions UI)
├── components/, hooks/        UI primitives + WebSocket client (useStableWebSocket)
├── assets/, scripts/          Static assets + dev-all / ngrok / patch scripts
├── backend/
│   ├── src/
│   │   ├── server.ts          Express + WebSocketServer entry; per-connection state
│   │   ├── agent/             Agent kernel (loop, prompts, budget, run-context, ...)
│   │   ├── tools.ts,          Built-in tool registry (sandbox, web, files, video, ...)
│   │   │  tools_extra.ts      + spawn_subagent / clarify / cron / todo / patch / skills
│   │   ├── mcp.ts             Runtime MCP host (hot-bind external tools)
│   │   ├── skills.ts          Procedural memory (Hermes-style SKILL.md)
│   │   ├── approvals.ts       Command approval gate (low/med/high classifier)
│   │   ├── clarification.ts   Clarification gate (UI modal round-trip)
│   │   ├── llm-errors.ts      Provider error classifier + backoff
│   │   ├── security.ts        Secret redaction + prompt-injection scanner
│   │   ├── context.ts         Pinecone-backed dynamic instruction RAG
│   │   └── rate-limiter.ts    Per-IP rate + global concurrency caps
│   ├── context/
│   │   ├── instructions.json  Static fallback instructions (Pinecone seed)
│   │   └── skills/<name>/SKILL.md   Procedural memory bodies
│   ├── data/
│   │   ├── checkpoints/       Per-run JSON snapshots (atomic .tmp → rename)
│   │   ├── skill-suggestions/ Mined-then-reviewed skill drafts
│   │   ├── cron_state.json    Persisted scheduled jobs
│   │   └── (todo list is per-session in-memory — not persisted to disk)
│   ├── e2b.Dockerfile         Sandbox image (ffmpeg, Playwright/Chromium, pandoc, ...)
│   └── .env.example           All backend env vars
├── app.json                   Expo config (name=Candle, scheme=maii, plugins)
├── .claude/agents/kfc/        Claude-Code spec workflow agents (build-time, NOT runtime)
└── .kiro/steering/            Detailed steering docs
```

App identity: `Candle` (display name & slug), package name `maii`, URL scheme `maii`.

---

## Architecture in one paragraph

Each WebSocket prompt becomes its own `runAgentStream` invocation with a fresh
`RunContext` (complexity-classified budget + cost ceiling), `ArtifactRegistry`,
`TrajectoryLogger`, atomic `RunCheckpoint`, and a fresh LangGraph compiled by
`createAgentGraph`. The graph nodes are `agent → tools → observe → critic`,
with parallel tool execution, observation summarisation for huge tool outputs,
loop detection (signature window + similarity), budget exhaustion that forces a
no-tools final answer, and a critic node that judges the final text and can
reopen the loop up to twice. Tool outputs and the user prompt both pass through
a prompt-injection scanner; flagged content is wrapped in a `[SECURITY NOTICE]`
prefix before going back to the model. All state is per-connection — no global
mutable agent state.

End-to-end flow:

```
WS prompt → server.ts (rate limit, concurrency, approval+clarification gates)
         → withSessionContext + withApprovalContext + withClarificationContext
         → agent/index.ts:runAgentStream
         → agent/loop.ts:LangGraph (agent ⇄ tools ⇄ observe → critic → __end__)
         → tools.ts / tools_extra.ts / mcp.ts (E2B sandbox + web + memory + ...)
         → emit `thought_chunk` / `tool_start` / `tool_end` / `run_checkpoint`
         → trim history, persist checkpoint, return final text
```

---

## What makes this a "super autonomous agent"

1. **Tool-calling ReAct loop** with parallel tool execution (`Promise.all` over
   `tool_calls`), per-tool guardrails (warn/block/halt on repeated failure),
   observation compression for outputs > 4 KB, loop detection (`nudge` → `stop`),
   and a planner-critic retry pass.
2. **Hierarchical agency** — `spawn_subagent` (single, ~14 calls, 120 s) and
   `spawn_subagents_parallel` (2-4 workers, 90 s each, optional first-success
   race that cancels siblings). Workers cannot recurse. Artifacts are deduped
   across workers.
3. **Multi-tier memory**:
   - Conversation history (trimmed + old-window summarisation).
   - Long-term key/value `PersistentMemoryStore` (`.candle_memory.json`,
     LRU-evicted, categorised: `user_preference | project_fact |
     learned_pattern | tool_usage`).
   - Procedural memory (`backend/context/skills/<name>/SKILL.md`) — only the
     index is in the system prompt; the body loads on demand via `skill_view`.
   - Episodic memory / forensics (`data/checkpoints/<runId>.json`).
   - Semantic retrieval (Pinecone over `instructions.json`, threshold 0.70,
     keyword fallback when offline).
4. **Closed-loop learning**:
   - The agent itself can persist a successful workflow with
     `skill_manage(action="create"|"update"|"delete"|"list")`.
   - Offline `skill-miner.ts` clusters past completed runs by tool-bigram
     Jaccard ≥ 0.7 + prompt-vocabulary overlap ≥ 0.4, requires cluster ≥ 3
     and avg ≥ 4 tool calls, dedupes against existing skills, and writes
     reviewable suggestions to `data/skill-suggestions/`. Optional LLM polish
     pass on each new draft. Operators approve in
     `app/skill-suggestions.tsx` → `POST /skill-suggestions/:id/approve`
     materialises a real `SKILL.md`.
5. **Autonomy primitives** — cron jobs run scheduled prompts in-process with
   no chat history (`backend/data/cron_state.json`, restored at boot); todo
   manager for long checklists; clarification gate so the agent can pause for
   one targeted user question; approval gate so it can run side-effecting
   shell commands safely (per-connection `allow_always` cache, never
   persisted).
6. **Defense-in-depth security** — `security.ts` redacts secrets in logs,
   history, checkpoints, and WS emit; `scanForThreats` flags prompt-injection
   patterns on user prompts (soft-flag) and tool outputs (prefix wrapper);
   `classifyCommandRisk` auto-rejects `rm -rf /`, fork bombs,
   `curl … | bash`, etc.; threat scan is capped at 64 KB.
7. **Resilience** — `llm-errors.ts` classifies errors into
   `auth | bad_request | rate_limit | quota | timeout | network | server |
   model_unavailable | context_length | unknown` with class-based retry
   verdicts and optional cross-provider failover; jittered exponential
   backoff; sandbox staleness detection + recreation; atomic checkpoint
   writes; boot-time conversion of zombie `running` checkpoints to
   `interrupted`; rate limiting + global concurrency caps.
8. **Tool extensibility** — runtime MCP host (`mcp.ts`) lazy-imports
   `@langchain/mcp-adapters`, hot-binds external tools into both
   `parentTools` and `subagentTools`, and rebuilds the LLM bindings without
   restart.
9. **Sandboxed by default** — purpose-built E2B image
   (`candle-autonomous-agent`) ships ffmpeg, Playwright + Chromium with a
   persistent profile under `/home/user/.candle_browser_profile/`,
   ImageMagick, pandoc, poppler, ripgrep, tesseract, xvfb, plus a Python
   data stack and Node tooling.
10. **Tiered system prompt** (`agent/prompts.ts`) intentionally split
    `STABLE | CONTEXT | VOLATILE` for provider-side prompt-cache reuse, with
    model-specific operational guidance for Kimi/Gemini/Claude/GPT-4 and
    sandbox-environment hints (`e2b | wsl | local`).

---

## Tech stack reference

- **Frontend**: Expo SDK 54, React Native 0.81 / React 19.1, expo-router 6,
  NativeWind 4 + Tailwind 3, react-native-skia, reanimated 4,
  @shopify/flash-list, lucide-react-native. New architecture + React
  Compiler experiment enabled.
- **Backend**: Node + TypeScript (CommonJS), Express 5, raw `ws`,
  LangGraph 1.x + LangChain core 1.x, `@langchain/openai`,
  `@langchain/mcp-adapters`, e2b SDK, `@onkernel/sdk` (Kernel browser
  alternative), `@pinecone-database/pinecone`, cheerio, dotenv, vitest,
  ts-node, eslint 9.
- **LLM provider**: Cloudflare Workers AI by default
  (`@cf/moonshotai/kimi-k2.6`), any OpenAI-compatible endpoint via
  `MODEL_NAME` + `*_BASE_URL`. Optional secondary failover provider.

---

## Common commands

Run from the repo root (`candle/`) unless noted.

```bash
# Frontend
npm install
npm run start                      # expo start
npm run ios | android | web
npm run lint                       # expo lint

# Combined dev
npm run dev:all                    # boots frontend + backend together
npm run backend:tunnel             # ngrok tunnel for device testing

# Backend (run from candle/backend/)
npm install
npm run dev                        # ts-node src/server.ts
npm run build && npm run start     # tsc → dist/, then node dist/server.js
npm run typecheck                  # tsc --noEmit
npm run lint | lint:fix            # eslint . (--fix to autofix)
npm run test                       # vitest run
npm run test:watch                 # vitest (watch a single file: npm run test:watch -- budget)
npm run skills:mine                # offline skill miner over data/checkpoints/
npm run smoke:e2e                  # ts-node scripts/smoke-e2e.ts (end-to-end smoke test)
npm run e2b:template:create        # build the E2B sandbox image
```

## Backend transport (Cloudflare Tunnel)

The backend's WebSocket and REST endpoints reach the mobile client through a
**Cloudflare Tunnel** (not ngrok — ngrok is only used by Expo Metro for the
JS bundle). `scripts/backend-tunnel.js` and `scripts/dev-all.js` spawn
`cloudflared tunnel --config cloudflare-tunnel.yml run` and default to
`wss://ws.candlecan.art`. The local `cloudflare-tunnel.yml` and
`cloudflared.exe` are gitignored — copy `cloudflare-tunnel.example.yml` and
follow `docs/cloudflare-tunnel.md` for the one-time setup.

REST endpoints worth knowing:

- `GET /health`
- `GET /runs`, `GET /runs/:id`, `DELETE /runs/:id`,
  `POST /runs/:id/resume` (continuation-prompt re-run, not mid-graph
  snapshot/restore)
- `GET /skill-suggestions`, `GET /skill-suggestions/:id`,
  `POST /skill-suggestions/mine[?polish=1]`,
  `POST /skill-suggestions/:id/approve|reject`,
  `DELETE /skill-suggestions/:id`

WebSocket events (discriminated by `type`): `prompt`, `ping/pong`,
`approval_request/decision/response`,
`clarification_request/decision/response`, `task_started`, `status`,
`thinking`, `thought_chunk`, `reasoning_chunk`, `tool_start`, `tool_end`,
`security_notice`, `run_checkpoint`, `session_title`, `learning_update`,
`error`, `cancelled`. Keep this contract stable on both server and client.

---

## Conventions (do these)

- **TypeScript strict everywhere.** Prefer typed exports over default
  exports for tools and helpers.
- **CommonJS backend** — use `require`-compatible imports; ESM-only
  packages need care.
- **Never log full prompts or tool payloads without `redactSecrets`** from
  `backend/src/security.ts`.
- **Add a new agent tool in two places**: define with `tool(...)` in
  `backend/src/tools.ts` (or `tools_extra.ts` for auxiliaries) and register
  it in the `parentTools` array in `backend/src/agent/llm.ts`. Update
  `TOOL_COST_WEIGHTS` in `agent/budget.ts` if it's expensive.
- **Add a new prompt block** to the right tier in `agent/prompts.ts`:
  STABLE (top, identity / strategy / examples / env / model directives),
  CONTEXT (middle, skill index / subagent / planning / MCP catalog),
  VOLATILE (bottom, dynamic context / artifacts / timestamp / memory). The
  bottom-up split is intentional — it preserves provider prompt-cache hits.
- **Add a new skill** by dropping `<name>/SKILL.md` under
  `backend/context/skills/` with `name`, `description`, optional `tags`
  front-matter. Index auto-injects on next request; body loads via
  `skill_view`.
- **New env var** → add to `backend/.env.example`, read it where it's
  consumed, and document it in `.kiro/steering/tech.md`.
- **Browser tool choice**: `browse_web` for read-only fetches,
  `browser_interact` for stealth/external one-shots,
  `sandbox_browser` for persistent login state and in-sandbox
  downloads/screenshots that need to flow into other tools.

---

## Known leftovers / gaps to watch

- Two browser stacks coexist: Kernel-driven `browser_interact` (needs
  `KERNEL_API_KEY`) and in-sandbox Playwright `sandbox_browser`. Prompts
  steer the model, but operators should pick one when budget matters.
- `selectTemplateForTask` in `tools.ts` currently returns the same E2B
  template id for every tool — the per-task heuristic is a placeholder.
- `POST /runs/:id/resume` is a "continuation prompt" replay, not a true
  mid-graph LangGraph snapshot/restore. By design.
- `backend/.env` is present in the tree alongside `.env.example` — audit
  for real secrets before publishing.

---

## When you start a task in this repo

1. Read `.kiro/steering/product.md`, `tech.md`, and `structure.md` for the
   high-level rules.
2. For agent-loop / prompt / budget changes, also read
   `.kiro/steering/agent-improvements.md`,
   `.kiro/steering/agent-improvements-v2.md`, and
   `.kiro/steering/super-agent-roadmap.md`.
3. Match existing TypeScript style and the per-file header-comment pattern
   you'll see in `agent/loop.ts`, `prompts.ts`, `security.ts`, `mcp.ts`,
   `skill-miner.ts` (concise module-level doc explaining responsibility +
   design notes).
4. After any backend change, run `npm run typecheck` from `backend/`. After
   any logic change, run `npm run test`.
5. Don't edit `backend/.env`. Don't commit secrets. Don't widen the
   approval gate's auto-allow list without explicit human sign-off.
