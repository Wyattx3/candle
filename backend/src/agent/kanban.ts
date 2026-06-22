/**
 * Persistent Kanban work queue — in-process multi-agent dispatcher.
 *
 * Ported from Hermes Agent's Kanban board (`plugins/kanban`, `kanban_db.py`)
 * and adapted to Candle's architecture. Hermes spawns SUBPROCESS workers backed
 * by SQLite; Candle has no subprocess model, so workers run IN-PROCESS via the
 * same registered-runner callback pattern as `cron.ts` (`registerCronRunner`).
 *
 * What this gives the agent that ephemeral `spawn_subagent` does not:
 *  - DURABILITY: the board survives process restarts (JSON on disk, atomic
 *    write-then-rename like cron_state.json). A task half-done when the process
 *    died is recovered to `ready` at boot, not lost.
 *  - DEPENDENCIES: tasks form a DAG (`dependsOn`). A task only becomes `ready`
 *    once every prerequisite is `done`; its prerequisites' results are handed
 *    into its worker prompt (context handoff, like Hermes' build_worker_context).
 *  - CONCURRENCY CONTROL: a dispatcher promotes ready tasks and runs up to
 *    `maxConcurrent` workers at once, claiming each atomically.
 *  - RESILIENCE: a failing task retries up to `maxRetries`, then trips a
 *    circuit-breaker to `blocked` (needs manual `kanban_unblock`) instead of
 *    looping forever.
 *
 * State machine:
 *   pending  --(all deps done)-->          ready
 *   ready    --(dispatcher claims slot)-->  running
 *   running  --(worker ok)-->               done      -> recompute children
 *   running  --(worker fail, retries left)->ready
 *   running  --(worker fail, exhausted)-->  blocked
 *   running  --(process restart)-->         ready     (boot recovery)
 *   blocked  --(kanban_unblock)-->          ready / pending
 *   any non-terminal --(kanban_cancel)-->   cancelled
 */

import * as fs from "fs";
import * as path from "path";

const BOARD_FILE_PATH = path.join(process.cwd(), "data", "kanban_board.json");

export type KanbanStatus =
  | "pending"
  | "ready"
  | "running"
  | "blocked"
  | "done"
  | "cancelled";

const TERMINAL: KanbanStatus[] = ["done", "cancelled"];

