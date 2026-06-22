/**
 * Shared types + helpers for the GAIA benchmark harness.
 *
 * GAIA rows (from the gaia-benchmark/GAIA dataset, config `2023_all`) carry a
 * question, a difficulty level, the unambiguous ground-truth `Final answer`,
 * and an optional attached file (PDF / image / spreadsheet / audio) that the
 * agent must read to answer.
 */
import * as fs from "fs";
import * as path from "path";

export interface GaiaRow {
  task_id: string;
  Question: string;
  Level: string; // "1" | "2" | "3"
  /** Ground-truth answer. Present in validation, empty/"?" in the hidden test split. */
  "Final answer": string;
  file_name: string;
  file_path: string;
}

export interface GaiaTask {
  taskId: string;
  question: string;
  level: number;
  answer: string;
  /** Basename of the attached file, or "" when the question has no attachment. */
  fileName: string;
  /** Absolute local path to the downloaded attachment, or "" when none. */
  localFilePath: string;
}

/** Root dir for downloaded GAIA data. Overridable via GAIA_DATA_DIR. */
export function gaiaDataDir(): string {
  return (
    process.env.GAIA_DATA_DIR ||
    path.resolve(__dirname, "..", "..", "benchmark-data", "gaia")
  );
}

export function metadataPath(split: string): string {
  return path.join(gaiaDataDir(), split, "metadata.jsonl");
}

export function filesDir(split: string): string {
  return path.join(gaiaDataDir(), split, "files");
}

/**
 * Load downloaded GAIA tasks for a split from the local metadata.jsonl.
 * Optionally filter by level and/or cap the count.
 */
export function loadGaiaTasks(
  split: string,
  opts: { level?: number; limit?: number; ids?: string[] } = {}
): GaiaTask[] {
  const file = metadataPath(split);
  if (!fs.existsSync(file)) {
    throw new Error(
      `GAIA metadata not found at ${file}. Run \`npm run bench:download\` first.`
    );
  }
  const lines = fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim());
  let tasks: GaiaTask[] = lines.map((line) => {
    const row = JSON.parse(line) as GaiaRow;
    const fileName = row.file_name || "";
    return {
      taskId: row.task_id,
      question: row.Question,
      level: Number(row.Level),
      answer: row["Final answer"] ?? "",
      fileName,
      localFilePath: fileName ? path.join(filesDir(split), fileName) : "",
    };
  });

  if (opts.level != null) tasks = tasks.filter((t) => t.level === opts.level);
  if (opts.ids && opts.ids.length) {
    const set = new Set(opts.ids);
    tasks = tasks.filter((t) => set.has(t.taskId));
  }
  if (opts.limit != null) tasks = tasks.slice(0, opts.limit);
  return tasks;
}
