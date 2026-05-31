import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import * as crypto from "node:crypto";
import * as http from "http";
import * as os from "os";
import { WebSocket, WebSocketServer } from "ws";
import { AgentAbortError, AgentTimeoutError, ArtifactRegistry, ChatHistoryMessage, runAgentStream, checkpointStore } from "./agent";
import { cronManager } from "./agent/cron";
import { setMcpTools } from "./agent/llm";
import {
  deleteSuggestion,
  listSuggestions,
  loadSuggestion,
  mineSkillSuggestions,
  mineSkillSuggestionsWithPolish,
  updateSuggestionStatus,
} from "./agent/skill-miner";
import { withSessionContext } from "./agent/session";
import { clearTodosForSession } from "./agent/todo";
import { maybeBackgroundReview } from "./agent/background-review";
import { maybeAutoTitle } from "./agent/title-generator";
import { createSkill } from "./skills";
import {
  ApprovalDecision,
  ApprovalGate,
  ApprovalRequest,
  classifyCommandRisk,
} from "./approvals";
import { ClarificationGate, ClarificationRequest } from "./clarification";
import { classifyLlmError } from "./llm-errors";
import { getMcpTools, initMcpHost, shutdownMcpHost } from "./mcp";
import {
  acquireConcurrencySlot,
  checkRateLimit,
  releaseConcurrencySlot,
  removeConnection,
} from "./rate-limiter";
import { redactSecrets } from "./security";
import { closeSandbox, closeSandboxForSession, initSandbox } from "./tools";

interface BackgroundTask {
  id: string;
  connectionId: string;
  controller: AbortController;
  logs: any[];
  status: "running" | "done" | "error";
  result?: string;
  /** When the task reached a terminal state — used for TTL eviction. */
  finishedAt?: number;
}

const activeTasks = new Map<string, BackgroundTask>();

/** Completed tasks are kept this long so `GET /tasks/:id` can still poll them. */
const TASK_RETENTION_MS = 5 * 60_000;
/** Hard cap on retained logs per task to bound memory on chatty runs. */
const MAX_TASK_LOGS = 500;

/**
 * Evict finished tasks older than the retention window. Called whenever a new
 * task starts so `activeTasks` (which holds every emitted event in `logs`)
 * can't grow without bound on a long-lived server.
 */
function pruneFinishedTasks(): void {
  const now = Date.now();
  for (const [id, task] of activeTasks) {
    if (task.status !== "running" && task.finishedAt && now - task.finishedAt > TASK_RETENTION_MS) {
      activeTasks.delete(id);
    }
  }
}

