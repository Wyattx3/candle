# Tech Stack

## Frontend (mobile + web)

- **Expo SDK 54** with `expo-router` 6 (file-based routing under `app/`)
- **React Native 0.81** + **React 19**, new architecture enabled, React Compiler experiment on
- **NativeWind 4** + **Tailwind 3** for styling, plus per-file `StyleSheet` for complex components
- `@shopify/flash-list` for chat list virtualization
- `@shopify/react-native-skia` for high-perf graphics
- `react-native-reanimated` 4 + `react-native-worklets` for animations
- `expo-video`, `expo-blur`, `expo-haptics`, `expo-symbols`, `expo-linear-gradient`
- `lucide-react-native`, `react-native-svg`, `react-native-chart-kit`
- **TypeScript** strict mode, path alias `@/*` → repo root

## Backend (Node, TypeScript)

- **Express 5** + **ws** WebSocket server (`backend/src/server.ts`)
- **LangGraph** + **LangChain** with `@langchain/openai` pointed at Cloudflare Workers AI
- **E2B** SDK for sandboxed code execution
- **MCP host** via `@langchain/mcp-adapters` for runtime-pluggable external tool servers
- **Pinecone** for dynamic instruction / context retrieval
- **Cheerio** for HTML scraping
- `dotenv` for config, `cors`
- `ts-node` for dev, `tsc` for build, `commonjs` module format
- TypeScript `^6.0.3` (note: very recent — keep an eye on compat). Test runner is **vitest** (`*.test.ts` files colocated with sources, plus `src/__tests__/setup.ts`).

## Required environment variables (backend/.env)

See `backend/.env.example`. Critical ones:

- `CLOUDFLARE_API_KEY`, `CLOUDFLARE_BASE_URL`, `MODEL_NAME`
- Optional failover (Step 5b): `FAILOVER_API_KEY`, `FAILOVER_BASE_URL`, `FAILOVER_MODEL_NAME`. Set all three to enable secondary-provider failover; leave any unset to disable.
- `E2B_API_KEY`, `E2B_TEMPLATE_NAME`
- `PINECONE_API_KEY`, `PINECONE_INDEX`, `PINECONE_NAMESPACE`
- `KERNEL_API_KEY`, `YOUCOM_API_KEY` (plus optional Brave / Google CSE keys)
- Optional MCP host: `MCP_SERVERS` (JSON array), `MCP_DEFAULT_TIMEOUT_MS`, `MCP_TOOL_PREFIX` — leave `MCP_SERVERS` unset to skip the host entirely.
- Memory: `MEMORY_MAX_ENTRIES` (50–5000, default 500) caps the persistent memory file with LRU eviction.
- Tuning: `MAX_AGENT_STEPS`, `CHAT_HISTORY_MAX_*`, `RATE_LIMIT_*`, `AGENT_RUN_TIMEOUT_MS`

## Common commands

Run from the repo root (`candle/`) unless noted.

### Frontend

```bash
npm install                # also runs postinstall patches for ngrok + keep-awake
npm run start              # expo start
npm run ios                # expo start --ios
npm run android            # expo start --android
npm run web                # expo start --web
npm run lint               # expo lint
```

### Backend (run from `candle/backend/`)

```bash
npm install
npm run dev                # ts-node src/server.ts
npm run build              # tsc → dist/
npm run start              # node dist/server.js
npm run typecheck          # tsc --noEmit
npm run test               # vitest run (real suite — *.test.ts colocated with sources)
npm run test:watch         # vitest (watch mode)
npm run test:coverage      # vitest run --coverage
npm run lint               # eslint .
npm run lint:fix           # eslint . --fix
npm run skills:mine        # offline skill miner over data/checkpoints/
npm run smoke:e2e          # ts-node scripts/smoke-e2e.ts
npm run generate:prompts   # regenerate the prompt bank
npm run e2b:template:create   # build E2B sandbox template (node)
npm run e2b:template:create:cli  # build E2B sandbox template (PowerShell)
```

After any backend change run `npm run typecheck`; after any logic change run `npm run test`.

### Combined dev

```bash
npm run dev:all            # node ./scripts/dev-all.js — boots frontend + backend together
npm run backend:tunnel     # exposes backend over ngrok for device testing
```

## Conventions

- TypeScript strict everywhere. Prefer typed exports over default exports for tools and helpers.
- Backend code is `commonjs` — use `require`-compatible imports; ESM-only packages need care.
- Never log full prompt or tool payloads without running them through `redactSecrets` from `backend/src/security.ts`.
- All agent tools live in `backend/src/tools.ts` (with auxiliary tools in `backend/src/tools_extra.ts`) and are registered in the `parentTools` array in `backend/src/agent/llm.ts`. Add new tools in both places.
- WebSocket events use a discriminated `type` field. Full contract: `prompt`, `ping`/`pong`, `approval_request`/`approval_decision`/`approval_response`, `clarification_request`/`clarification_decision`/`clarification_response`, `task_started`, `status`, `thinking`, `thought_chunk`, `reasoning_chunk`, `tool_start`, `tool_end`, `security_notice`, `run_checkpoint`, `session_title`, `learning_update`, `error`, `cancelled`. Keep this contract stable on both ends.
- UI streaming nodes are `text | reasoning | tool` (see `app/index.tsx` `AiStreamNode`).
