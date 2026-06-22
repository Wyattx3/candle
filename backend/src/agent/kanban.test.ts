import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { KanbanBoard, KanbanTask, registerKanbanWorkerRunner } from "./kanban";

const BOARD_FILE = path.join(process.cwd(), "data", "kanban_board.json");

function fullTask(partial: Partial<KanbanTask> & { id: string }): KanbanTask {
  return {
    id: partial.id,
    title: partial.title ?? partial.id,
    task: partial.task ?? "do the thing with full context provided here",
    status: partial.status ?? "running",
    dependsOn: partial.dependsOn ?? [],
    priority: partial.priority ?? 0,
    consecutiveFailures: partial.consecutiveFailures ?? 0,
    maxRetries: partial.maxRetries ?? 2,
    createdAt: partial.createdAt ?? new Date().toISOString(),
    result: partial.result,
    error: partial.error,
  };
}

describe("kanban — board state machine", () => {
  let backup: string | null = null;
  let board: KanbanBoard;

  beforeEach(() => {
    backup = fs.existsSync(BOARD_FILE) ? fs.readFileSync(BOARD_FILE, "utf-8") : null;
    fs.mkdirSync(path.dirname(BOARD_FILE), { recursive: true });
    fs.writeFileSync(BOARD_FILE, "[]");
    board = new KanbanBoard();
  });

  afterEach(() => {
    board.stop();
    if (backup !== null) fs.writeFileSync(BOARD_FILE, backup);
    else if (fs.existsSync(BOARD_FILE)) fs.unlinkSync(BOARD_FILE);
  });

  it("a task with no dependencies starts ready", () => {
    const t = board.addTask({ title: "solo", task: "a self-contained task here" });
    expect(t.status).toBe("ready");
  });

  it("a task with dependencies starts pending", () => {
    const a = board.addTask({ title: "a", task: "first task with enough detail" });
    const b = board.addTask({ title: "b", task: "second task with enough detail", dependsOn: [a.id] });
    expect(b.status).toBe("pending");
  });

  it("rejects a dependency that does not exist", () => {
    expect(() => board.addTask({ title: "x", task: "task with enough detail here", dependsOn: ["nope"] }))
      .toThrow(/does not exist/);
  });

  it("rejects a too-short task body", () => {
    expect(() => board.addTask({ title: "x", task: "short" })).toThrow(/self-contained/);
  });

  it("promotes a pending task to ready once its dependency is done", () => {
    const a = board.addTask({ title: "a", task: "first task with enough detail" });
    const b = board.addTask({ title: "b", task: "second task with enough detail", dependsOn: [a.id] });
    expect(b.status).toBe("pending");

    // Mark the dependency done, then trigger recompute via a no-op unblock cycle.
    const dep = board.getTask(a.id)!;
    dep.status = "done";
    dep.result = "the prerequisite output";
    // recomputeReady runs inside addTask; add a throwaway to trigger it.
    board.addTask({ title: "trigger", task: "unrelated task with enough detail" });

    expect(board.getTask(b.id)!.status).toBe("ready");
  });

  it("blocks a task whose prerequisite is cancelled", () => {
    const a = board.addTask({ title: "a", task: "first task with enough detail" });
    const b = board.addTask({ title: "b", task: "second task with enough detail", dependsOn: [a.id] });
    board.cancelTask(a.id);
    // recompute via another add
    board.addTask({ title: "t", task: "another task with enough detail" });
    expect(board.getTask(b.id)!.status).toBe("blocked");
  });

  it("cancels a non-terminal task and refuses to cancel a finished one", () => {
    const t = board.addTask({ title: "x", task: "a task with enough detail here" });
    expect(board.cancelTask(t.id)).toBe(true);
    expect(board.getTask(t.id)!.status).toBe("cancelled");
    expect(board.cancelTask(t.id)).toBe(false);
  });

  it("unblocks a blocked task back into the queue", () => {
    const t = board.addTask({ title: "x", task: "a task with enough detail here" });
    board.getTask(t.id)!.status = "blocked";
    expect(board.unblockTask(t.id)).toBe(true);
    expect(board.getTask(t.id)!.status).toBe("ready");
    expect(board.getTask(t.id)!.consecutiveFailures).toBe(0);
  });

  it("rejects a dependency cycle", () => {
    const a = board.addTask({ title: "a", task: "first task with enough detail" });
    const b = board.addTask({ title: "b", task: "second task with enough detail", dependsOn: [a.id] });
    // Make a depend on b → cycle. addTask can't do this directly (b is newer),
    // so simulate by mutating then adding a task that closes the loop.
    board.getTask(a.id)!.dependsOn = [b.id];
    expect(() => board.addTask({ title: "c", task: "third task with enough detail", dependsOn: [a.id] }))
      .toThrow(/cycle/);
  });

  it("recovers an interrupted (running) task to ready on reload", () => {
    // Seed a board file with a task stuck in `running`, then load it.
    fs.writeFileSync(BOARD_FILE, JSON.stringify([fullTask({ id: "k_stuck", status: "running" })]));
    const reloaded = new KanbanBoard();
    const t = reloaded.getTask("k_stuck")!;
    expect(t.status).toBe("ready");
    expect(t.consecutiveFailures).toBe(1);
    reloaded.stop();
  });

  it("persists tasks across reload", () => {
    const t = board.addTask({ title: "persisted", task: "a durable task with enough detail" });
    const reloaded = new KanbanBoard();
    expect(reloaded.getTask(t.id)?.title).toBe("persisted");
    reloaded.stop();
  });
});

