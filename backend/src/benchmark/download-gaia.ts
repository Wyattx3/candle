/**
 * Downloads the GAIA dataset (config `2023_all`) from the Hugging Face
 * datasets-server into a local folder so the benchmark runner can operate
 * offline and deterministically.
 *
 *   - Metadata rows  → <GAIA_DATA_DIR>/<split>/metadata.jsonl  (one JSON/line)
 *   - Attached files → <GAIA_DATA_DIR>/<split>/files/<file_name>
 *
 * GAIA is a GATED dataset: this REQUIRES an HF_TOKEN env var belonging to an
 * account that has accepted the dataset's license. Without it the API returns
 * 401 and we abort with setup instructions.
 *
 * Usage:
 *   ts-node src/benchmark/download-gaia.ts [--split validation] [--no-files]
 */
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load backend/.env so HF_TOKEN and GAIA_DATA_DIR are available when this
// script is run standalone (the agent runner gets this via ../agent/llm).
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

import { filesDir, gaiaDataDir, metadataPath, GaiaRow } from "./gaia-types";

const DATASET = "gaia-benchmark/GAIA";
const CONFIG = "2023_all";
const ROWS_URL = "https://datasets-server.huggingface.co/rows";
// Public resolve endpoint for the attached files (same gating/token).
const RESOLVE_BASE = `https://huggingface.co/datasets/${DATASET}/resolve/main`;

function token(): string {
  const t = process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN || "";
  if (!t) {
    throw new Error(
      "HF_TOKEN is not set. GAIA is a gated dataset.\n" +
        "1. Create a token at https://huggingface.co/settings/tokens\n" +
        "2. Accept the license at https://huggingface.co/datasets/gaia-benchmark/GAIA\n" +
        "3. Add HF_TOKEN=hf_... to backend/.env"
    );
  }
  return t;
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${token()}` };
}

interface RowsResponse {
  rows: { row_idx: number; row: GaiaRow }[];
  num_rows_total: number;
  num_rows_per_page: number;
}

async function fetchPage(split: string, offset: number, length: number): Promise<RowsResponse> {
  const url =
    `${ROWS_URL}?dataset=${encodeURIComponent(DATASET)}` +
    `&config=${encodeURIComponent(CONFIG)}` +
    `&split=${encodeURIComponent(split)}&offset=${offset}&length=${length}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`datasets-server ${res.status} for offset ${offset}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as RowsResponse;
}

async function downloadFile(split: string, fileName: string): Promise<boolean> {
  if (!fileName) return false;
  const dest = path.join(filesDir(split), fileName);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return true; // already have it
  // The file_path in metadata looks like "2023/validation/<file>"; the resolve
  // URL needs that repo-relative path. GAIA stores attachments under the split.
  const repoPath = `2023/${split}/${fileName}`;
  const url = `${RESOLVE_BASE}/${repoPath}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    console.warn(`  ! could not fetch attachment ${fileName}: HTTP ${res.status}`);
    return false;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const splitArg = args.indexOf("--split");
  const split = splitArg >= 0 ? args[splitArg + 1] : "validation";
  const skipFiles = args.includes("--no-files");

  console.log(`[gaia:download] dataset=${DATASET} config=${CONFIG} split=${split}`);
  console.log(`[gaia:download] target dir: ${gaiaDataDir()}`);

  const PAGE = 100;
  const first = await fetchPage(split, 0, PAGE);
  const total = first.num_rows_total;
  console.log(`[gaia:download] ${total} rows total`);

  const allRows: GaiaRow[] = first.rows.map((r) => r.row);
  for (let offset = PAGE; offset < total; offset += PAGE) {
    const page = await fetchPage(split, offset, PAGE);
    allRows.push(...page.rows.map((r) => r.row));
    console.log(`[gaia:download] fetched ${allRows.length}/${total}`);
  }

  // Write metadata.jsonl
  const metaFile = metadataPath(split);
  fs.mkdirSync(path.dirname(metaFile), { recursive: true });
  fs.writeFileSync(metaFile, allRows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
  console.log(`[gaia:download] wrote ${allRows.length} rows → ${metaFile}`);

  // Download attachments
  if (!skipFiles) {
    const withFiles = allRows.filter((r) => r.file_name);
    console.log(`[gaia:download] ${withFiles.length} questions have attachments`);
    let ok = 0;
    for (const r of withFiles) {
      if (await downloadFile(split, r.file_name)) ok += 1;
    }
    console.log(`[gaia:download] downloaded ${ok}/${withFiles.length} attachments`);
  }

  console.log(`[gaia:download] DONE`);
}

main().catch((err) => {
  console.error(`[gaia:download] FAILED: ${err?.message ?? err}`);
  process.exit(1);
});
