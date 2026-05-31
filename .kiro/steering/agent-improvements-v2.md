---
inclusion: manual
---

# Agent Architecture Improvements (v2 — Hermes spec)

Source: `candle_vs_hermes_comprehensive_spec.md` (provided by the user). Builds on the v1 modular refactor with five Hermes-grade hardening items. Existing `runAgentStream`/`runSubagent`/`agentApp` exports and the `.env` loader contract are preserved.

## What shipped

| Area | Change | Key files |
| ---- | ------ | --------- |
| Agent module | Already modularised in v1; this round only touched `loop.ts` and `prompts.ts` | `backend/src/agent/loop.ts`, `prompts.ts` |
| Prompt caching | Localization rules moved out of stable identity into a dedicated `LOCALIZATION RULES` block at the tail of the stable tier; volatile `TASK-SPECIFIC CONTEXT` already lives at the absolute bottom | `backend/src/agent/prompts.ts` |
| Sandbox isolation | Replaced global singleton with `Map<sessionId, SandboxRecord>` keyed registry; per-session locks; `getSandboxForSession` / `closeSandboxForSession` exported | `backend/src/tools.ts` |
| Session context | New `AsyncLocalStorage<SessionContext>` propagates `sessionId` (+ optional signal) without changing tool signatures | `backend/src/agent/session.ts` |
| Server wiring | `server.ts` wraps each `runAgentStream` call in `withSessionContext({ sessionId: connectionId })` and calls `closeSandboxForSession(connectionId)` on `ws close` | `backend/src/server.ts` |
| Concurrent tools | LangGraph default `ToolNode` replaced with custom `executeToolsNode` that fans out independent tool calls under `Promise.all` | `backend/src/agent/loop.ts` |
| Path safety | New `safeSandboxPath(raw)` rejects empty, relative, backslash-bearing, `..`-walking, or non-`/home/user/` paths. Wired into `read`, `write`, `inspect`, `manage`, `list`, `get_url`, and `create_artifact` tools | `backend/src/tools.ts` |
| Syntax verification | After `write_sandbox_file` persists a `.py`/`.js`/`.cjs`/`.mjs`/`.json` file, `verifySandboxCode` runs `python3 -m py_compile` / `node --check` / JSON parse and reports the result in the tool output so the agent gets immediate feedback | `backend/src/tools.ts` |

## Conventions

### Sandbox session isolation

- Each WebSocket connection gets a unique `connectionId = "<ip>:<timestamp>"` in `server.ts`. That id is the session id passed through `AsyncLocalStorage`.
- Tools fetch the live sandbox via `runWithSandboxRetry(templateId, op)`, which internally calls `getSessionId()` from `./agent/session.ts` and routes to the per-session record. No tool needs to know about session ids.
- Subagents inherit the parent's `AsyncLocalStorage` context automatically — they share the parent's sandbox, which is the intended behaviour (workers operate on the same files the parent created).
- Backward compatibility: `initSandbox()` and `closeSandbox()` still exist; they operate on the implicit `_default` session, which is what the `/session/start` express endpoint already expected.
- Connection close fires `closeSandboxForSession(connectionId)` so we don't leak E2B compute. Errors during cleanup are warned, never thrown.

### Concurrent tool execution

- `executeToolsNode` is the new graph node bound to "tools". When the model returns multiple tool calls in one turn, all of them launch simultaneously via `Promise.all`. Per-call errors return as a tool message (`Error executing tool: ...`) instead of crashing the run.
- Each result keeps `tool_call_id` so the LLM can correlate outputs to its original calls.
- Subagent and parent graphs both use `executeToolsNode`; the only difference is which `parentTools` / `subagentTools` array drives tool lookup.
- Latency win is real for parallelizable operations like multi-search or batch downloads. Sequential tool flows (e.g. install → run → verify) still serialize because the model emits them across separate turns.

### Path-traversal safety

