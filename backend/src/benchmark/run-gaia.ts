/**
 * GAIA benchmark runner.
 *
 * For each task: build a prompt (question + attached-file hint), run the full
 * Candle agent headless via `runAgentStream` with benchmarkMode="gaia", pull
 * the `FINAL ANSWER:` line out of the reply, score it with the official GAIA
 * scorer, and log a result row. Writes a per-run JSONL + a summary.json so
 * each iteration is directly comparable.
 *
 * Usage:
 *   ts-node src/benchmark/run-gaia.ts [--split validation] [--level 1]
 *      [--limit 10] [--ids id1,id2] [--concurrency 2]
 *
 * Costs real LLM / sandbox / search tokens — start small with --level 1 --limit.
 */
import "../agent/llm"; // forces .env loading via dotenv (side-effect import)
import * as fs from "fs";
import * as path from "path";

import { runAgentStream, ArtifactRegistry } from "../agent";
import { withSessionContext } from "../agent/session";
import { closeSandboxForSession, getSandboxForSession } from "../tools";

// Where staged GAIA attachments live INSIDE the Linux sandbox.
const SANDBOX_FILES_DIR = "/home/user/gaia_files";
import { questionScorer, extractFinalAnswer } from "./scorer";
import { loadGaiaTasks, GaiaTask, gaiaDataDir } from "./gaia-types";
import { classifyFailure } from "./failure-class";

interface ResultRow {
  taskId: string;
  level: number;
  question: string;
  groundTruth: string;
  modelAnswer: string;
  rawReplyTail: string;
  correct: boolean;
  hadAttachment: boolean;
  error?: string;
  durationMs: number;
  toolCallCount: number;
  /** Triage bucket for failures: pass | timeout_0_tools | timeout | precision | depth | empty | error. */
  failureClass: string;
}

function parseArgs() {
  const a = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = a.indexOf(flag);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const has = (flag: string): boolean => a.includes(flag);
  const stopOnFail = has("--stop-on-fail");
  return {
    split: get("--split") ?? "validation",
    level: get("--level") != null ? Number(get("--level")) : undefined,
    limit: get("--limit") != null ? Number(get("--limit")) : undefined,
    ids: get("--ids")?.split(",").map((s) => s.trim()).filter(Boolean),
    concurrency: get("--concurrency") != null ? Number(get("--concurrency")) : Number(process.env.BENCH_CONCURRENCY ?? 1),
    compare: get("--compare"),
    stopOnFail,
    // Auto-retry INFRASTRUCTURE artifacts (back-to-back throttle timeouts/empties)
    // before declaring a real failure. Quality fails (precision/depth) are NOT
    // retried — they need a code fix, not another roll of the dice. Defaults to 1
    // when stop-on-fail is set (so throttle artifacts never false-stop the loop).
    retries: get("--retries") != null ? Number(get("--retries")) : stopOnFail ? 1 : 0,
    // Accumulating progress file: skip tasks already passed in it and append new
    // rows to the SAME file, so `fix → re-run same command` resumes where it stopped.
    resume: get("--resume"),
    // Inter-task cooldown (ms) to let the Cloudflare rate window recover between
    // tasks and avoid the back-to-back throttle artifact. Defaults to 8000 when
    // running serially (concurrency 1 / stop-on-fail); 0 disables it.
    cooldownMs: get("--cooldown") != null ? Number(get("--cooldown")) : 8000,
    // Retry ANY failure (not just infra ones) up to `retries` times. Used to
    // measure the TRUE pass rate: throttle degradation in a full sequential run
    // produces plausible-but-wrong answers that misclassify as depth/precision,
    // so confirming the real rate means re-running every failure alone.
    retryAll: has("--retry-all"),
  };
}

/** Infra/throttle failures worth a fresh retry vs. deterministic quality fails. */
function isInfraFail(failureClass: string): boolean {
  return failureClass === "timeout_0_tools" || failureClass === "timeout" || failureClass === "empty" || failureClass === "error";
}

/**
 * Run a task, re-running it alone up to `retries` times if it fails. By default
 * only INFRA-class failures (throttle timeout / empty / transient error) are
 * retried. With `retryAll`, ANY failure is retried — used to confirm the true
 * pass rate, because throttle degradation in a full sequential run can produce
 * plausible-but-WRONG answers that classify as depth/precision, not just empty
 * timeouts. Confirmed in benchmark memory: back-to-back calls throttle the
 * provider's time-to-first-token, so a task that fails in the full run often
 * passes when re-run alone. The retry runs after the inter-task cooldown, so it
 * is effectively an isolated re-run.
 */
