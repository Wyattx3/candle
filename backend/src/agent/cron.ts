/**
 * Persistent cronjob manager.
 *
 * Replaces the old HTTP-fetch dispatcher (which targeted a non-existent
 * `/tasks` route). Now triggers the agent in-process via a runtime callback
 * registered from `agent/index.ts` once `runAgentStream` is available.
 *
 * Lifecycle:
 *  - Server boot: `cronManager` is constructed eagerly and reads
 *    `data/cron_state.json`. Saved jobs are scheduled immediately.
 *  - Tool call (`cronjob` action): create / remove / list jobs.
 *  - Tick: each timer calls the registered runner with `{ task }`. If no
 *    runner is registered yet, the tick is logged and skipped.
 *
 * The runner deliberately runs each scheduled task with NO chat history so
 * the cron job is self-contained — a long-running scheduled task that
 * accumulates conversation context would drift over time.
 */

import * as fs from "fs";
import * as path from "path";

const CRON_FILE_PATH = path.join(process.cwd(), "data", "cron_state.json");

export interface CronJob {
  id: string;
  task: string;
  intervalMinutes: number;
  lastRun?: string;
  lastError?: string;
  lastResult?: string;
}

export type CronRunner = (task: string) => Promise<string>;

let registeredRunner: CronRunner | undefined;

/**
 * Wire the in-process agent runner. Called once from `agent/index.ts` after
 * `runAgentStream` is fully defined to avoid a circular import.
 */
export function registerCronRunner(runner: CronRunner): void {
  registeredRunner = runner;
}

export class CronManager {
  private jobs: CronJob[] = [];
  private timers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.loadJobs();
  }

  private ensureFile() {
    const dir = path.dirname(CRON_FILE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(CRON_FILE_PATH)) fs.writeFileSync(CRON_FILE_PATH, JSON.stringify([]));
  }

  private loadJobs() {
    this.ensureFile();
    try {
      const parsed = JSON.parse(fs.readFileSync(CRON_FILE_PATH, "utf-8"));
      this.jobs = Array.isArray(parsed) ? parsed : [];
      for (const job of this.jobs) this.schedule(job);
      if (this.jobs.length > 0) {
        console.log(`[cron] Resumed ${this.jobs.length} persisted job(s).`);
      }
    } catch {
      this.jobs = [];
    }
  }

  private saveJobs() {
    this.ensureFile();
    fs.writeFileSync(CRON_FILE_PATH, JSON.stringify(this.jobs, null, 2));
  }

  public addJob(task: string, intervalMinutes: number): CronJob {
    const trimmed = (task || "").trim();
    if (!trimmed) throw new Error("Cron task must not be empty.");
    if (intervalMinutes < 1) throw new Error("Cron interval must be at least 1 minute.");
    const newJob: CronJob = {
      id: Math.random().toString(36).substring(2, 10),
      task: trimmed,
      intervalMinutes: Math.floor(intervalMinutes),
    };
    this.jobs.push(newJob);
    this.saveJobs();
    this.schedule(newJob);
    return newJob;
  }

  public removeJob(id: string): boolean {
    const idx = this.jobs.findIndex((j) => j.id === id);
    if (idx === -1) return false;
    this.jobs.splice(idx, 1);
    this.saveJobs();
    const timer = this.timers.get(id);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(id);
    }
    return true;
  }

  public listJobs(): CronJob[] {
    return this.jobs;
  }

  /** Number of currently persisted jobs — exposed for tests / health checks. */
  public count(): number {
    return this.jobs.length;
  }

  private schedule(job: CronJob) {
    const existing = this.timers.get(job.id);
    if (existing) clearInterval(existing);
    const timer = setInterval(() => {
      void this.execute(job);
    }, job.intervalMinutes * 60 * 1000);
    // Don't keep the event loop alive for cron alone.
    if (typeof timer.unref === "function") timer.unref();
    this.timers.set(job.id, timer);
  }

  private async execute(job: CronJob) {
    if (!registeredRunner) {
      console.warn(`[cron] Skip job ${job.id} — no runner registered yet.`);
      return;
    }
    console.log(`[cron] Executing job ${job.id}: ${job.task.slice(0, 80)}`);
    try {
      const result = await registeredRunner(job.task);
      job.lastRun = new Date().toISOString();
      job.lastResult = String(result ?? "").slice(0, 1000);
      delete job.lastError;
    } catch (e: any) {
      job.lastRun = new Date().toISOString();
      job.lastError = String(e?.message ?? e).slice(0, 500);
      console.error(`[cron] Job ${job.id} failed: ${job.lastError}`);
    } finally {
      try {
        this.saveJobs();
      } catch {
        /* persist failure already logged */
      }
    }
  }

  /** Cancel every scheduled timer — used during graceful shutdown. */
  public stopAll(): void {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
  }
}

export const cronManager = new CronManager();