- `safeSandboxPath` is intentionally strict: paths must be absolute POSIX (`/home/user/...`), no backslashes, no `..` traversal that escapes the root. `/home/userx/...` is rejected even though it shares a prefix.
- The helper is called inside every file-touching tool BEFORE the underlying sandbox call, so a malicious or buggy LLM cannot read `/etc/passwd` or write `/var/log/anything`.
- `manage_sandbox_files` validates both the source path AND the optional `target_path`. Same with copy/move/zip/unzip. The Python guard for `delete` actions remains as a defence-in-depth backstop inside the sandbox.

### Post-write syntax verification

- Triggered automatically by `write_sandbox_file` for `.py`, `.js`, `.cjs`, `.mjs`, `.json`. Other file types skip the check.
- Result is appended to the tool JSON: `{ path, bytesWritten, syntax: { ok, language, error? } }`. If `syntax.ok === false`, the agent loop sees the compile error in the next observation and can fix the file in the same turn.
- Verification is best-effort. If the verifier itself errors out (rare — e.g. `node` missing for a `.js` file in a Python-only template), the result records `{ ok: false, language, error }` and the write itself is NOT rolled back. The agent can still recover.

### Localization at the tail

- `LOCALIZATION RULES` is the LAST block of the stable tier — model-specific guidance and environment hints come before it. This keeps the dense English execution rules at full attention weight while still teaching Candle the Myanmar shortcuts (`ဒေါင်းပေး`, `အဲဒါလုပ်ပေး`, `ပြင်ပေး`, `ထပ်ရှာပေး`) and the Myanmar assumption-disclosure pattern (`X လို့ ယူဆပြီး…`).
- Volatile `TASK-SPECIFIC CONTEXT` (timestamp + dynamic context + artifact summary) remains at the absolute bottom so prompt caching survives turn-to-turn.

## Backward compatibility

- All v1 public exports are intact. `runAgentStream`, `runSubagent`, `agentApp`, `ArtifactRegistry`, `AgentAbortError`, `AgentTimeoutError`, types `ChatHistoryMessage` and `SubagentResult`, and `TrajectoryLogger` remain identical signatures.
- `initSandbox`/`closeSandbox` from `tools.ts` still exist. The legacy `export let sandbox` is now a `null` placeholder; any caller still using it gets `null` and should migrate to `getSandboxForSession`. `server.ts` was already on `initSandbox()` and is unchanged on that path.
- `parentTools`/`subagentTools` arrays in `agent/llm.ts` are unchanged — same tool registry. The unused `parentToolNode`/`subagentToolNode` exports remain in `llm.ts` for any external consumer; the graph itself just doesn't use them anymore.

## Verification

- Backend `npm run typecheck` passes clean across all changes.
- 16-case smoke test confirmed: public surface preserved, session context APIs work, prompt builder places LOCALIZATION RULES at the tail of the stable tier, Burmese phrases moved out of HANDLING AMBIGUITY. Test removed.
- 11-case path-safety smoke test confirmed: legitimate `/home/user/...` paths allowed; system dirs, `..` escapes, `/home/userx` lookalikes, relative paths, empty strings, backslashes all blocked. Test removed.

## Not yet shipped from the spec

- **Workspace rules from `.cursorrules` / `.candlerules`** in the active sandbox: requires reading from `/home/user` at prompt-build time, which means a sandbox round-trip on every prompt. Worth adding next, but I held off because it touches the cache strategy (sandbox-rules content varies per project, so it should sit in the *context* tier, not stable). Specifying it deserves its own pass.
- **AST-level audit of dynamically written code** (beyond the existing risk-classifier in `approvals.ts` and the new syntax check). The current `python3 -m py_compile` / `node --check` catches syntax errors but not malicious imports. A real AST audit would scan for `subprocess`, `os.system`, `eval`, etc. and require explicit user approval. Defer.

---

# Agent Architecture Improvements (v3 — ported from upstream Hermes source)