async function runWithRetry(task: GaiaTask, retries: number, retryAll = false): Promise<ResultRow> {
  let r = await runOne(task);
  let attempt = 0;
  while (!r.correct && attempt < retries && (retryAll || isInfraFail(r.failureClass))) {
    attempt += 1;
    console.log(`    ↻ retry ${attempt}/${retries} for ${task.taskId.slice(0, 8)} (prev class=${r.failureClass})`);
    r = await runOne(task);
  }
  return r;
}

function buildTaskPrompt(task: GaiaTask, sandboxPath: string | null): string {
  let p = task.question;
  if (sandboxPath) {
    p +=
      `\n\n[An attached file is provided for this question, already placed INSIDE your sandbox at: ${sandboxPath}\n` +
      `Use your sandbox file/code tools (read_sandbox_file, run_python, etc.) to open and inspect it. Do NOT claim you cannot access it.]`;
  }
  return p;
}

/**
 * Upload the task's attachment into the live sandbox so the agent's Linux-side
 * file tools can actually read it. Returns the sandbox path, or null when the
 * question has no attachment (or staging failed).
 */
async function stageAttachment(sessionId: string, task: GaiaTask): Promise<string | null> {
  if (!task.fileName || !task.localFilePath || !fs.existsSync(task.localFilePath)) return null;
  const sandboxPath = `${SANDBOX_FILES_DIR}/${task.fileName}`;
  try {
    const sandbox = await getSandboxForSession(sessionId);
    const data = Uint8Array.from(fs.readFileSync(task.localFilePath));
    await sandbox.commands.run(`mkdir -p ${SANDBOX_FILES_DIR}`, { timeoutMs: 30_000, requestTimeoutMs: 30_000 });
    await sandbox.files.write(sandboxPath, data, { requestTimeoutMs: 120_000 });
    return sandboxPath;
  } catch (e: any) {
    console.warn(`  ! failed to stage attachment ${task.fileName}: ${e?.message ?? e}`);
    return null;
  }
}

async function runOne(task: GaiaTask): Promise<ResultRow> {
  const t0 = Date.now();
  const sessionId = `gaia-${task.taskId.slice(0, 8)}-${Date.now()}`;
  let toolCallCount = 0;
  let rawReply = "";
  let error: string | undefined;

  try {
    rawReply = await withSessionContext({ sessionId }, async () => {
      const registry = new ArtifactRegistry();
      const sandboxPath = await stageAttachment(sessionId, task);
      return runAgentStream(
        buildTaskPrompt(task, sandboxPath),
        () => {}, // headless: swallow all stream events
        {
          artifactRegistry: registry,
          benchmarkMode: "gaia",
          onRunComplete: (info) => {
            toolCallCount = info.toolCallCount;
          },
        }
      );
    });
  } catch (err: any) {
    error = err?.message ?? String(err);
  } finally {
    try {
      await closeSandboxForSession(sessionId);
    } catch {
      /* ignore teardown errors */
    }
  }

  const modelAnswer = extractFinalAnswer(rawReply);
  const correct = error ? false : questionScorer(modelAnswer, task.answer ?? "");

  const durationMs = Date.now() - t0;
  const failureClass = classifyFailure({ correct, error, modelAnswer, toolCallCount, durationMs });

  return {
    taskId: task.taskId,
    level: task.level,
    question: task.question.slice(0, 200),
    groundTruth: task.answer,
    modelAnswer,
    rawReplyTail: rawReply.slice(-400),
    correct,
    hadAttachment: Boolean(task.fileName),
    error,
    durationMs,
    toolCallCount,
    failureClass,
  };
}

// Small helper so scorer never sees undefined.

