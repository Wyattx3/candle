import WebSocket from "ws";
import * as fs from "fs";
const URL = "ws://127.0.0.1:3000";
const PROMPT = "Create a PDF file containing a short list of 5 Myanmar cities (Yangon, Mandalay, Naypyidaw, Bago, Mawlamyine) with Burmese text, and give me the download link.";
let answer = "";
const tools: string[] = [];
let sawError = false, sawUrl = false;
const ws = new WebSocket(URL);
const done = (v: string) => {
  fs.writeFileSync("pdf-e2e.out",
    `VERDICT=${v}\ntool_count=${tools.length}\ntools=${JSON.stringify(tools)}\nsaw_error=${sawError}\nsaw_url=${sawUrl}\nanswer=${JSON.stringify(answer.slice(0, 400))}\n`);
  try { ws.close(); } catch {} process.exit(0);
};
const stop = setTimeout(() => done("TIMEOUT_240s"), 240000);
ws.on("open", () => ws.send(JSON.stringify({ type: "prompt", content: PROMPT })));
ws.on("message", (raw) => {
  let ev: any; try { ev = JSON.parse(raw.toString()); } catch { return; }
  if (ev.type === "tool_start") tools.push(ev.toolName);
  else if (ev.type === "tool_end") { const o = String(ev.output ?? ""); if (/failed|error/i.test(o.slice(0, 40))) sawError = true; if (o.includes("http")) sawUrl = true; }
  else if (ev.type === "thought_chunk") { answer += String(ev.content ?? ""); if (answer.includes("http")) sawUrl = true; }
  else if (ev.type === "status" && ev.content === "Agent finished.") { clearTimeout(stop); done("FINISHED"); }
});
ws.on("error", (e) => { fs.writeFileSync("pdf-e2e.out", "WS_ERR " + (e as Error).message); process.exit(0); });
