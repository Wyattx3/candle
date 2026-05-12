import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import * as http from "http";
import * as os from "os";
import { WebSocket, WebSocketServer } from "ws";
import { AgentAbortError, AgentTimeoutError, ArtifactRegistry, ChatHistoryMessage, runAgentStream } from "./agent";
import {
  acquireConcurrencySlot,
  checkRateLimit,
  releaseConcurrencySlot,
  removeConnection,
} from "./rate-limiter";
import { redactSecrets } from "./security";
import { initSandbox } from "./tools";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Basic health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Endpoint to initialize persistent session explicitly
app.post("/session/start", async (req, res) => {
  try {
    const sandbox = await initSandbox();
    // Run basic hello world bash to verify
    const exec = await sandbox.commands.run("echo 'Hello World'");
    res.json({ session_id: sandbox.sandboxId ?? sandbox.id, test_output: exec.stdout });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
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

  const sendIfOpen = (event: any) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  };

  ws.on("message", async (message: string) => {
    let runId = 0;
    try {
      const data = JSON.parse(message);
      
      if (data.type === "prompt") {
        const prompt = data.content;

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
        activeController = new AbortController();
        runId = ++activeRunId;

        console.log(`[ws] ← prompt  run#${runId}: ${redactSecrets(prompt).slice(0, 160)}`);
        console.log(`[ws]   history: ${history.length} messages`);
        
        sendIfOpen({ type: "status", content: "Agent started..." });

        const emitEvent = (event: any) => {
          if (runId === activeRunId && !activeController?.signal.aborted) {
            // Log tool events at ws level too for easy tracing
            if (event.type === "tool_start") {
              console.log(`[ws] → emit tool_start: ${event.toolName}`);
            } else if (event.type === "tool_end") {
              const preview = String(event.output ?? "").slice(0, 120).replace(/\n/g, " ");
              console.log(`[ws] → emit tool_end:   ${event.toolName} | ${preview}`);
            } else if (event.type === "error") {
              console.error(`[ws] → emit error: ${event.content}`);
            }
            sendIfOpen(event);
          }
        };

        try {
          const assistantText = await runAgentStream(prompt, emitEvent, {
            signal: activeController.signal,
            history,
            artifactRegistry,
          });

          if (runId === activeRunId && !activeController.signal.aborted) {
            history = trimChatHistory([
              ...history,
              { role: "user", content: prompt },
              ...(assistantText ? [{ role: "assistant" as const, content: assistantText }] : []),
            ]);
            console.log(`[ws] ✓ run#${runId} finished  history now: ${history.length} messages`);
            sendIfOpen({ type: "status", content: "Agent finished." });
          }
        } finally {
          releaseConcurrencySlot();
        }
      }
    } catch (e: any) {
      if (activeController?.signal.aborted || e instanceof AgentAbortError || e?.name === "AbortError") {
        console.log(`[ws] ✗ run#${runId} cancelled`);
        releaseConcurrencySlot();
        return;
      }

      if (e instanceof AgentTimeoutError) {
        console.warn(`[ws] ✗ run#${runId} timed out`);
        sendIfOpen({
          type: "error",
          content: "The agent run timed out. Partial results (if any) were delivered above.",
        });
        releaseConcurrencySlot();
        return;
      }

      console.error(`[ws] ✗ run#${runId} ERROR:`, e);
      const message = String(e?.message ?? e ?? "");
      const isRecursionLimit = /recursion limit|GRAPH_RECURSION_LIMIT/i.test(message);
      const isLLMError = /cloudflare|model|inference|rate.?limit|429|500|502|503/i.test(message);
      sendIfOpen({
        type: "error",
        content: isRecursionLimit
          ? "The agent hit its step limit before finishing. I kept the completed work and stopped the run cleanly."
          : isLLMError
            ? "The AI model is temporarily unavailable. Please try again in a moment."
            : "The agent hit an internal error while running the task.",
      });
      releaseConcurrencySlot();
    }
  });

  ws.on("close", (code, reason) => {
    console.log(`[ws] ✦ Client disconnected  code=${code} reason=${reason?.toString() || "none"}`);
    activeController?.abort();
    removeConnection(connectionId);
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

function trimChatHistory(messages: ChatHistoryMessage[]) {
  const maxMessages = getMaxHistoryMessages();
  const maxChars = getMaxHistoryChars();
  const trimmed = messages.slice(-maxMessages);
  let used = 0;
  const kept: ChatHistoryMessage[] = [];

  for (let i = trimmed.length - 1; i >= 0; i -= 1) {
    const message = {
      ...trimmed[i],
      content: redactSecrets(trimmed[i].content).slice(0, 12_000),
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
});