async function runPool(
  tasks: GaiaTask[],
  concurrency: number,
  onResult: (r: ResultRow) => void,
  opts: { retries: number; stopOnFail: boolean; cooldownMs: number; retryAll: boolean } = { retries: 0, stopOnFail: false, cooldownMs: 0, retryAll: false },
) {
  let next = 0;
  let stopped = false;
  async function worker() {
    while (next < tasks.length && !stopped) {
      const idx = next;
      next += 1;
      // Inter-task cooldown: sleep BEFORE every task except the very first. The
      // confirmed throttle artifact (0-tool/~287s timeouts in a full sequential
      // run that VANISH when the task is re-run alone) is caused by sustained
      // back-to-back calls to the Cloudflare endpoint throttling time-to-first-
      // token past the per-call timeout. A short pause lets that rate window
      // recover so the next task's first generation isn't aborted. Benchmark-
      // measurement only — production is one prompt per run, so it never throttles.
      if (idx > 0 && opts.cooldownMs > 0) {
        await new Promise((res) => setTimeout(res, opts.cooldownMs));
      }
      const r = await runWithRetry(tasks[idx], opts.retries, opts.retryAll);
      onResult(r);
      // Stop-on-fail: halt the whole loop the moment a REAL (non-infra) failure
      // survives its retries. This is the user's "stop at the failing task, fix
      // it, then resume" workflow — re-running the same `--resume` command after
      // a code fix picks up from exactly here.
      if (opts.stopOnFail && !r.correct && !isInfraFail(r.failureClass)) {
        stopped = true;
      }
    }
  }
  // stop-on-fail only makes sense serially; force concurrency=1 so we don't
  // launch a dozen tasks past the one we want to stop on.
  const lanes = opts.stopOnFail ? 1 : Math.max(1, concurrency);
  const workers = Array.from({ length: lanes }, () => worker());
  await Promise.all(workers);
  return { stopped };
}