describe("kanban — worker execution", () => {
  let backup: string | null = null;
  let board: KanbanBoard;

  beforeEach(() => {
    backup = fs.existsSync(BOARD_FILE) ? fs.readFileSync(BOARD_FILE, "utf-8") : null;
    fs.mkdirSync(path.dirname(BOARD_FILE), { recursive: true });
    fs.writeFileSync(BOARD_FILE, "[]");
    board = new KanbanBoard();
  });

  afterEach(() => {
    board.stop();
    if (backup !== null) fs.writeFileSync(BOARD_FILE, backup);
    else if (fs.existsSync(BOARD_FILE)) fs.unlinkSync(BOARD_FILE);
  });

  it("marks a task done and stores the worker result on success", async () => {
    registerKanbanWorkerRunner(async () => "the final answer");
    (board as any).tasks.push(fullTask({ id: "k_ok", status: "running" }));
    await (board as any).runWorker("k_ok");
    const t = board.getTask("k_ok")!;
    expect(t.status).toBe("done");
    expect(t.result).toBe("the final answer");
  });

  it("blocks a task after exhausting retries", async () => {
    registerKanbanWorkerRunner(async () => { throw new Error("boom"); });
    (board as any).tasks.push(fullTask({ id: "k_fail", status: "running", maxRetries: 0 }));
    await (board as any).runWorker("k_fail");
    const t = board.getTask("k_fail")!;
    expect(t.status).toBe("blocked");
    expect(t.consecutiveFailures).toBe(1);
    expect(t.error).toContain("boom");
  });

  it("re-queues a failed task while retries remain", async () => {
    registerKanbanWorkerRunner(async () => { throw new Error("transient"); });
    (board as any).tasks.push(fullTask({ id: "k_retry", status: "running", maxRetries: 2 }));
    await (board as any).runWorker("k_retry");
    const t = board.getTask("k_retry")!;
    expect(t.status).toBe("ready");
    expect(t.consecutiveFailures).toBe(1);
  });

  it("feeds completed prerequisite results into the worker prompt", () => {
    (board as any).tasks.push(fullTask({ id: "dep1", status: "done", title: "Research", result: "FINDINGS: x y z" }));
    const child = fullTask({ id: "child", status: "running", task: "write the summary", dependsOn: ["dep1"] });
    (board as any).tasks.push(child);
    const prompt = (board as any).buildWorkerPrompt(child);
    expect(prompt).toContain("FINDINGS: x y z");
    expect(prompt).toContain("write the summary");
    expect(prompt.indexOf("FINDINGS")).toBeLessThan(prompt.indexOf("write the summary"));
  });
});