export interface KanbanTask {
  id: string;
  title: string;
  /** The self-contained prompt the worker agent runs. */
  task: string;
  status: KanbanStatus;
  /** Task ids that must be `done` before this becomes `ready`. */
  dependsOn: string[];
  /** Higher runs first among ready tasks. */
  priority: number;
  /** Worker's final answer (truncated) once done. */
  result?: string;
  /** Last failure message, if any. */
  error?: string;
  consecutiveFailures: number;
  maxRetries: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

/** Runs one task's prompt to completion and resolves with the final answer. */
export type KanbanWorkerRunner = (task: string) => Promise<string>;

let registeredRunner: KanbanWorkerRunner | undefined;

/**
 * Wire the in-process worker runner. Called once from `agent/index.ts` after
 * `runAgentStream` is defined (mirrors `registerCronRunner`).
 */
export function registerKanbanWorkerRunner(runner: KanbanWorkerRunner): void {
  registeredRunner = runner;
}

function num(envName: string, def: number, min: number, max: number): number {
  const parsed = Number(process.env[envName]);
  if (!Number.isFinite(parsed)) return def;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function maxConcurrent(): number { return num("KANBAN_MAX_CONCURRENT", 2, 1, 8); }
function dispatchIntervalMs(): number { return num("KANBAN_DISPATCH_INTERVAL_MS", 4000, 1000, 60_000) ; }
function defaultMaxRetries(): number { return num("KANBAN_MAX_RETRIES", 2, 0, 10); }
/** Worker result text kept on the card / handed to dependents. */
const MAX_RESULT_CHARS = 4000;

export class KanbanBoard {
  private tasks: KanbanTask[] = [];
  private timer: NodeJS.Timeout | null = null;
  /** True while a dispatch tick is mid-flight, so ticks never overlap. */
  private ticking = false;

  constructor() {
    this.load();
  }

  // ── Persistence ─────────────────────────────────────────────────────────

  private ensureFile(): void {
    const dir = path.dirname(BOARD_FILE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(BOARD_FILE_PATH)) fs.writeFileSync(BOARD_FILE_PATH, JSON.stringify([]));
  }

  private load(): void {
    this.ensureFile();
    try {
      const parsed = JSON.parse(fs.readFileSync(BOARD_FILE_PATH, "utf-8"));
      this.tasks = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.tasks = [];
      return;
    }
    // Boot recovery: a task left `running` means the previous process died
    // mid-work. Reset it to `ready` so the dispatcher re-runs it (the partial
    // attempt counts as a failure so the circuit-breaker still applies).
    let recovered = 0;
    for (const t of this.tasks) {
      if (t.status === "running") {
        t.status = "ready";
        t.consecutiveFailures += 1;
        t.error = "Process restarted while this task was running.";
        delete t.startedAt;
        recovered += 1;
      }
    }
    if (recovered > 0) {
      console.log(`[kanban] Recovered ${recovered} interrupted task(s) → ready after restart.`);
      this.save();
    }
    const active = this.tasks.filter((t) => !TERMINAL.includes(t.status)).length;
    if (active > 0) console.log(`[kanban] Loaded board with ${active} active task(s).`);
  }

  private save(): void {
    this.ensureFile();
    const tmp = `${BOARD_FILE_PATH}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(this.tasks, null, 2), "utf-8");
      fs.renameSync(tmp, BOARD_FILE_PATH);
    } catch (err: any) {
      console.warn(`[kanban] save failed: ${err?.message ?? err}`);
    }
  }

  // ── Public API (tool-facing) ──────────────────────────────────────────────

  /**
   * Add a task. `dependsOn` ids must already exist; a dependency cycle is
   * rejected. Returns the created task. Kicks a dispatch tick so independent
   * tasks start promptly.
   */
  public addTask(input: {
    title: string;
    task: string;
    dependsOn?: string[];
    priority?: number;
    maxRetries?: number;
  }): KanbanTask {
    const title = (input.title || "").trim();
    const task = (input.task || "").trim();
    if (!title) throw new Error("Kanban task title must not be empty.");
    if (task.length < 10) throw new Error("Kanban task description must be self-contained (≥10 chars). The worker has no chat history.");

    const dependsOn = Array.from(new Set((input.dependsOn ?? []).map((d) => d.trim()).filter(Boolean)));
    for (const dep of dependsOn) {
      if (!this.tasks.some((t) => t.id === dep)) {
        throw new Error(`Dependency "${dep}" does not exist. Add prerequisite tasks first.`);
      }
    }

    const id = `k_${Math.random().toString(36).slice(2, 10)}`;
    // Cycle check: a new task only points at EXISTING tasks, so it cannot close
    // a cycle on its own — but guard anyway in case deps form one transitively.
    if (this.wouldCycle(id, dependsOn)) {
      throw new Error("Refusing to add task — dependencies would form a cycle.");
    }

    const newTask: KanbanTask = {
      id,
      title,
      task,
      status: dependsOn.length === 0 ? "ready" : "pending",
      dependsOn,
      priority: Number.isFinite(input.priority) ? Math.floor(input.priority!) : 0,
      consecutiveFailures: 0,
      maxRetries: Number.isFinite(input.maxRetries)
        ? Math.max(0, Math.min(10, Math.floor(input.maxRetries!)))
        : defaultMaxRetries(),
      createdAt: new Date().toISOString(),
    };
    this.tasks.push(newTask);
    this.recomputeReady();
    this.save();
    this.kick();
    return newTask;
  }

  public listTasks(): KanbanTask[] {
    return this.tasks;
  }

  public getTask(id: string): KanbanTask | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  /** Cancel a non-terminal task. Returns false if not found / already terminal. */
  public cancelTask(id: string): boolean {
    const t = this.getTask(id);
    if (!t || TERMINAL.includes(t.status)) return false;
    t.status = "cancelled";
    t.completedAt = new Date().toISOString();
    this.save();
    return true;
  }

  /** Move a blocked task back into the queue. Returns false if not blocked. */
  public unblockTask(id: string): boolean {
    const t = this.getTask(id);
    if (!t || t.status !== "blocked") return false;
    t.consecutiveFailures = 0;
    delete t.error;
    t.status = t.dependsOn.length === 0 ? "ready" : "pending";
    this.recomputeReady();
    this.save();
    this.kick();
    return true;
  }

  /** Number of non-terminal tasks — for health checks / tests. */
  public activeCount(): number {
    return this.tasks.filter((t) => !TERMINAL.includes(t.status)).length;
  }

  // ── Dispatcher ──────────────────────────────────────────────────────────

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), dispatchIntervalMs());
    if (typeof this.timer.unref === "function") this.timer.unref();
    // Run one tick now so a board restored at boot starts working immediately.
    this.kick();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Fire a tick on the next macrotask without waiting for the interval. */
  private kick(): void {
    // Only dispatch when the board is actually running. Before start() (and
    // after stop()) the board is dormant — addTask/unblock just update state.
    if (!registeredRunner || !this.timer) return;
    setTimeout(() => void this.tick(), 0);
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    if (!registeredRunner) return;
    this.ticking = true;
    try {
      this.recomputeReady();

      const running = this.tasks.filter((t) => t.status === "running").length;
      let slots = maxConcurrent() - running;
      if (slots <= 0) return;

      const ready = this.tasks
        .filter((t) => t.status === "ready")
        .sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));

      for (const t of ready) {
        if (slots <= 0) break;
        slots -= 1;
        // Claim synchronously (before any await) so the next tick can't double-claim.
        t.status = "running";
        t.startedAt = new Date().toISOString();
        this.save();
        void this.runWorker(t.id);
      }
    } finally {
      this.ticking = false;
    }
  }

  private async runWorker(id: string): Promise<void> {
    const t = this.getTask(id);
    if (!t || t.status !== "running" || !registeredRunner) return;

    console.log(`[kanban] ▶ running task ${t.id}: ${t.title.slice(0, 80)}`);
    const prompt = this.buildWorkerPrompt(t);
    try {
      const result = await registeredRunner(prompt);
      // The task may have been cancelled while the worker ran — respect that.
      const cur = this.getTask(id);
      if (!cur || cur.status !== "running") return;
      cur.status = "done";
      cur.result = String(result ?? "").slice(0, MAX_RESULT_CHARS);
      cur.completedAt = new Date().toISOString();
      cur.consecutiveFailures = 0;
      delete cur.error;
      console.log(`[kanban] ✓ done task ${cur.id}`);
    } catch (err: any) {
      const cur = this.getTask(id);
      if (!cur || cur.status !== "running") return;
      cur.consecutiveFailures += 1;
      cur.error = String(err?.message ?? err).slice(0, 500);
      delete cur.startedAt;
      if (cur.consecutiveFailures > cur.maxRetries) {
        cur.status = "blocked";
        console.warn(`[kanban] ✗ task ${cur.id} blocked after ${cur.consecutiveFailures} failure(s): ${cur.error}`);
      } else {
        cur.status = cur.dependsOn.length === 0 ? "ready" : "pending";
        console.warn(`[kanban] ↻ task ${cur.id} failed (attempt ${cur.consecutiveFailures}/${cur.maxRetries + 1}), will retry.`);
      }
    } finally {
      this.recomputeReady();
      this.save();
      this.kick();
    }
  }

  /** Prepend completed-prerequisite results so the worker has its inputs. */
  private buildWorkerPrompt(t: KanbanTask): string {
    if (t.dependsOn.length === 0) return t.task;
    const ctx = t.dependsOn
      .map((dep) => this.getTask(dep))
      .filter((d): d is KanbanTask => Boolean(d) && d!.status === "done" && Boolean(d!.result))
      .map((d) => `### ${d.title}\n${d.result}`)
      .join("\n\n");
    if (!ctx) return t.task;
    return (
      `--- Context from completed prerequisite tasks ---\n${ctx}\n--- End context ---\n\n` +
      t.task
    );
  }

  // ── Dependency resolution ─────────────────────────────────────────────────

  /** Promote `pending` tasks whose every dependency is `done`. */
  private recomputeReady(): void {
    for (const t of this.tasks) {
      if (t.status !== "pending") continue;
      const deps = t.dependsOn.map((d) => this.getTask(d));
      // A cancelled/blocked/missing prerequisite can never satisfy this task —
      // surface it as blocked rather than leaving it pending forever.
      if (deps.some((d) => !d || d.status === "cancelled")) {
        t.status = "blocked";
        t.error = "A prerequisite was cancelled or removed.";
        continue;
      }
      if (deps.every((d) => d!.status === "done")) {
        t.status = "ready";
      }
    }
  }

  private wouldCycle(newId: string, dependsOn: string[]): boolean {
    // DFS for a back edge in the dependency graph, treating the new task's
    // `dependsOn` as live edges. A cycle anywhere in the reachable subgraph
    // means this task's prerequisites can never resolve, so reject it.
    const onPath = new Set<string>();
    const done = new Set<string>();
    const depsOf = (id: string): string[] =>
      id === newId ? dependsOn : (this.getTask(id)?.dependsOn ?? []);
    const visit = (id: string): boolean => {
      if (onPath.has(id)) return true;
      if (done.has(id)) return false;
      onPath.add(id);
      for (const dep of depsOf(id)) {
        if (visit(dep)) return true;
      }
      onPath.delete(id);
      done.add(id);
      return false;
    };
    return visit(newId);
  }
}

export const kanbanBoard = new KanbanBoard();
