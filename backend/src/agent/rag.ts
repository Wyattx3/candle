import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { runWithSandboxRetry, selectTemplateForTask } from "../tools";

/**
 * Keyword-frequency search across the sandbox workspace.
 *
 * The script body is parameter-free; the query and target path are passed
 * via env vars (`Q`, `P`, `MAX`) so quote/backslash characters in user
 * input cannot escape into the JS source. This closes the obvious code
 * injection vector in the previous string-interpolation version.
 */
export const semanticSearchTool = tool(
  async ({ query, path: targetPath, max_results, template_id }) => {
    try {
      const trimmedQuery = (query ?? "").trim();
      if (!trimmedQuery) return "Query is empty.";
      if (trimmedQuery.length > 500) {
        return "Query too long (>500 chars). Narrow it down to specific keywords.";
      }
      const safeTarget = targetPath && /^\/home\/user(\/.*)?$/.test(targetPath)
        ? targetPath
        : "/home/user";
      const cap = Math.min(Math.max(Number(max_results) || 5, 1), 25);

      const templateId = selectTemplateForTask("semantic_search", trimmedQuery, template_id);

      // No interpolation — the script reads from env vars only.
      const script = `
const fs = require('fs');
const path = require('path');

const queryRaw = process.env.Q || '';
const targetDir = process.env.P || '/home/user';
const maxResults = parseInt(process.env.MAX || '5', 10);

const queryWords = queryRaw.toLowerCase().split(/\\s+/).filter(w => w.length > 2);
if (queryWords.length === 0) {
  console.log("Query too short — needs at least one word longer than 2 chars.");
  process.exit(0);
}

if (!fs.existsSync(targetDir)) {
  console.log("Directory does not exist: " + targetDir);
  process.exit(0);
}

function escapeRegex(s) { return s.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'); }

function* walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

const results = [];
let scanned = 0;
const MAX_SCAN = 5000;
const MAX_FILE_BYTES = 1_500_000;

for (const file of walk(targetDir)) {
  if (scanned++ > MAX_SCAN) break;
  let stat;
  try { stat = fs.statSync(file); } catch { continue; }
  if (stat.size > MAX_FILE_BYTES) continue;
  let content;
  try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
  const lower = content.toLowerCase();
  let score = 0, matches = 0;
  for (const word of queryWords) {
    const re = new RegExp(escapeRegex(word), 'g');
    const count = (lower.match(re) || []).length;
    if (count > 0) { score += count; matches += 1; }
  }
  if (matches === queryWords.length) score *= 2;
  if (score > 0) {
    results.push({ file, score, preview: content.slice(0, 200).replace(/\\n/g, ' ') });
  }
}

results.sort((a, b) => b.score - a.score);
const top = results.slice(0, maxResults);
if (top.length === 0) {
  console.log("No relevant files found.");
} else {
  console.log(JSON.stringify(top, null, 2));
}
`;

      const execution = await runWithSandboxRetry<{ stdout?: string; stderr?: string }>(
        templateId,
        async (liveSandbox) => {
          const filePath = `/home/user/.candle_rag_${Date.now()}.js`;
          await liveSandbox.files.write(filePath, script);
          // Pass user input via env so it can never be parsed as code.
          return liveSandbox.commands.run(`node ${filePath}`, {
            timeoutMs: 60_000,
            requestTimeoutMs: 60_000,
            envs: { Q: trimmedQuery, P: safeTarget, MAX: String(cap) },
          });
        }
      );

      return (
        execution.stdout?.trim() ||
        execution.stderr?.trim() ||
        "Search completed with no output."
      );
    } catch (e: any) {
      return `Semantic search failed: ${e?.message ?? e}`;
    }
  },
  {
    name: "semantic_search",
    description:
      "Keyword-frequency search across the sandbox workspace. Returns the top files by match score with a preview snippet. Cheap; no embeddings.",
    schema: z.object({
      query: z.string().describe("Concept or keywords to search for."),
      path: z.string().optional().describe("Directory to search in. Must be under /home/user. Defaults to /home/user."),
      max_results: z.number().optional().describe("Max files to return. 1-25. Defaults to 5."),
      template_id: z.string().optional().describe("Optional E2B template ID."),
    }),
  }
);
