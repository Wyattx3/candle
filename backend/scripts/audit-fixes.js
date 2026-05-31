// Quick smoke verification that all 12 fixes from the autonomy audit landed.
// Run: node scripts/audit-fixes.js
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const checks = [
  ["C1: prompt stored on RunContext",         "src/agent/run-context.ts",  /readonly prompt: string/],
  ["C1: critic reads runCtx.prompt",          "src/agent/loop.ts",         /const originalPrompt = runCtx\.prompt/],
  ["C2/C6: per-session sandbox map",          "src/tools.ts",              /const sandboxes = new Map<string, SandboxRecord>/],
  ["C2: closeSandboxForSession is real",      "src/tools.ts",              /Tear down the sandbox for a specific session/],
  ["C3: cron runner registry",                "src/agent/cron.ts",         /export function registerCronRunner/],
  ["C3: cron wired into agent",               "src/agent/index.ts",        /registerCronRunner\(async/],
  ["C4: browser_interact in parentTools",     "src/agent/llm.ts",          /^\s*browserInteractTool,\s*$/m],
  ["C5: sandbox_browser purged from budget",  "src/agent/budget.ts",       /sandbox_browser/, /* invert */ true],
  ["C5: sandbox_browser purged from prompt",  "src/agent/prompts.ts",      /sandbox_browser/, /* invert */ true],
  ["C7: clarification gate exists",           "src/clarification.ts",      /export function getClarificationGate/],
  ["C7: clarify tool uses gate",              "src/tools_extra.ts",        /const gate = getClarificationGate\(\)/],
  ["C7: server forwards clarification",       "src/server.ts",             /clarification_request/],
  ["C8: terminal calls approval gate",        "src/tools.ts",              /const denied = await ensureApproval\(command, "Shell command/],
  ["C8: apt install calls approval gate",     "src/tools.ts",              /Install apt packages/],
  ["C8: file mgmt calls approval gate",       "src/tools.ts",              /Destructive file operation/],
  ["C9: critic uses noToolsLLM",              "src/agent/loop.ts",         /Use the no-tools LLM so the critic/],
  ["C10: agentApp eager const removed",       "src/agent/index.ts",        /^export const agentApp/m, /* invert */ true],
  ["C11: cron resumes timers on boot",        "src/agent/cron.ts",         /Resumed .* persisted job/],
  ["C12: loop nudge reset on critic reject",  "src/agent/loop.ts",         /Reset the loop-nudge so a critic-driven retry/],
  ["S2: checkpoint store exists",             "src/agent/checkpoint.ts",   /export class CheckpointStore/],
  ["S2: checkpoint wired into run loop",      "src/agent/index.ts",        /maybeSaveCheckpoint\(/],
  ["S2: boot-time stale scan",                "src/server.ts",             /markStaleAsInterrupted/],
  ["S2: GET \\/runs endpoint",                "src/server.ts",             /app\.get\("\/runs"/],
  ["S2: POST \\/runs\\/:id\\/resume",          "src/server.ts",             /app\.post\("\/runs\/:id\/resume"/],
];

let pass = 0;
let fail = 0;
for (const [label, rel, pattern, invert] of checks) {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const matched = pattern.test(text);
  const ok = invert ? !matched : matched;
  console.log((ok ? "PASS  " : "FAIL  ") + label);
  if (ok) pass++; else fail++;
}
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
