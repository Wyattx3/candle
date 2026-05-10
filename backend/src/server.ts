import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import * as http from "http";
import * as os from "os";
import dotenv from "dotenv";
import cors from "cors";
import { runAgentStream } from "./agent";
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
wss.on("connection", (ws: WebSocket) => {
  console.log("Client connected via WebSocket");
  let activeRunId = 0;
  let activeController: AbortController | undefined;

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
        activeController?.abort();
        activeController = new AbortController();
        runId = ++activeRunId;

        console.log(`Received prompt: ${prompt}`);
        
        sendIfOpen({ type: "status", content: "Agent started..." });

        const emitEvent = (event: any) => {
          if (runId === activeRunId && !activeController?.signal.aborted) {
            sendIfOpen(event);
          }
        };

        await runAgentStream(prompt, emitEvent, { signal: activeController.signal });

        if (runId === activeRunId && !activeController.signal.aborted) {
          sendIfOpen({ type: "status", content: "Agent finished." });
        }
      }
    } catch (e: any) {
      if (activeController?.signal.aborted) {
        console.log("Agent run cancelled.");
        return;
      }

      console.error("Error processing message:", e);
      const message = String(e?.message ?? e ?? "");
      const isRecursionLimit = /recursion limit|GRAPH_RECURSION_LIMIT/i.test(message);
      sendIfOpen({
        type: "error",
        content: isRecursionLimit
          ? "The agent hit its step limit before finishing. I kept the completed work and stopped the run cleanly."
          : "The agent hit an internal error while running the task.",
      });
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    activeController?.abort();
  });
});

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

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