// Load `.env` first so module-level imports below can read API keys.
// `override: true` makes the file win over stale shell env vars.
dotenv.config({ override: true });

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Basic health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Endpoint to verify sandbox provisioning works (health check). Spins up a
// sandbox, runs a trivial command, then TEARS IT DOWN — previously it left a
// `_default` sandbox running until its 900s timeout on every call (leak/cost).
app.post("/session/start", async (req, res) => {
  try {
    const sandbox = await initSandbox();
    const exec = await sandbox.commands.run("echo 'Hello World'");
    const sessionId = sandbox.sandboxId ?? sandbox.id;
    // Don't keep this ad-hoc sandbox around — it isn't tied to a WS session.
    await closeSandbox().catch(() => undefined);
    res.json({ session_id: sessionId, test_output: exec.stdout });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Endpoint to poll background tasks
app.get("/tasks/:id", (req, res) => {
  const task = activeTasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: "Task not found" });
  res.json({
    id: task.id,
    status: task.status,
    logs: task.logs,
    result: task.result,
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Run inspection + resume API
// ─────────────────────────────────────────────────────────────────────────
// `GET /runs`             — list every checkpointed run (newest first).
// `GET /runs/:id`         — full checkpoint detail for one run.
// `DELETE /runs/:id`      — drop a checkpoint (e.g. after manual triage).
// `POST /runs/:id/resume` — start a NEW run that retries the original
//   prompt with the prior partial answer replayed as context, so the new
//   run can pick up roughly where the old one left off without trying to
//   reconstruct mid-graph state (which is not snapshottable).
app.get("/runs", (_req, res) => {
  const list = checkpointStore.list().map((r) => ({
    runId: r.runId,
    sessionId: r.sessionId,
    status: r.status,
    promptPreview: r.prompt.slice(0, 160),
    toolCallCount: r.runCtx.toolCallCount,
    costScore: r.runCtx.costScore,
    startedAt: r.startedAt,
    updatedAt: r.updatedAt,
    completedAt: r.completedAt,
    error: r.error,
  }));
  res.json({ runs: list, total: list.length });
});

app.get("/runs/:id", (req, res) => {
  const record = checkpointStore.load(req.params.id);
  if (!record) return res.status(404).json({ error: "Run not found" });
  res.json(record);
});

app.delete("/runs/:id", (req, res) => {
  const removed = checkpointStore.delete(req.params.id);
  res.status(removed ? 200 : 404).json({ removed });
});

app.post("/runs/:id/resume", async (req, res) => {
  const record = checkpointStore.load(req.params.id);
  if (!record) return res.status(404).json({ error: "Run not found" });
  if (record.status !== "interrupted" && record.status !== "failed" && record.status !== "cancelled") {
    return res.status(409).json({ error: `Cannot resume a run that ended with status "${record.status}".` });
  }
  try {
    // Build a continuation prompt that includes the original ask + whatever
    // partial output the prior run produced. The graph is re-run from
    // scratch; the partial answer just steers it past redundant steps.
    const continuation = record.partialAnswer.trim()
      ? `${record.prompt}\n\n[The previous attempt produced partial output below — pick up where it stopped, do not redo finished work.]\n${record.partialAnswer}`
      : record.prompt;
    const noopEmit = () => {};
    const result = await runAgentStream(continuation, noopEmit, {
      history: record.history,
      artifactRegistry: new ArtifactRegistry(),
    });
    res.json({ resumedFrom: record.runId, result: String(result).slice(0, 8000) });
  } catch (err: any) {
    res.status(500).json({ resumedFrom: record.runId, error: String(err?.message ?? err) });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Skill suggestion mining + review API
// ─────────────────────────────────────────────────────────────────────────
// `POST /skill-suggestions/mine` — re-scan checkpoints, emit new suggestions.
// `GET /skill-suggestions`        — list every suggestion (newest first).
// `GET /skill-suggestions/:id`    — full body for review.
// `POST /skill-suggestions/:id/approve` — mark approved AND register the
//   skill via `createSkill`. The body can be edited inline before approval.
// `POST /skill-suggestions/:id/reject` — mark rejected (kept for audit).
// `DELETE /skill-suggestions/:id` — drop the suggestion file.
app.post("/skill-suggestions/mine", async (req, res) => {
  // ?polish=1 (or {polish:true} body) runs an LLM polish pass over each new
  // suggestion's body before persisting. Costs 1 cheap LLM call per new
  // suggestion. Defaults to OFF so the smoke path is fast + free.
  const polish =
    String(req.query.polish ?? "") === "1" ||
    req.query.polish === "true" ||
    req.body?.polish === true;
  try {
    const summary = polish
      ? await mineSkillSuggestionsWithPolish()
      : mineSkillSuggestions();
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message ?? err) });
  }
});

app.get("/skill-suggestions", (_req, res) => {
  res.json({ suggestions: listSuggestions() });
});

app.get("/skill-suggestions/:id", (req, res) => {
  const found = loadSuggestion(req.params.id);
  if (!found) return res.status(404).json({ error: "Suggestion not found" });
  res.json(found);
});

app.post("/skill-suggestions/:id/approve", (req, res) => {
  const found = loadSuggestion(req.params.id);
  if (!found) return res.status(404).json({ error: "Suggestion not found" });
  // The reviewer can override name/description/body/tags inline before
  // promoting — the suggestion is just the starting point.
  const name = (req.body?.name ?? found.name).toString();
  const description = (req.body?.description ?? found.description).toString();
  const body = (req.body?.body ?? found.body).toString();
  const tags = Array.isArray(req.body?.tags) ? req.body.tags : found.tags;
  try {
    const result = createSkill({ name, description, body, tags });
    updateSuggestionStatus(req.params.id, "approved");
    res.json({ status: result.status, name: result.name, filePath: result.filePath });
  } catch (err: any) {
    res.status(400).json({ error: String(err?.message ?? err) });
  }
});

app.post("/skill-suggestions/:id/reject", (req, res) => {
  const updated = updateSuggestionStatus(req.params.id, "rejected");
  if (!updated) return res.status(404).json({ error: "Suggestion not found" });
  res.json(updated);
});

app.delete("/skill-suggestions/:id", (req, res) => {
  const removed = deleteSuggestion(req.params.id);
  res.status(removed ? 200 : 404).json({ removed });
});

// WebSocket Connection
wss.on("connection", (ws: WebSocket, req) => {
  const clientIp = req.socket.remoteAddress ?? "unknown";
  const connectionId = `${clientIp}:${Date.now()}`;
  console.log(`\n[ws] ✦ Client connected  ip=${clientIp}  id=${connectionId}`);
  let activeRunId = 0;
  let activeController: AbortController | undefined;
  let history: ChatHistoryMessage[] = [];
  const artifactRegistry = new ArtifactRegistry();
  // Set true once the client WebSocket has closed. Lets a run that was kept
  // alive in the background (because a task was still running at close time)
  // tear down its sandbox + per-session state when it finally finishes.
  let connectionClosed = false;

  /** Tear down all per-connection resources. Idempotent / best-effort. */
  const teardownConnection = () => {
    void closeSandboxForSession(connectionId).catch((err) => {
      console.warn(`[sandbox] cleanup failed for ${connectionId}: ${err?.message ?? err}`);
    });
    clearTodosForSession(connectionId);
    removeConnection(connectionId);
  };

  // Per-connection approval state.
  // - `pendingApprovals` resolves when the client posts an `approval_response`.
  // - `allowAlwaysCommands` caches commands the user opted to always allow
  //   for the lifetime of THIS connection only. Never persisted to disk.
  const pendingApprovals = new Map<string, (decision: ApprovalDecision) => void>();
  const allowAlwaysCommands = new Set<string>();
  const APPROVAL_TIMEOUT_MS = 120_000;

  const approvalCacheKey = (request: ApprovalRequest) =>
    `${request.command.replace(/\s+/g, " ").trim()}::${request.riskLevel}`;

  const approvalGate: ApprovalGate = (request) => {
    return new Promise((resolve) => {
      // Auto-reject high-risk patterns the classifier already flagged.
      if (request.riskLevel === "high") {
        sendIfOpen({
          type: "approval_decision",
          decision: "reject",
          command: request.command,
          riskLevel: request.riskLevel,
          source: "auto",
          reason: "Auto-rejected: high-risk command pattern.",
        });
        resolve("reject");
        return;
      }

      // Honor allow_always cache for this connection.
      const key = approvalCacheKey(request);
      if (allowAlwaysCommands.has(key)) {
        sendIfOpen({
          type: "approval_decision",
          decision: "allow_once",
          command: request.command,
          riskLevel: request.riskLevel,
          source: "cache",
          reason: "Previously approved with 'always' for this session.",
        });
        resolve("allow_once");
        return;
      }

      const requestId = crypto.randomUUID();
      const timeout = setTimeout(() => {
        if (pendingApprovals.delete(requestId)) {
          sendIfOpen({
            type: "approval_decision",
            decision: "reject",
            command: request.command,
            riskLevel: request.riskLevel,
            requestId,
            source: "timeout",
            reason: "No response within 2 minutes — auto-rejected for safety.",
          });
          resolve("reject");
        }
      }, APPROVAL_TIMEOUT_MS);

      pendingApprovals.set(requestId, (decision) => {
        clearTimeout(timeout);
        if (decision === "allow_always") {
          allowAlwaysCommands.add(key);
        }
        resolve(decision === "allow_always" ? "allow_once" : decision);
      });

      sendIfOpen({
        type: "approval_request",
        requestId,
        command: request.command,
        riskLevel: request.riskLevel,
        reason: request.reason,
        timeoutMs: APPROVAL_TIMEOUT_MS,
      });
    });
  };

  // Per-connection clarification state (mirror of approval flow).
  // Key: requestId. Value: resolver that ends the await on the tool side.
  const pendingClarifications = new Map<string, (reply: string) => void>();
  const CLARIFICATION_TIMEOUT_MS = 180_000;

  const clarificationGate: ClarificationGate = (request: ClarificationRequest) => {
    return new Promise<string>((resolve) => {
      const requestId = crypto.randomUUID();
      const timeout = setTimeout(() => {
        if (pendingClarifications.delete(requestId)) {
          sendIfOpen({
            type: "clarification_decision",
            decision: "timeout",
            requestId,
            reason: "User did not reply within 3 minutes — proceeding without clarification.",
          });
          resolve(""); // empty reply = "no answer"; tool falls back to best assumption.
        }
      }, CLARIFICATION_TIMEOUT_MS);

      pendingClarifications.set(requestId, (reply) => {
        clearTimeout(timeout);
        resolve(reply);
      });

      sendIfOpen({
        type: "clarification_request",
        requestId,
        question: request.question,
        options: request.options,
        timeoutMs: CLARIFICATION_TIMEOUT_MS,
      });
    });
  };

  const sendIfOpen = (event: any) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  };

  ws.on("message", async (message: string) => {
    let runId = 0;
    try {
      const data = JSON.parse(message);

      // Heartbeat: respond to ping immediately
      if (data.type === "ping") {
        sendIfOpen({ type: "pong" });
        return;
      }

      // Approval response from the UI.
      if (data.type === "approval_response") {
        const requestId = String(data.requestId ?? "");
        const decision = String(data.decision ?? "") as ApprovalDecision;
        if (!["allow_once", "allow_always", "reject"].includes(decision)) {
          sendIfOpen({ type: "error", content: `Invalid approval decision: ${decision}` });
          return;
        }
        const resolver = pendingApprovals.get(requestId);
        if (!resolver) {
          // Already timed out / cancelled — ignore silently.
          return;
        }
        pendingApprovals.delete(requestId);
        resolver(decision);
        return;
      }
      
      // Clarification response from the UI.
      if (data.type === "clarification_response") {
        const requestId = String(data.requestId ?? "");
        const reply = String(data.reply ?? "");
        const resolver = pendingClarifications.get(requestId);
        if (!resolver) return; // already timed out / cancelled
        pendingClarifications.delete(requestId);
        resolver(reply);
        return;
      }
      
      if (data.type === "prompt") {
        const prompt = data.content;

        // The client sends its on-screen conversation as the authoritative
        // history. This survives run cancellations (a new prompt aborts the
        // prior run before it can persist) and WebSocket reconnects (a new
        // connection starts with an empty server-side history) — both of
        // which previously left the agent with zero context. Fall back to
        // the server-accumulated history only when the client omits it.
        if (Array.isArray(data.history)) {
          const clientHistory: ChatHistoryMessage[] = data.history
            .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
            .map((m: any) => ({ role: m.role, content: m.content }));
          history = trimChatHistory(clientHistory);
        }

        // Rate limit check
        const rateCheck = checkRateLimit(connectionId);
        if (!rateCheck.allowed) {
          sendIfOpen({
            type: "error",
            content: rateCheck.reason,
            retryAfterMs: rateCheck.retryAfterMs,
          });
          return;
        }

        // Concurrency check
        if (!acquireConcurrencySlot()) {
          sendIfOpen({
            type: "error",
            content: "Server is at capacity. Please try again in a few seconds.",
            retryAfterMs: 5_000,
          });
          return;
        }

        activeController?.abort();
        // A new prompt cancels any approvals still pending for the prior run.
        for (const [requestId, resolver] of pendingApprovals.entries()) {
          pendingApprovals.delete(requestId);
          resolver("reject");
        }
        // Same for any open clarification request.
        for (const [requestId, resolver] of pendingClarifications.entries()) {
          pendingClarifications.delete(requestId);
          resolver("");
        }
        activeController = new AbortController();
        runId = ++activeRunId;

        console.log(`[ws] ← prompt  run#${runId}: ${redactSecrets(prompt).slice(0, 160)}`);
        console.log(`[ws]   history: ${history.length} messages`);
        
        const taskId = crypto.randomUUID();
        const task: BackgroundTask = {
          id: taskId,
          connectionId,
          controller: activeController,
          logs: [],
          status: "running"
        };
        pruneFinishedTasks();
        activeTasks.set(taskId, task);
        
        sendIfOpen({ type: "task_started", taskId });
        sendIfOpen({ type: "status", content: "Agent started..." });
        // Immediately signal that the agent is thinking (reduces perceived latency)
        sendIfOpen({ type: "thinking", content: true });

        const emitEvent = (event: any) => {
          if (runId === activeRunId && !activeController?.signal.aborted) {
            task.logs.push(event);
            if (task.logs.length > MAX_TASK_LOGS) task.logs.splice(0, task.logs.length - MAX_TASK_LOGS);
            if (event.type === "tool_start") {
              console.log(`[ws] → emit tool_start: ${event.toolName}`);
              event.progress = { current: event.toolIndex ?? 0, budget: event.budget ?? 0 };
            } else if (event.type === "tool_end") {
              const preview = String(event.output ?? "").slice(0, 120).replace(/\n/g, " ");
              console.log(`[ws] → emit tool_end:   ${event.toolName} | ${preview}`);
            } else if (event.type === "thought_chunk") {
              sendIfOpen({ type: "thinking", content: false });
            } else if (event.type === "error") {
              console.error(`[ws] → emit error: ${event.content}`);
            }
            sendIfOpen(event);
          }
        };

        try {
          let runToolsUsed: string[] = [];
          const assistantText = await withSessionContext(
            { sessionId: connectionId, signal: activeController.signal },
            () =>
              runAgentStream(prompt, emitEvent, {
                signal: activeController!.signal,
                history,
                artifactRegistry,
                approvalGate,
                clarificationGate,
                onRunComplete: (info) => { runToolsUsed = info.toolsUsed; },
              })
          );

          if (runId === activeRunId && !activeController.signal.aborted) {
            const priorUserMessageCount = history.filter((m) => m.role === "user").length;
            history = trimChatHistory([
              ...history,
              { role: "user", content: prompt },
              ...(assistantText ? [{ role: "assistant" as const, content: assistantText }] : []),
            ]);
            console.log(`[ws] ✓ run#${runId} finished  history now: ${history.length} messages`);
            sendIfOpen({ type: "status", content: "Agent finished." });

            // Fire-and-forget session title on the first exchange.
            maybeAutoTitle({
              userMessage: prompt,
              assistantResponse: assistantText ?? "",
              priorUserMessageCount,
              onTitle: (title) => sendIfOpen({ type: "session_title", title }),
            });

            // Fire-and-forget post-turn learning (memory + skill review).
            // Runs AFTER the reply is delivered so it never adds latency.
            // Wrapped in the session context so any session-scoped reads
            // resolve to this connection.
            void withSessionContext(
              { sessionId: connectionId },
              () =>
                maybeBackgroundReview({
                  prompt,
                  response: assistantText ?? "",
                  toolsUsed: runToolsUsed,
                  onAction: (action) =>
                    sendIfOpen({ type: "learning_update", kind: action.kind, detail: action.detail }),
                })
            ).catch((err) => {
              console.warn(`[review] background review error: ${err?.message ?? err}`);
            });

            task.status = "done";
            task.result = assistantText;
            task.finishedAt = Date.now();
          }
        } finally {
          releaseConcurrencySlot();
          // Mark the task terminal so pruneFinishedTasks can evict it. If it
          // didn't reach "done" (abort/error), flag it as error and stamp the
          // finish time so it doesn't linger forever in activeTasks.
          if (task.status === "running") task.status = "error";
          task.finishedAt = Date.now();
          // If the client already disconnected and no OTHER task for this
          // connection is still running, tear down now — the close handler
          // deferred cleanup to us because this task was still running then.
          if (connectionClosed) {
            const stillRunning = Array.from(activeTasks.values())
              .some(t => t.connectionId === connectionId && t.status === "running");
            if (!stillRunning) {
              console.log(`[ws] Background task finished for closed connection ${connectionId} — cleaning up.`);
              teardownConnection();
            }
          }
        }
      }
    } catch (e: any) {
      // NOTE: the concurrency slot is released exactly once — in the inner
      // `finally` that wraps `runAgentStream`. That `finally` runs on success,
      // abort, AND error before this catch sees the exception, so we must NOT
      // release again here (double-release permanently leaks the slot and
      // eventually defeats the concurrency cap).
      if (activeController?.signal.aborted || e instanceof AgentAbortError || e?.name === "AbortError") {
        console.log(`[ws] ✗ run#${runId} cancelled`);
        sendIfOpen({ type: "status", content: "Cancelled." });
        sendIfOpen({ type: "cancelled", runId });
        return;
      }

      if (e instanceof AgentTimeoutError) {
        console.warn(`[ws] ✗ run#${runId} timed out`);
        sendIfOpen({
          type: "error",
          content: "The agent run timed out. Partial results (if any) were delivered above.",
        });
        return;
      }

      console.error(`[ws] ✗ run#${runId} ERROR:`, e);
      const message = String(e?.message ?? e ?? "");
      const isRecursionLimit = /recursion limit|GRAPH_RECURSION_LIMIT/i.test(message);
      const classification = classifyLlmError(e);
      const isLLMError = classification.class !== "unknown" || /cloudflare|inference/i.test(message);

      let userFacing: string;
      if (isRecursionLimit) {
        userFacing = "The agent hit its step limit before finishing. I kept the completed work and stopped the run cleanly.";
      } else if (classification.class === "auth") {
        userFacing = "The AI provider rejected our credentials. The server admin needs to check the API key.";
      } else if (classification.class === "quota") {
        userFacing = "The AI provider's quota for this account is exhausted. Try again later or check billing.";
      } else if (classification.class === "context_length") {
        userFacing = "The conversation got too long for the model. Start a new chat to reset context.";
      } else if (classification.class === "content_policy") {
        userFacing = "The AI provider's safety filter blocked this request. Try rephrasing it.";
      } else if (classification.class === "rate_limit") {
        userFacing = "The AI provider is rate-limiting us. Please try again in a moment.";
      } else if (isLLMError) {
        userFacing = "The AI model is temporarily unavailable. Please try again in a moment.";
      } else {
        userFacing = "The agent hit an internal error while running the task.";
      }

      sendIfOpen({ type: "error", content: userFacing });
    }
  });

  ws.on("close", (code, reason) => {
    console.log(`[ws] ✦ Client disconnected  code=${code} reason=${reason?.toString() || "none"}`);
    connectionClosed = true;

    // Instead of aborting the agent, we let it run in the background if it's currently running
    const hasRunningTask = Array.from(activeTasks.values()).some(t => t.connectionId === connectionId && t.status === "running");
    
    if (!hasRunningTask) {
      activeController?.abort();
      teardownConnection();
    } else {
      console.log(`[ws] Connection dropped but a background task is running. Keeping agent and sandbox alive for ${connectionId} — it will be cleaned up when the task finishes.`);
    }

    // Reject any pending approvals so awaiting tool calls don't hang.
    for (const [requestId, resolver] of pendingApprovals.entries()) {
      pendingApprovals.delete(requestId);
      resolver("reject");
    }

    // Resolve any pending clarifications with an empty reply so the tool
    // can fall back to its best-guess message instead of hanging.
    for (const [requestId, resolver] of pendingClarifications.entries()) {
      pendingClarifications.delete(requestId);
      resolver("");
    }
  });

  ws.on("error", (err) => {
    console.error(`[ws] ✗ WebSocket error:`, err.message);
  });
});

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

function getMaxHistoryMessages() {
  const parsed = Number(process.env.CHAT_HISTORY_MAX_MESSAGES);
  if (!Number.isFinite(parsed)) return 24;
  return Math.max(2, Math.min(80, Math.floor(parsed)));
}

function getMaxHistoryChars() {
  const parsed = Number(process.env.CHAT_HISTORY_MAX_CHARS);
  if (!Number.isFinite(parsed)) return 24_000;
  return Math.max(2_000, Math.min(120_000, Math.floor(parsed)));
}

const MAX_SINGLE_MESSAGE_CHARS = Number(process.env.MAX_SINGLE_MESSAGE_CHARS) || 12_000;

function trimChatHistory(messages: ChatHistoryMessage[]) {
  const maxMessages = getMaxHistoryMessages();
  const maxChars = getMaxHistoryChars();
  const trimmed = messages.slice(-maxMessages);
  let used = 0;
  const kept: ChatHistoryMessage[] = [];

  for (let i = trimmed.length - 1; i >= 0; i -= 1) {
    const message = {
      ...trimmed[i],
      content: redactSecrets(trimmed[i].content).slice(0, MAX_SINGLE_MESSAGE_CHARS),
    };
    const nextUsed = used + message.content.length;
    if (kept.length > 0 && nextUsed > maxChars) break;
    kept.unshift(message);
    used = nextUsed;
  }

  return kept;
}

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((details) => details.family === "IPv4" && !details.internal)
    .map((details) => details.address);
}

server.listen(PORT, HOST, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`WebSocket is listening on ws://localhost:${PORT}`);

  for (const address of getLanAddresses()) {
    console.log(`LAN WebSocket: ws://${address}:${PORT}`);
  }

  // Make sure the cron manager is loaded eagerly. The module-level
  // `cronManager` constructor already restored persisted jobs, but importing
  // it here documents the side effect and keeps it from being tree-shaken.
  console.log(`[cron] ${cronManager.count()} job(s) loaded from disk.`);

  // Boot-time recovery — any "running" checkpoint that survived a crash is
  // a zombie. Promote it to "interrupted" so the operator can decide what
  // to do (resume, drop, or inspect via /runs).
  try {
    const interrupted = checkpointStore.markStaleAsInterrupted();
    const pruned = checkpointStore.prune();
    if (interrupted > 0) console.log(`[checkpoint] Marked ${interrupted} stale run(s) as interrupted.`);
    if (pruned.removed > 0) console.log(`[checkpoint] Pruned ${pruned.removed} old checkpoint(s).`);
  } catch (err: any) {
    console.warn(`[checkpoint] boot-time scan failed: ${err?.message ?? err}`);
  }

  // Connect to MCP servers asynchronously after the WS server is up so a slow
  // MCP handshake never blocks user traffic. When ready, push the imported
  // tools into the agent's tool registry so the next prompt sees them.
  void initMcpHost()
    .then(() => {
      const tools = getMcpTools();
      if (tools.length > 0) {
        setMcpTools(tools);
        console.log(`[mcp] ${tools.length} dynamic tool(s) bound into the agent registry.`);
      }
    })
    .catch((err) => {
      console.warn(`[mcp] init failed: ${err?.message ?? err}`);
    });
});

// Best-effort cleanup so child MCP processes don't outlive the server.
async function gracefulShutdown(reason: string) {
  console.log(`[server] graceful shutdown (${reason})`);
  try {
    cronManager.stopAll();
  } catch {
    /* ignore */
  }
  try {
    await shutdownMcpHost();
  } catch (err: any) {
    console.warn(`[server] mcp shutdown error: ${err?.message ?? err}`);
  }
  server.close(() => process.exit(0));
  // Force-exit if close() hangs.
  setTimeout(() => process.exit(0), 5_000).unref();
}

process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
