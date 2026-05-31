/**
 * End-to-end smoke test that exercises the agent's three flagship paths:
 *   1. sandbox_browser  — Playwright is actually installed in the rebuilt
 *                         E2B template; goto + extract + screenshot work.
 *   2. spawn_subagents_parallel — three workers run concurrently against
 *                         a real Cloudflare LLM and aggregate.
 *   3. mineSkillSuggestions    — runs against synthetic checkpoints to
 *                         verify the offline pipeline.
 *
 * Run with `npm run smoke:e2e`. Costs a few real Cloudflare + E2B + Kernel
 * tokens — DO NOT run on CI without budget controls. Each step is wrapped
 * in a try/catch so a single failure doesn't mask the rest.
 */

import "../src/agent/llm"; // forces .env loading via dotenv
import * as fs from "fs";
import * as path from "path";

import { sandboxBrowserTool } from "../src/tools";
import { runSubagentBatch } from "../src/agent/subagent";
import { ArtifactRegistry } from "../src/agent";
import { mineSkillSuggestions } from "../src/agent/skill-miner";
import { withSessionContext } from "../src/agent/session";
import { closeSandboxForSession } from "../src/tools";

const SESSION_ID = `smoke-${Date.now()}`;

async function step(label: string, fn: () => Promise<void>) {
  console.log(`\n${"━".repeat(70)}\n▶ ${label}\n${"━".repeat(70)}`);
  const t0 = Date.now();
  try {
    await fn();
    console.log(`✓ ${label} — ${(Date.now() - t0) / 1000}s`);
    return true;
  } catch (err: any) {
    console.error(`✗ ${label} — ${err?.stack ?? err?.message ?? err}`);
    return false;
  }
}

async function main() {
  let pass = 0;
  let total = 0;

  total += 1;
  if (
    await step("sandbox_browser: launch Playwright + screenshot a real page", async () => {
      const result = await withSessionContext({ sessionId: SESSION_ID }, async () => {
        return sandboxBrowserTool.invoke({
          actions: [
            { type: "goto", url: "https://example.com" },
            { type: "extract" },
            { type: "screenshot", filename: "smoke.png" },
          ],
          mobile: false,
          reset_profile: true,
        });
      });
      console.log("Tool output (first 800 chars):", String(result).slice(0, 800));
      const parsed = JSON.parse(String(result));
      if (!parsed.ok) throw new Error(`tool returned ok=false: ${parsed.error ?? "(no detail)"}`);
      if (!parsed.finalUrl?.includes("example.com")) {
        throw new Error(`finalUrl unexpected: ${parsed.finalUrl}`);
      }
      const screenshot = (parsed.artifacts ?? []).find(
        (a: any) => a.kind === "screenshot" && a.filename === "smoke.png"
      );
      if (!screenshot?.path) throw new Error("screenshot artifact missing");
      console.log(`  screenshot: ${screenshot.path}`);
    })
  ) pass += 1;

  total += 1;
  if (
    await step("spawn_subagents_parallel: 3 concurrent workers", async () => {
      const tasks = [
        { id: "w1", task: "Tell me in two sentences what HTTP/2 is. Reply with prose only — do not call any tools." },
        { id: "w2", task: "Tell me in two sentences what HTTP/3 is. Reply with prose only — do not call any tools." },
        { id: "w3", task: "Tell me in two sentences what WebSocket is. Reply with prose only — do not call any tools." },
      ];
      const registry = new ArtifactRegistry();
      const result = await withSessionContext({ sessionId: SESSION_ID }, async () => {
        return runSubagentBatch(tasks, registry, undefined, { combineStrategy: "all" });
      });
      console.log(`  workers: ${result.results.length}`);
      console.log(`  ok overall: ${result.ok}`);
      console.log(`  total tool calls: ${result.toolCallsUsedTotal} / ${result.toolCallBudgetTotal}`);
      for (const r of result.results) {
        const marker = r.result.ok ? "✓" : "✗";
        const summary = (r.result.summary || r.result.error || "").slice(0, 100).replace(/\n/g, " ");
        console.log(`  ${marker} ${r.id}: ${summary}`);
      }
      const okCount = result.results.filter((r) => r.result.ok).length;
      if (okCount === 0) throw new Error("all workers failed");
    })
  ) pass += 1;

  total += 1;
  if (
    await step("mineSkillSuggestions: synthetic checkpoint pipeline", async () => {
      const ROOT = path.resolve(__dirname, "..");
      const CP = path.join(ROOT, "data", "checkpoints");
      const SG = path.join(ROOT, "data", "skill-suggestions");
      fs.mkdirSync(CP, { recursive: true });
      fs.mkdirSync(SG, { recursive: true });

      // Seed 5 synthetic completed checkpoints with a recurring tool sequence.
      const fixtureIds: string[] = [];
      const prompts = [
        "convert this csv export to a parquet file please",
        "transform csv into parquet using pyarrow",
        "convert csv data to parquet for analysis pipeline",
        "render this csv input to a parquet artifact",
        "csv to parquet conversion for the data lake",
      ];
      for (let i = 0; i < prompts.length; i += 1) {
        const id = `smoke-${SESSION_ID}-${i}`;
        fixtureIds.push(id);
        const cp = {
          runId: id,
          sessionId: id,
          prompt: prompts[i],
          history: [],
          partialAnswer: "",
          toolEvents: ["search_web", "run_python", "write_sandbox_file", "run_python"].map((name) => ({
            name,
            durationMs: 100,
            isError: false,
          })),
          runCtx: {
            complexity: "complex",
            toolCallCount: 4,
            searchCallCount: 1,
            browseCallCount: 0,
            costScore: 9,
            costCeiling: 50,
            budgetMaxToolCalls: 30,
          },
          startedAt: 1_700_000_000_000,
          updatedAt: 1_700_000_001_000,
          completedAt: 1_700_000_001_000,
          status: "completed",
        };
        fs.writeFileSync(path.join(CP, `${id}.json`), JSON.stringify(cp), "utf8");
      }

      const summary = mineSkillSuggestions();
      console.log(`  scanned: ${summary.scannedRuns}`);
      console.log(`  qualifying: ${summary.qualifyingRuns}`);
      console.log(`  clusters: ${summary.clustersFound}`);
      console.log(`  new suggestions: ${summary.newSuggestions}`);

      // Cleanup fixtures so we don't pollute persistent state.
      for (const id of fixtureIds) {
        try { fs.unlinkSync(path.join(CP, `${id}.json`)); } catch {}
      }

      if (summary.clustersFound < 1) throw new Error("no cluster formed for clearly recurring fixtures");
      if (summary.newSuggestions < 1) {
        console.warn("  (no NEW suggestion this run — likely already cached from a prior smoke test, OK)");
      }
    })
  ) pass += 1;

  console.log(`\n${"═".repeat(70)}`);
  console.log(`SMOKE TEST RESULT: ${pass}/${total} passed`);
  console.log(`${"═".repeat(70)}`);

  // Tear down the smoke session's sandbox so we don't leak it.
  try {
    await closeSandboxForSession(SESSION_ID);
  } catch {}

  process.exit(pass === total ? 0 : 1);
}

main().catch((err) => {
  console.error("smoke harness crashed:", err);
  process.exit(1);
});
