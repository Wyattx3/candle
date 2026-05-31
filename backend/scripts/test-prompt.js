/**
 * Quick WebSocket test: sends a single prompt to the running backend
 * and prints every event the agent emits.
 *
 * Usage:  node scripts/test-prompt.js
 */

const WebSocket = require("ws");

const WS_URL = "ws://localhost:3000";
const PROMPT = "Download chapter 1 of Naruto manga and send me the file.";

const ws = new WebSocket(WS_URL);
let eventCount = 0;

ws.on("open", () => {
  console.log(`\n✦ Connected to ${WS_URL}`);
  console.log(`✦ Sending prompt: "${PROMPT}"\n`);
  ws.send(JSON.stringify({ type: "prompt", content: PROMPT }));
});

ws.on("message", (raw) => {
  const event = JSON.parse(raw.toString());
  eventCount++;

  switch (event.type) {
    case "status":
      console.log(`\n[${"STATUS".padEnd(15)}] ${event.content}`);
      break;
    case "mode":
      console.log(`[${"MODE".padEnd(15)}] ${event.mode}`);
      break;
    case "reasoning_chunk":
      process.stdout.write(`[REASONING      ] ${event.content}`);
      break;
    case "thought_chunk":
      process.stdout.write(event.content);
      break;
    case "tool_start":
      console.log(`\n\n[${"TOOL START".padEnd(15)}] 🔧 ${event.toolName}`);
      const inputStr = JSON.stringify(event.input, null, 2);
      if (inputStr && inputStr.length < 800) {
        console.log(`   input: ${inputStr.replace(/\n/g, "\n         ")}`);
      } else if (inputStr) {
        console.log(`   input: ${inputStr.slice(0, 400)}...`);
      }
      break;
    case "tool_end":
      const output = String(event.output ?? "");
      console.log(`[${"TOOL END".padEnd(15)}] ✓ ${event.toolName}`);
      if (output.length < 1200) {
        console.log(`   output: ${output.replace(/\n/g, "\n           ")}`);
      } else {
        console.log(`   output: ${output.slice(0, 600)}...`);
      }
      console.log("");
      break;
    case "error":
      console.error(`\n[${"ERROR".padEnd(15)}] ❌ ${event.content}`);
      break;
    default:
      console.log(`[${"UNKNOWN".padEnd(15)}] ${JSON.stringify(event).slice(0, 300)}`);
  }

  // Auto-close after "Agent finished." status
  if (event.type === "status" && /finished/i.test(event.content)) {
    console.log(`\n✦ Done — received ${eventCount} events total.\n`);
    ws.close();
  }
});

ws.on("error", (err) => {
  console.error(`✗ WebSocket error: ${err.message}`);
  process.exit(1);
});

ws.on("close", (code, reason) => {
  console.log(`✦ WebSocket closed  code=${code}  reason=${reason || "none"}`);
  process.exit(0);
});

// Safety timeout — 5 minutes
setTimeout(() => {
  console.log("\n✗ Timeout (5 min) — closing.");
  ws.close();
  process.exit(1);
}, 5 * 60 * 1000);
