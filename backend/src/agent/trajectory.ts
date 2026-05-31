/**
 * TrajectoryLogger — captures per-step performance and decision data so we
 * can diagnose runaway loops, slow tools, or budget overruns after the fact.
 *
 * Two modes:
 *  - In-memory only (default): keeps the steps on the instance, callers can
 *    pull `getSummary()` for a live debug view.
 *  - On-disk: enabled by setting `CANDLE_TRAJECTORY_DIR=/path/to/dir`. Each
 *    run flushes to `<dir>/trajectory-<sessionId>.json` on completion.
 *
 * Logging is best-effort — failures here MUST never break a run, so write
 * errors are swallowed with a warning.
 */

import * as fs from "fs";
import * as path from "path";

export interface TrajectoryStep {
  stepIndex: number;
  node: string;
  durationMs: number;
  detail?: Record<string, unknown>;
  toolCalls?: { name: string; args?: any }[];
  llmTokens?: { input?: number; output?: number };
  error?: string;
}

export interface TrajectorySummary {
  sessionId: string;
  startedAt: number;
  endedAt: number;
  totalDurationMs: number;
  totalSteps: number;
  steps: TrajectoryStep[];
}


const TRAJECTORY_DIR = process.env.CANDLE_TRAJECTORY_DIR?.trim();
const TRAJECTORY_ENABLED = Boolean(TRAJECTORY_DIR);

if (TRAJECTORY_ENABLED) {
  try {
    fs.mkdirSync(TRAJECTORY_DIR!, { recursive: true });
    console.log(`[trajectory] persistent logs enabled at ${TRAJECTORY_DIR}`);
  } catch (err: any) {
    console.warn(`[trajectory] failed to create log dir: ${err?.message ?? err}`);
  }
}

export class TrajectoryLogger {
  readonly sessionId: string;
  private readonly steps: TrajectoryStep[] = [];
  private readonly startedAt = Date.now();
  private lastTickAt = Date.now();

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  logStep(step: Omit<TrajectoryStep, "stepIndex" | "durationMs">): void {
    const now = Date.now();
    this.steps.push({
      stepIndex: this.steps.length,
      durationMs: now - this.lastTickAt,
      ...step,
    });
    this.lastTickAt = now;
  }

  getSummary(): TrajectorySummary {
    const endedAt = Date.now();
    return {
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      endedAt,
      totalDurationMs: endedAt - this.startedAt,
      totalSteps: this.steps.length,
      steps: this.steps.slice(),
    };
  }

  flushToDisk(): void {
    if (!TRAJECTORY_ENABLED || !TRAJECTORY_DIR) return;
    try {
      const file = path.join(TRAJECTORY_DIR, `trajectory-${this.sessionId}.json`);
      fs.writeFileSync(file, JSON.stringify(this.getSummary(), null, 2), "utf8");
    } catch (err: any) {
      console.warn(`[trajectory] flush failed for ${this.sessionId}: ${err?.message ?? err}`);
    }
  }
}
