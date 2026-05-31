// Throwaway WS connectivity probe — writes result synchronously then exits.
const WebSocket = require("ws");
const fs = require("fs");
const url = process.argv[2];
function done(line, code) {
  fs.writeFileSync("probe.out", line + "\n");
  process.exit(code);
}
const ws = new WebSocket(url);
const timer = setTimeout(() => done("TIMEOUT: no pong within 12s", 1), 12000);
ws.on("open", () => ws.send(JSON.stringify({ type: "ping" })));
ws.on("message", (data) => { clearTimeout(timer); done("OK upgrade+pong: " + data.toString().slice(0, 120), 0); });
ws.on("error", (err) => { clearTimeout(timer); done("WS ERROR: " + err.message, 1); });