async function main() {
  const args = parseArgs();
  const maxQ = process.env.BENCH_MAX_QUESTIONS ? Number(process.env.BENCH_MAX_QUESTIONS) : undefined;

  let tasks = loadGaiaTasks(args.split, { level: args.level, limit: args.limit, ids: args.ids });
  if (maxQ != null && tasks.length > maxQ) tasks = tasks.slice(0, maxQ);

  // Patch the ground-truth accessor onto each task instance.
  for (const t of tasks) {
    (t as any).groundTruthOrEmpty = function (this: GaiaTask) {
      return this.answer ?? "";
    };
  }

  const resultsDir = path.join(gaiaDataDir(), "..", "results");
  fs.mkdirSync(resultsDir, { recursive: true });

  // --resume: read an existing progress file, skip every task that ALREADY
  // PASSED in it, and append new rows to that SAME file. Re-running the exact
  // command after a code fix therefore continues from where it stopped instead
  // of re-grinding the whole level. Failed tasks are retried (they're why we
  // stopped); passed tasks are trusted.
  const priorResults: ResultRow[] = [];
  const alreadyPassed = new Set<string>();
  if (args.resume) {
    const resumePath = path.isAbsolute(args.resume) ? args.resume : path.join(resultsDir, args.resume);
    if (fs.existsSync(resumePath)) {
      for (const line of fs.readFileSync(resumePath, "utf8").split("\n").filter((l) => l.trim())) {
        try {
          const row = JSON.parse(line) as ResultRow;
          if (row.correct) {
            alreadyPassed.add(row.taskId);
            priorResults.push(row);
          }
        } catch {
          /* skip malformed line */
        }
      }
      console.log(`[gaia:run] resume from ${path.basename(resumePath)}: ${alreadyPassed.size} task(s) already passed, skipping them`);
    } else {
      console.log(`[gaia:run] resume file ${path.basename(resumePath)} not found — starting fresh into it`);
    }
  }
  tasks = tasks.filter((t) => !alreadyPassed.has(t.taskId));

  console.log(`[gaia:run] split=${args.split} level=${args.level ?? "all"} tasks=${tasks.length} concurrency=${args.concurrency} stopOnFail=${args.stopOnFail} retries=${args.retries}`);
  if (tasks.length === 0) {
    if (alreadyPassed.size > 0) {
      console.log(`[gaia:run] all tasks already passed in the resume file — nothing left to run.`);
      process.exit(0);
    }
    console.error("[gaia:run] no tasks matched. Did you run bench:download?");
    process.exit(1);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  // When resuming, keep writing into the SAME jsonl; otherwise start a new one.
  const jsonlPath = args.resume
    ? (path.isAbsolute(args.resume) ? args.resume : path.join(resultsDir, args.resume))
    : path.join(resultsDir, `gaia-${stamp}.jsonl`);
  const summaryPath = jsonlPath.replace(/\.jsonl$/, "") + ".summary.json";

  const results: ResultRow[] = [...priorResults];
  const jsonlStream = fs.createWriteStream(jsonlPath, { flags: "a" });

  const { stopped } = await runPool(
    tasks,
    args.concurrency,
    (r) => {
      results.push(r);
      jsonlStream.write(JSON.stringify(r) + "\n");
      const mark = r.correct ? "✓" : "✗";
      const detail = r.error ? `ERROR: ${r.error.slice(0, 80)}` : `ans="${r.modelAnswer.slice(0, 50)}" gt="${r.groundTruth.slice(0, 50)}"`;
      console.log(`  ${mark} [L${r.level}] ${r.taskId.slice(0, 8)} (${(r.durationMs / 1000).toFixed(1)}s, ${r.toolCallCount} tools) ${detail}`);
    },
    { retries: args.retries, stopOnFail: args.stopOnFail, cooldownMs: args.cooldownMs, retryAll: args.retryAll },
  );
  jsonlStream.end();

  if (stopped) {
    const lastFail = results[results.length - 1];
    console.log(`\n${"!".repeat(60)}`);
    console.log(`STOP-ON-FAIL: halted at real failure ${lastFail.taskId.slice(0, 8)} [${lastFail.failureClass}]`);
    console.log(`  Q: ${lastFail.question}`);
    console.log(`  got: "${lastFail.modelAnswer.slice(0, 120)}"`);
    console.log(`  want: "${lastFail.groundTruth.slice(0, 120)}"`);
    console.log(`  Fix the harness, then re-run the SAME command to resume from here:`);
    console.log(`    npm run bench:gaia -- --level ${args.level ?? 1} --stop-on-fail --resume ${path.basename(jsonlPath)}`);
    console.log(`${"!".repeat(60)}`);
  }

  const pass = results.filter((r) => r.correct).length;
  const byLevel: Record<string, { pass: number; total: number }> = {};
  for (const r of results) {
    const k = `L${r.level}`;
    byLevel[k] = byLevel[k] ?? { pass: 0, total: 0 };
    byLevel[k].total += 1;
    if (r.correct) byLevel[k].pass += 1;
  }

  const summary = {
    timestamp: stamp,
    split: args.split,
    level: args.level ?? "all",
    model: process.env.MODEL_NAME ?? "(default)",
    pass,
    total: results.length,
    passRate: results.length ? pass / results.length : 0,
    byLevel,
    errors: results.filter((r) => r.error).length,
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  // Failure-class breakdown — separates infra failures (timeouts/empty) from
  // quality failures (precision/depth) so each iteration can target the right fix.
  const byClass: Record<string, number> = {};
  for (const r of results) {
    byClass[r.failureClass] = (byClass[r.failureClass] ?? 0) + 1;
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`GAIA RESULT: ${pass}/${results.length} (${(summary.passRate * 100).toFixed(1)}%)`);
  for (const [lvl, v] of Object.entries(byLevel)) {
    console.log(`  ${lvl}: ${v.pass}/${v.total}`);
  }
  console.log(`  errors: ${summary.errors}`);
  console.log(`  failure classes:`);
  for (const [cls, n] of Object.entries(byClass).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cls}: ${n}`);
  }
  console.log(`  results: ${jsonlPath}`);
  console.log(`${"═".repeat(60)}`);

  // Optional baseline diff. `--compare <prior.jsonl>` prints which task ids
  // FLIPPED so we can prove a change is a net improvement (and catch regressions).
  if (args.compare) {
    try {
      const baseLines = fs.readFileSync(args.compare, "utf8").split("\n").filter((l) => l.trim());
      const basePrev = new Map<string, boolean>();
      for (const line of baseLines) {
        const row = JSON.parse(line) as { taskId: string; correct: boolean };
        basePrev.set(row.taskId, row.correct);
      }
      const fixes: string[] = [];
      const regressions: string[] = [];
      for (const r of results) {
        if (!basePrev.has(r.taskId)) continue;
        const was = basePrev.get(r.taskId)!;
        if (!was && r.correct) fixes.push(r.taskId.slice(0, 8));
        if (was && !r.correct) regressions.push(`${r.taskId.slice(0, 8)} (${r.failureClass})`);
      }
      console.log(`\nCOMPARE vs ${path.basename(args.compare)}:`);
      console.log(`  fixed (was wrong → now right): ${fixes.length}${fixes.length ? " — " + fixes.join(", ") : ""}`);
      console.log(`  regressed (was right → now wrong): ${regressions.length}${regressions.length ? " — " + regressions.join(", ") : ""}`);
      console.log(`  net delta: ${fixes.length - regressions.length >= 0 ? "+" : ""}${fixes.length - regressions.length}`);
      console.log(`${"═".repeat(60)}`);
    } catch (e: any) {
      console.warn(`[gaia:run] --compare failed to read ${args.compare}: ${e?.message ?? e}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[gaia:run] harness crashed:", err);
  process.exit(1);
});
