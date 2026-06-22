import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { CronManager } from "./cron";

const CRON_FILE = path.join(process.cwd(), "data", "cron_state.json");

describe("cron — context chaining", () => {
  let backup: string | null = null;
  let manager: CronManager;

  beforeEach(() => {
    backup = fs.existsSync(CRON_FILE) ? fs.readFileSync(CRON_FILE, "utf-8") : null;
    fs.mkdirSync(path.dirname(CRON_FILE), { recursive: true });
    fs.writeFileSync(CRON_FILE, "[]");
    manager = new CronManager();
  });

  afterEach(() => {
    manager.stopAll();
    if (backup !== null) fs.writeFileSync(CRON_FILE, backup);
    else if (fs.existsSync(CRON_FILE)) fs.unlinkSync(CRON_FILE);
  });

  it("prepends the upstream job's latest output to a chained job's task", () => {
    const upstream = manager.addJob("fetch the data", 60);
    const chained = manager.addJob("summarize the data", 60, upstream.id);
    // Simulate the upstream having run once.
    manager.listJobs().find((j) => j.id === upstream.id)!.lastResult = "RAW NUMBERS: 1 2 3";

    const resolved = (manager as any).resolveTaskWithContext(chained);
    expect(resolved).toContain("RAW NUMBERS: 1 2 3");
    expect(resolved).toContain("summarize the data");
    expect(resolved.indexOf("RAW NUMBERS")).toBeLessThan(resolved.indexOf("summarize the data"));
  });

  it("returns the bare task when the upstream has not produced output yet", () => {
    const upstream = manager.addJob("fetch the data", 60);
    const chained = manager.addJob("summarize the data", 60, upstream.id);

    const resolved = (manager as any).resolveTaskWithContext(chained);
    expect(resolved).toBe("summarize the data");
  });

  it("returns the bare task for a non-chained job", () => {
    const job = manager.addJob("standalone task", 60);
    const resolved = (manager as any).resolveTaskWithContext(job);
    expect(resolved).toBe("standalone task");
  });

  it("rejects chaining to a non-existent upstream job", () => {
    expect(() => manager.addJob("chained", 60, "does-not-exist")).toThrow(/not found/);
  });

  it("persists contextFromJobId across reload", () => {
    const upstream = manager.addJob("u", 60);
    manager.addJob("c", 60, upstream.id);
    manager.stopAll();

    const reloaded = new CronManager();
    const chained = reloaded.listJobs().find((j) => j.task === "c");
    expect(chained?.contextFromJobId).toBe(upstream.id);
    reloaded.stopAll();
  });
});