Source: `github.com/NousResearch/hermes-agent` (read directly, not the spec doc). This round fixes a production bug observed on-device (Kimi emitting raw `<|tool_call_begin|>` tokens as chat text instead of running tools) and hardens the LLM/error layer with patterns lifted from Hermes' mature implementation.

## Root cause of the token-leak bug

Kimi / Moonshot accepts a **stricter JSON-Schema subset** than standard OpenAI tool calling. When a tool's `parameters` schema violates it (missing `type`, `anyOf` with a null branch, `$ref` siblings, tuple-style `items`, `enum` with null/empty), Cloudflare Workers AI rejects the request — and the model's native tool-calling path degrades into emitting raw `<|tool_call_begin|>…` tokens as assistant text. The tool never runs and the markup leaks to the UI.

Hermes solves this at the **source** with `agent/moonshot_schema.py`. We ported it and ALSO kept a downstream recovery net.

## What shipped

| Area | Change | Key files |
| ---- | ------ | --------- |
| Moonshot schema sanitizer | Ported `moonshot_schema.py` → TS. Repairs tool schemas (missing-type inference, anyOf/null collapse, enum cleanup, `$ref` sibling strip, tuple-`items` collapse, `nullable` strip) so Kimi accepts them and tool-calling stays structured. | `backend/src/agent/moonshot-schema.ts` |
| Model-aware tool binding | `bindToolsForModel()` converts tools to OpenAI format and runs them through `sanitizeMoonshotTools` ONLY when the model is Kimi/Moonshot; all other models bind unchanged. Applied to every LLM (parent, subagent, research, failover). | `backend/src/agent/llm.ts` |
| Token-leak recovery net | `parseHermesToolCalls` recovers structured calls from leaked native tokens; `HermesStreamFilter` suppresses the markup during streaming; `stripHermesToolTokens` cleans final text. Defence-in-depth in case sanitization isn't enough (e.g. a future provider quirk). | `backend/src/agent/hermes-tokens.ts`, `loop.ts`, `index.ts` |
| Richer error classifier | Added `content_policy` class (deterministic safety-filter refusals — don't retry, do failover). Broadened billing-vs-rate-limit disambiguation (`BILLING_PATTERNS`), context-overflow patterns (vLLM/Ollama/llama.cpp wording), and rate-limit signals (`throttled`, `resource_exhausted`). | `backend/src/llm-errors.ts`, `server.ts` |

## Conventions

- **Adding a tool:** no extra work — `bindToolsForModel` sanitizes automatically for Kimi. Just register it in `parentTools` as before.
- **Switching models:** `isMoonshotModel()` matches bare (`kimi-k2`), vendor (`moonshotai/Kimi-K2`), and aggregator-prefixed (`@cf/moonshotai/kimi-k2.6`) slugs. Non-Kimi models skip sanitization entirely, so there's zero risk to other providers.
- **The recovery net is a safety layer, not the primary fix.** The schema sanitizer should keep tool-calling structured; the `hermes-tokens` recovery only fires if raw tokens still appear.

## Still available to port from Hermes (not yet done)

- `tool_guardrails.py` idempotent-no-progress nuances (Candle's `guardrails.ts` already covers the core).
- `context_compressor.py` / `conversation_compression.py` — more sophisticated than Candle's `summarizeOldHistory`.
- `iteration_budget.py` thread-safe consume/refund (Candle uses `RunContext` budget; fine for single-threaded Node).
- `error_classifier.py` provider-specific recovery actions (Anthropic thinking-sig, llama.cpp grammar) — only relevant if those providers are added.

---

# Agent Architecture Improvements (v4 — Hermes portable-utility sweep)

Source: `github.com/NousResearch/hermes-agent` (read directly). After the v3 root-cause fix for the Kimi token-leak, this round ports the remaining self-contained, high-value patterns that fit a TS/LangGraph OpenAI-compatible agent. Provider-specific adapters, TUI/CLI/LSP, and anything already covered in Candle were deliberately skipped.

## What shipped

| Area | Change | Key files |
| ---- | ------ | --------- |
| Message sanitization | Lone-surrogate scrubbing (preserves valid emoji pairs — JS/UTF-16 gotcha caught by a unit test), malformed tool-call-arg JSON repair (trailing commas, unclosed braces, control chars, Python `None`), control-char escaping. Wired into `callAgentModel` so a bad token can't crash `JSON.stringify` mid-loop on the next turn. | `backend/src/agent/message-sanitization.ts` |
| Tool-arg repair in recovery | `parseHermesToolCalls` now runs `repairToolCallArguments` on malformed args before giving up, so a recovered Kimi tool call with slightly-off JSON still executes. | `backend/src/agent/hermes-tokens.ts` |
| Rate-limit tracker | Parses `x-ratelimit-*` headers (Cloudflare/Kimi/OpenRouter convention) into typed buckets; compact summary + ≥80% warnings. Ready utility (header capture from the streaming LLM path is a follow-up). | `backend/src/agent/rate-limit-tracker.ts` |
| Token estimation | Tokenizer-free ~4-chars/token heuristic for pre-flight context checks + compression triggers (`estimateMessagesTokens`, `contextUsageRatio`). | `backend/src/agent/token-estimate.ts` |
| Session titling | Fire-and-forget title from the first exchange; emits a `session_title` WebSocket event. Never adds latency to the reply. | `backend/src/agent/title-generator.ts`, `server.ts` |
| Empty-final-answer recovery | If the model ends a turn with no tool calls AND empty text after ≥1 tool ran, force ONE `noToolsLLM` summarization pass over the gathered results. Guarded by `RunContext.emptyAnswerRecovered` so it can't loop. Fixes the observed "search runs, user sees blank" case. | `backend/src/agent/loop.ts`, `run-context.ts` |
| Skill-miner prompt quality | Polish prompt now carries Hermes self-improvement signals: capture CLASS-LEVEL reusable technique, do NOT encode environment-dependent failures, bake in non-obvious ordering, prefer smallest correct sequence. | `backend/src/agent/skill-miner.ts` |

## Tests

- New unit suites: `message-sanitization.test.ts`, `moonshot-schema.test.ts`, `hermes-tokens.test.ts`, `rate-limit-tracker.test.ts`, `token-estimate.test.ts` (46 tests). Full suite: 161 passing.
- The emoji test caught a real bug: the naive `[\uD800-\uDFFF]` regex destroys valid surrogate PAIRS. Fixed to match only LONE/unpaired surrogates via lookahead/lookbehind.

## New WebSocket event

- `session_title` — `{ type: "session_title", title }`. Client may show it as the conversation title. Emitted once, after the first exchange.

## Verified end-to-end

- Tool-using query through the public tunnel: `search_web` fires, no token leak, and the previously-blank tbhlabs query now returns a graceful "couldn't find it, here's what the results covered" answer instead of an empty bubble.

## Still NOT ported (low value / coupled / provider-specific)

- `context_compressor.py` / `conversation_compression.py` full machinery — Candle's `summarizeOldHistory` + new `token-estimate` cover the 80% case. Revisit if long sessions overflow.
- `curator.py` / `background_review.py` CODE (the PROMPT insights were folded into skill-miner).
- Provider adapters (anthropic/bedrock/gemini/codex), LSP, TTS/STT/image/video gen, account_usage, onboarding — out of scope for a single OpenAI-compatible endpoint.

---

# Agent Architecture Improvements (v5 — Hermes security & robustness sweep)

Source: `github.com/NousResearch/hermes-agent` (`agent/redact.py`, `agent/file_safety.py`). This round hardens secret handling, adds a credential-file guard for the sandbox tools, and fixes a critic-output leak discovered during e2e testing.

## What shipped

| Area | Change | Key files |
| ---- | ------ | --------- |
| Richer secret redaction | Added Hermes' vendor key-prefix table (OpenAI, GitHub, AWS, xAI, Groq, HuggingFace, Replicate, npm, PyPI, Stripe, SendGrid, Slack, Google, Tavily, Perplexity) plus structured-secret patterns (private-key blocks, DB connection-string passwords masked in place, JSON secret fields in stringified text). `redactSecrets` reducer refined to keep DB connstrings + JSON keys readable while masking only the value. | `backend/src/security.ts` |
| Sandbox file-safety guard | New `getReadBlockError` / `getWriteBlockError`. READ blocks `.env*` (allows `.env.example`), SSH keys, `.aws`/`.gnupg`/`gcloud`/`gh`/`kube`/`docker`/`azure` credential dirs. WRITE blocks shell-init files (`.bashrc` etc.), `authorized_keys`, `.npmrc`, `.git-credentials`, `/etc`. Wired into `read_sandbox_file` and `write_sandbox_file`. Defense-in-depth (terminal can still bypass) — surfaces a clear denial most models respect + leaves an audit trail. | `backend/src/agent/file-safety.ts`, `tools.ts` |
| Critic-output leak fix | The critic node calls `noToolsLLM` INSIDE the graph, so its `CRITIQUE:`/`APPROVED` tokens were streaming to the user as if they were the answer. Tagged the internal call `candle-internal` and skip those `on_chat_model_stream`/`_end` events in the streaming handler. Verified gone end-to-end. | `backend/src/agent/loop.ts`, `index.ts`, `llm.ts` (proxy now forwards invoke options) |

## Tests

- New: `file-safety.test.ts` (11 tests), `security.test.ts` extended (+4: vendor prefixes, DB connstring, private key, JSON field). Full suite: 176 passing.

## Verified end-to-end

- "Read /home/user/.env" → guard returns `Access denied: ".env" is a secret-bearing file…`; agent gracefully offers `.env.example` instead; NO `CRITIQUE`/`APPROVED` text leaks into the answer.
- Multi-step research observed working live: the agent chained `search_web → browse_web (Facebook) → search_web (Reddit/Nation Thailand)` and correctly identified the TBH Labs founder — confirming the v3 classification fix + v4 empty-answer recovery + this round compose well.

## Convention

- **Internal meta-LLM calls** (critic, future background passes) MUST pass `{ tags: ["candle-internal"] }` to `noToolsLLM.invoke` so their tokens never reach the user stream. The streaming handler in `agent/index.ts` drops model events carrying that tag.
- **Sandbox file tools**: any new tool that reads/writes sandbox paths should call `getReadBlockError` / `getWriteBlockError` first and return the message if non-null.

---

# Agent Architecture Improvements (v6 — context compression + error diagnostics)

Source: `github.com/NousResearch/hermes-agent` (`agent/context_compressor.py`, `agent/stream_diag.py`). This round closes the last high-value gap for long-running ("Manus-grade") tasks: keeping the live message state from ballooning during heavy multi-step runs.

## What shipped

| Area | Change | Key files |
| ---- | ------ | --------- |
| Context compressor | `compressToolResults` replaces OLD `role:tool` contents with informative one-line summaries (`[search_web] 5 results (5,640 chars)`) once the live token estimate crosses `CONTEXT_COMPRESS_TOKENS` (default 48k). Protects the 4 most-recent tool results so the model still has fresh data. `summarizeToolResult` maps every Candle tool to a useful summary. Anti-thrash: backs off after 2 passes that each free <10%. Cheap, deterministic, NO LLM call. | `backend/src/agent/context-compressor.ts`, `loop.ts`, `run-context.ts` |
| Error diagnostics | `flattenExceptionChain` collapses the `cause` chain (LangChain → OpenAI SDK → fetch → undici) into one redacted line; `extractDiagHeaders` pulls Cloudflare `cf-ray` + request ids; `describeError` combines them. Wired into the failover error log so `agent.log` shows the real cause + a `cf-ray` operators can quote to Cloudflare support. | `backend/src/agent/error-diag.ts`, `loop.ts` |
| Config | `CONTEXT_COMPRESS_TOKENS` (8000–400000, default 48000) documented in `.env.example`. | `backend/.env.example` |

## Tests

- New: `context-compressor.test.ts` (9), `error-diag.test.ts` (9). Full suite: **194 passing**.

## Verified end-to-end (live)

A 24-tool multi-step research run (parallel subagents + many search/browse) grew the live state to 35 messages / ~11k tokens; compression fired at the configured threshold:

```
[model:call] 🗜️ Compressed 6 old tool result(s): 11191→6437 tokens (42% saved).
```

The run completed with a full 4.3k-char answer and no context overflow. The v5 critic-leak fix also reconfirmed: `CRITIQUE:` text appears only in logs, never in the user answer.

## Decisions — what was deliberately NOT ported

- `subdirectory_hints.py` — Candle runs in a fresh E2B sandbox where `AGENTS.md`/`CLAUDE.md` rarely exist; low ROI.
- `prompt_caching.py` — Cloudflare Workers AI exposes no explicit cache-breakpoint API; the tiered prompt already maximizes prefix reuse.
- `markdown_tables.py` — the mobile UI renders markdown; server-side realignment adds a dep for little gain.
- `nous_rate_guard.py`, `context_references.py`, `curator.py`/`background_review.py` code — covered by existing Candle systems or out of scope (the review PROMPT insights were already folded into skill-miner in v4).

The portable, high-value Hermes surface is now substantially exhausted. Remaining items are provider-specific adapters, CLI/TUI/LSP, and media-gen — none of which fit Candle's single-endpoint mobile-agent architecture.


---

# Agent Architecture Improvements (v7 — planning reliability + guardrail precision)

Source: `github.com/NousResearch/hermes-agent` (read directly: `tools/todo_tool.py`, `agent/tool_guardrails.py`, `agent/prompt_builder.py`). This round fixes a real per-session isolation **bug** in the todo tool and ports three reliability/autonomy patterns that make Candle behave more like a Manus-grade long-horizon agent.

## The bug that was fixed

The old `agent/todo.ts` (`TodoManager`) persisted the task list to a **single global file** `data/todo_state.json`. Consequences:

- Every WebSocket connection shared ONE list — concurrent users clobbered each other's plans.
- The list never reset between conversations, so a plan from a previous session leaked into the next one on the same process.
- It violated the project's core "per-connection RunContext, no global mutable state" contract.
- The plan was lost the moment context compression pruned the tool messages that mentioned it.

## What shipped

| Area | Change | Key files |
| ---- | ------ | --------- |
| Per-session todo store | Replaced the global file-backed `TodoManager` with an in-memory `TodoStore` keyed by session id (the connection id from `session.ts`). Lazy-created via `getTodoStore()`, reset on a fresh conversation via `resetTodoStore()` (history length 0), and dropped on `ws close` via `clearTodosForSession()`. Ported Hermes' merge/replace write semantics + `{id, content, status}` shape (added `cancelled` status). | `backend/src/agent/todo.ts`, `tools_extra.ts` (`todoTool` rewrite), `server.ts` (cleanup), `agent/index.ts` (reset) |
| Plan survives compression | `TodoStore.formatForInjection()` renders ONLY pending/in_progress items; the loop re-injects this block as a system message immediately after `compressToolResults` fires, so a long multi-step run never loses its plan when old tool outputs are pruned. | `backend/src/agent/todo.ts`, `agent/loop.ts` |
| Guardrail idempotent/mutating split | Rewrote `guardrails.ts` to distinguish READ-ONLY (`IDEMPOTENT_TOOL_NAMES`) from state-changing (`MUTATING_TOOL_NAMES`) tools. No-progress detection now runs ONLY on read-only tools (re-reading the same file / re-searching the same query and getting the same result), and is exact-signature scoped. Mutating tools (write/run/install) are exempt — repeating them legitimately can return identical text without being a stuck loop. Added tool-specific recovery hints (terminal → run `pwd && ls -la` first). | `backend/src/agent/guardrails.ts` |
| Anti-fabrication + finish-the-job | New STABLE-tier `TASK_COMPLETION_GUIDANCE` block: deliver real artifacts not stubs, never fabricate command/file/URL/number output, report blockers honestly, no "I will now do X" without doing it that turn. Applies to all models. | `backend/src/agent/prompts.ts` |
| Pre-finalization verification | New STABLE-tier `VERIFICATION_PROTOCOL` checklist (correctness / grounding / completeness / delivery) the model runs before its final answer on Execute & Multi-step tasks. The behavioral half of the planner-critic loop, baked into the cached prompt. | `backend/src/agent/prompts.ts` |

## Conventions

- **`todo` tool contract changed.** Old `{action: add|update|list, task, id, status}` → new `{todos: [{id, content, status}], merge}`. Call with no args to read. `merge=false` (default) replaces the plan; `merge=true` updates by id + appends. Behavioral guidance ("3+ steps, one in_progress at a time, mark completed immediately") lives in the tool's schema description so it stays in the cached prompt, not the system prompt body. This is a breaking change to the tool's args, but the tool is model-facing only — no persisted state or client code depends on the old shape.
- **Adding a tool → classify it in `guardrails.ts`.** Put read-only tools in `IDEMPOTENT_TOOL_NAMES` (so no-progress detection protects them) and anything that changes state in `MUTATING_TOOL_NAMES` (so it's exempt). A tool in neither set gets failure-loop detection but not no-progress.
- **Prompt blocks** `TASK_COMPLETION_GUIDANCE` and `VERIFICATION_PROTOCOL` sit in the stable tier (after REASONING_AND_RECOVERY, before FEW_SHOT_EXAMPLES) so they're cache-stable.

## Tests

- New: `todo.test.ts` (8 — write modes, merge, dedupe, summary counts, injection filtering, clear). `guardrails.test.ts` extended (+2 — mutating tools exempt from no-progress, changed result breaks no-progress streak). Full suite: **204 passing** (was 194).
- `npm run typecheck` passes clean.

## Deliberately NOT ported (this round)

- **Hermes `background_review` / `curator`** two-tier self-improvement loop (post-turn "should I save a skill?" fork + periodic library FSM). High value but heavier: needs a forked agent + a skill-state store. Candle already has `skill-miner.ts` (offline) + `skill_manage` (in-loop). The richest remaining autonomy item; tackle as its own pass with the do-NOT-capture heuristics + pure `apply_automatic_transitions` lifecycle FSM.
- **`iteration_budget` selective refunds** (refund internal/programmatic loops + a one-shot grace call). Candle's cost ceilings + budget-exceeded forced-answer cover most of this; the grace call is a small future add.
- **`think_scrubber` streaming state machine** — Candle's `hermes-tokens` filter + message sanitization cover the observed leaks.


---

# Agent Architecture Improvements (v8 — two-tier closed-loop self-improvement)

Source: `github.com/NousResearch/hermes-agent` (`agent/background_review.py`, `agent/curator.py`). This round ports the richest remaining autonomy surface from Hermes: an agent that learns from each session and keeps its own skill library healthy — the last big "Manus-grade" gap called out in v7.

## What shipped

| Tier | Change | Key files |
| ---- | ------ | --------- |
| Post-turn review (fine-grained) | After a substantive turn, a fire-and-forget single LLM call reviews the exchange and returns a typed JSON plan: durable memory items + an optional skill create/update. Validated against Hermes' do-NOT-capture guardrails (no env-dependent failures, no negative tool claims, no transient errors, no one-off narratives, no secrets), then applied deterministically. Runs AFTER the reply (like `title-generator`), so zero added latency. Gated: fires only when ≥N substantive tools ran OR the user gave a correction/preference (global English signal regexes). | `backend/src/agent/background-review.ts`, `server.ts` (wiring), `agent/index.ts` (`onRunComplete` hook), `agent/run-context.ts` (`toolsUsed` tracking) |
| Skill usage tracker | JSON sidecar `data/skill_usage.json` records per agent-created skill: created/last-activity timestamps, view count, lifecycle state (active/stale/archived), pinned flag. `skill_view` / `createSkill` / `updateSkill` record activity; `deleteSkill` forgets. Only AGENT-created skills are tracked — bundled/human skills are curator-exempt by construction. | `backend/src/skill-usage.ts`, `skills.ts` |
| Skill curator (library-scale) | Pure, NO-LLM lifecycle FSM (`applyAutomaticTransitions`) ported from Hermes: active→stale→archived by idle time, reactivate-on-use, pin-protected, NEVER deletes (archive is recoverable; the SKILL.md stays on disk). `getSkillIndexText()` now hides archived skills so the prompt index stays lean. Inactivity-gated runner (`maybeRunCurator`, once per `CURATOR_INTERVAL_HOURS`) with seed-and-defer first run, triggered opportunistically at the tail of each background review. | `backend/src/agent/curator.ts`, `skills.ts` |
| New WS event | `learning_update { kind: "memory"|"skill", detail }` emitted when the review persists something, so the UI can show "Remembered: …" / "Skill created: …". | `server.ts` |
| Config | `BACKGROUND_REVIEW_ENABLED`, `BACKGROUND_REVIEW_MIN_TOOL_CALLS`, `CURATOR_ENABLED`, `CURATOR_INTERVAL_HOURS`, `CURATOR_STALE_AFTER_DAYS`, `CURATOR_ARCHIVE_AFTER_DAYS` documented. | `backend/.env.example` |
| Auxiliary model | New optional small/cheap model for no-tools housekeeping (background review, session titles, skill-miner polish). `auxLLM` in `llm.ts` routes to it when configured, else transparently falls back to `noToolsLLM` (no behavior change). Configure with just `AUX_MODEL_NAME` (reuse primary provider, different model) or all of `AUX_MODEL_NAME`+`AUX_API_KEY`+`AUX_BASE_URL` (separate provider). | `backend/src/agent/llm.ts`, `background-review.ts`, `title-generator.ts`, `skill-miner.ts`, `.env.example` |

## Why this shape (vs Hermes)

- Hermes forks a whole sub-agent with a memory/skill tool whitelist and an auto-deny approval callback. Candle does a **single structured-JSON LLM call** instead: cheaper, fully unit-testable (extract → validate → apply are pure functions), and it physically cannot call arbitrary tools or deadlock on an approval prompt. The do-NOT-capture heuristics and preference-order (prefer updating an existing skill over creating a new one) are carried over verbatim in the prompt + validation.
- The curator FSM is a near-direct port — it was already pure and no-LLM in Hermes. We dropped the LLM consolidation pass (merging narrow skills into umbrellas) for now; the offline `skill-miner.ts` + the new review's prefer-update behavior cover most of the consolidation pressure.

## Relationship to existing learning paths

Candle now has THREE complementary learning paths, no overlap:
- **In-loop** `skill_manage` — the agent explicitly saves a skill mid-task when it knows it solved something reusable.
- **Post-turn** background review (NEW) — automatic, catches learnings the agent didn't think to save, and captures user preferences as memory.
- **Offline** `skill-miner.ts` — clusters historical checkpoints into reviewable suggestions for operator approval.
The curator (NEW) is the GC for whatever the first two produce.

## Tests

- New: `background-review.test.ts` (15 — JSON extraction incl. fenced/embedded/brace-in-string, plan validation incl. secret-drop + bad-name reject, gating), `curator.test.ts` (5 — stale/archive transitions, pin protection, fresh-skill skip, non-agent skip). Full suite: **224 passing** (was 204).
- `npm run typecheck` clean.

## Still NOT ported (diminishing returns)

- Hermes' curator LLM **consolidation/dedup** pass (umbrella-merging narrow skills) and its dry-run report + structured-YAML reconciliation. Add if the agent-created library grows large enough to need active merging.
- `iteration_budget` selective refunds + grace call (small future add).
- `think_scrubber` streaming state machine (Candle's `hermes-tokens` filter covers observed leaks).
