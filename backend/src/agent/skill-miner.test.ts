import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/**
 * The skill-miner module reads from `data/checkpoints/*.json` relative to
 * `backend/`. We seed that dir with synthetic checkpoints, run the miner,
 * and assert on the suggestions that get written. Each test cleans up after
 * itself so they can run in any order.
 *
 * NOTE: the miner module captures CHECKPOINT_DIR / SUGGESTIONS_DIR at
 * import time, so we cannot relocate them via env vars. The integration
 * test simply uses the real on-disk dirs and snapshots/restores them.
 */

// Point the miner at isolated temp dirs (via env, read at module import time)
// so this suite never races other tests / the app over the shared on-disk
// `data/` directory. Must be set BEFORE the first `await import("./skill-miner")`.
const CHECKPOINT_DIR = path.join(os.tmpdir(), `candle-cp-${process.pid}-${Date.now()}`);
const SUGGESTIONS_DIR = path.join(os.tmpdir(), `candle-sg-${process.pid}-${Date.now()}`);
process.env.CANDLE_CHECKPOINT_DIR = CHECKPOINT_DIR;
process.env.CANDLE_SUGGESTIONS_DIR = SUGGESTIONS_DIR;

function clearDir(dir: string) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    try { fs.unlinkSync(path.join(dir, name)); } catch { /* ignore */ }
  }
}

beforeAll(() => {
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  fs.mkdirSync(SUGGESTIONS_DIR, { recursive: true });
});

afterAll(() => {
  clearDir(CHECKPOINT_DIR);
  clearDir(SUGGESTIONS_DIR);
  try { fs.rmdirSync(CHECKPOINT_DIR); } catch { /* ignore */ }
  try { fs.rmdirSync(SUGGESTIONS_DIR); } catch { /* ignore */ }
});

beforeEach(() => {
  clearDir(CHECKPOINT_DIR);
  clearDir(SUGGESTIONS_DIR);
});

function writeCheckpoint(runId: string, prompt: string, toolNames: string[], opts: { status?: string; toolCallCount?: number } = {}) {
  const checkpoint = {
    runId,
    sessionId: runId,
    prompt,
    history: [],
    partialAnswer: "",
    toolEvents: toolNames.map((name) => ({ name, durationMs: 100, isError: false })),
    runCtx: {
      complexity: "complex",
      toolCallCount: opts.toolCallCount ?? toolNames.length,
      searchCallCount: 0,
      browseCallCount: 0,
      costScore: 0,
      costCeiling: 50,
      budgetMaxToolCalls: 30,
    },
    startedAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_500,
    completedAt: 1_700_000_000_500,
    status: opts.status ?? "completed",
  };
  fs.writeFileSync(path.join(CHECKPOINT_DIR, `${runId}.json`), JSON.stringify(checkpoint), "utf8");
}

describe("mineSkillSuggestions", () => {
  it("emits a suggestion when 3+ similar runs cluster", async () => {
    const { mineSkillSuggestions } = await import("./skill-miner");
    writeCheckpoint("r1", "convert this csv file to a parquet file please", [
      "search_web", "run_python", "write_sandbox_file", "run_python",
    ]);
    writeCheckpoint("r2", "convert csv data to parquet for analysis pipeline", [
      "search_web", "run_python", "write_sandbox_file", "run_python",
    ]);
    writeCheckpoint("r3", "transform csv into parquet using pyarrow", [
      "search_web", "run_python", "write_sandbox_file", "run_python",
    ]);

    const summary = mineSkillSuggestions();
    expect(summary.scannedRuns).toBe(3);
    expect(summary.clustersFound).toBeGreaterThanOrEqual(1);
    expect(summary.newSuggestions).toBeGreaterThanOrEqual(1);
    expect(summary.polishedSuggestions).toBe(0);

    const files = fs.readdirSync(SUGGESTIONS_DIR);
    expect(files.length).toBeGreaterThanOrEqual(1);
    const raw = fs.readFileSync(path.join(SUGGESTIONS_DIR, files[0]), "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.status).toBe("pending");
    expect(parsed.toolSequence.length).toBeGreaterThan(0);
    expect(parsed.clusterSize).toBeGreaterThanOrEqual(3);
  });

  it("ignores failed and cancelled runs", async () => {
    const { mineSkillSuggestions } = await import("./skill-miner");
    writeCheckpoint("r1", "convert csv to parquet", ["run_python", "run_python", "write_sandbox_file", "run_python"], { status: "failed" });
    writeCheckpoint("r2", "convert csv to parquet", ["run_python", "run_python", "write_sandbox_file", "run_python"], { status: "cancelled" });

    const summary = mineSkillSuggestions();
    expect(summary.scannedRuns).toBe(0);
    expect(summary.newSuggestions).toBe(0);
  });

  it("skips trivial runs with too few tool calls", async () => {
    const { mineSkillSuggestions } = await import("./skill-miner");
    for (let i = 0; i < 5; i += 1) {
      writeCheckpoint(`r${i}`, "trivial single search", ["search_web"]);
    }
    const summary = mineSkillSuggestions();
    expect(summary.qualifyingRuns).toBe(0);
    expect(summary.newSuggestions).toBe(0);
  });

  it("is idempotent — re-running emits no new suggestions", async () => {
    const { mineSkillSuggestions } = await import("./skill-miner");
    for (let i = 0; i < 3; i += 1) {
      writeCheckpoint(`r${i}`, "scrape news headlines into a csv export", [
        "search_web", "browse_web", "run_python", "write_sandbox_file",
      ]);
    }

    const first = mineSkillSuggestions();
    expect(first.newSuggestions).toBeGreaterThanOrEqual(1);

    const second = mineSkillSuggestions();
    expect(second.newSuggestions).toBe(0);
  });

  it("redacts secrets from prompt samples", async () => {
    const { mineSkillSuggestions, listSuggestions } = await import("./skill-miner");
    const prompt = "convert csv with api_key=sk-secretvalue1234567890 to parquet";
    for (let i = 0; i < 3; i += 1) {
      writeCheckpoint(`r${i}`, prompt, ["search_web", "run_python", "write_sandbox_file", "run_python"]);
    }
    mineSkillSuggestions();
    const suggestions = listSuggestions();
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    for (const s of suggestions) {
      for (const sample of s.promptSamples) {
        expect(sample).not.toContain("sk-secretvalue1234567890");
      }
    }
  });

  it("updateSuggestionStatus persists status changes", async () => {
    const { mineSkillSuggestions, listSuggestions, updateSuggestionStatus, loadSuggestion } =
      await import("./skill-miner");
    for (let i = 0; i < 3; i += 1) {
      writeCheckpoint(`r${i}`, "build a small dashboard from a csv file", [
        "run_python", "write_sandbox_file", "run_python", "run_terminal",
      ]);
    }
    mineSkillSuggestions();
    const suggestions = listSuggestions();
    expect(suggestions.length).toBeGreaterThanOrEqual(1);

    const id = suggestions[0].id;
    const updated = updateSuggestionStatus(id, "approved");
    expect(updated?.status).toBe("approved");

    const reloaded = loadSuggestion(id);
    expect(reloaded?.status).toBe("approved");
  });

  it("rejects path-traversal attempts in suggestion ids", async () => {
    const { loadSuggestion, deleteSuggestion } = await import("./skill-miner");
    expect(loadSuggestion("../../../etc/passwd")).toBeNull();
    expect(deleteSuggestion("../../../etc/passwd")).toBe(false);
  });
});
