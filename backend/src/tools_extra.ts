import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { AsyncLocalStorage } from "node:async_hooks";
import { getClarificationGate } from "./clarification";
import { cronManager } from "./agent/cron";
import { getTodoStore } from "./agent/todo";
import { getSkillByName, createSkill, listSkills, updateSkill, deleteSkill } from "./skills";
import { runWithSandboxRetry, defaultE2BTemplate } from "./tools";

// ---------- Per-run subagent context plumbing ------------------------------
// The parent's `runSubagent` lives in `agent/subagent.ts` and depends on
// `agent/loop.ts`, which depends on this module's tools — so we cannot import
// the runner directly without creating a cycle. Instead, `agent/index.ts`
// registers it lazily at startup (`registerSpawnSubagentRunner`) and binds
// the per-run artifact registry + signal before each turn
// (`setSubagentRunBindings`). The `spawn_subagent` tool below reads both
// at call time.
export type SpawnSubagentRunner = (
  task: string,
  parentArtifacts: any,
  parentSignal?: AbortSignal
) => Promise<any>;

export type SpawnSubagentBatchRunner = (
  tasks: { id: string; task: string }[],
  parentArtifacts: any,
  parentSignal?: AbortSignal,
  options?: { combineStrategy?: "all" | "first_success" }
) => Promise<any>;

let spawnRunner: SpawnSubagentRunner | undefined;
let spawnBatchRunner: SpawnSubagentBatchRunner | undefined;

export function registerSpawnSubagentRunner(runner: SpawnSubagentRunner) {
  spawnRunner = runner;
}

export function registerSpawnSubagentBatchRunner(runner: SpawnSubagentBatchRunner) {
  spawnBatchRunner = runner;
}

interface SubagentBindings {
  artifacts: any;
  signal?: AbortSignal;
}

// Per-run bindings for the spawn_* tools. Previously these were module-global
// `let` variables, which is a correctness bug under concurrency: every
// WebSocket run shares this module, so two overlapping runs would clobber
// each other's artifact registry + abort signal (cross-run artifact
// attribution, wrong cancellation, and a finishing run wiping a still-active
// run's bindings → "no active artifact registry"). AsyncLocalStorage scopes
// the bindings to each run's async context, exactly like approvals/session.
const subagentBindingsStore = new AsyncLocalStorage<SubagentBindings>();

/**
 * Run `fn` with the given subagent bindings in scope. `runAgentStream` wraps
 * each run in this so the spawn tools read THIS run's registry + signal.
 */
export function withSubagentBindings<T>(bindings: SubagentBindings, fn: () => Promise<T>): Promise<T> {
  return subagentBindingsStore.run(bindings, fn);
}

function getSubagentBindings(): SubagentBindings | undefined {
  return subagentBindingsStore.getStore();
}

export const spawnSubagentTool = tool(
  async ({ task }) => {
    if (!spawnRunner) {
      return "Error: subagent runner not initialised. This is an internal wiring bug — report it.";
    }
    const bindings = getSubagentBindings();
    if (!bindings?.artifacts) {
      return "Error: no active artifact registry bound for this run. Subagent cannot start safely.";
    }
    const result = await spawnRunner(task, bindings.artifacts, bindings.signal);
    return JSON.stringify(result, null, 2);
  },
  {
    name: "spawn_subagent",
    description:
      "Delegate a self-contained sub-task to an isolated worker agent with its own tool budget (~14 calls, 2 min timeout). " +
      "Use for research phases, long builds, or independent secondary work whose details you don't need to recall later. " +
      "The worker has NO chat history — pass all required context (URLs, paths, exact requirements) inside `task`. " +
      "Returns { ok, summary, artifacts: [...] }. Workers cannot recurse. " +
      "For 2-4 INDEPENDENT sub-tasks that should run concurrently, use spawn_subagents_parallel instead.",
    schema: z.object({
      task: z
        .string()
        .min(10)
        .describe("Self-contained task description with every detail the worker needs to operate without context."),
    }),
  }
);

export const spawnSubagentsParallelTool = tool(
  async ({ tasks, combineStrategy }) => {
    if (!spawnBatchRunner) {
      return "Error: parallel subagent runner not initialised. This is an internal wiring bug — report it.";
    }
    const bindings = getSubagentBindings();
    if (!bindings?.artifacts) {
      return "Error: no active artifact registry bound for this run. Parallel subagents cannot start safely.";
    }
    const cleaned = (tasks ?? [])
      .map((t, idx) => ({
        id: (t.id || `worker-${idx + 1}`).slice(0, 40),
        task: (t.task || "").trim(),
      }))
      .filter((t) => t.task.length >= 10);
    if (cleaned.length < 2) {
      return "Error: spawn_subagents_parallel needs AT LEAST 2 tasks. For a single worker use spawn_subagent.";
    }
    const result = await spawnBatchRunner(
      cleaned,
      bindings.artifacts,
      bindings.signal,
      { combineStrategy: combineStrategy ?? "all" }
    );
    return JSON.stringify(result, null, 2);
  },
  {
    name: "spawn_subagents_parallel",
    description:
      "Fan out 2-4 INDEPENDENT sub-tasks to worker agents that run CONCURRENTLY. " +
      "Each worker gets its own ~14-call tool budget and a 90-second per-worker timeout. " +
      "Workers share the parent's artifact registry; results are deduped before returning. " +
      "Use ONLY when sub-tasks are truly independent (e.g. researching three different sources at once). " +
      "If sub-tasks have ordering or data dependencies, call spawn_subagent sequentially instead. " +
      "combineStrategy='all' waits for every worker; 'first_success' cancels the remaining workers as soon as one succeeds (race-style search). " +
      "Workers cannot recurse — they cannot call spawn_subagent or spawn_subagents_parallel.",
    schema: z.object({
      tasks: z
        .array(
          z.object({
            id: z.string().optional().describe("Optional stable identifier so you can cross-reference each worker's output."),
            task: z.string().min(10).describe("Self-contained task description for this worker."),
          })
        )
        .min(2)
        .max(4)
        .describe("Between 2 and 4 independent tasks. Each runs in its own isolated worker."),
      combineStrategy: z
        .enum(["all", "first_success"])
        .optional()
        .describe("'all' (default) waits for every worker. 'first_success' cancels the rest as soon as one returns ok."),
    }),
  }
);

// ────────────────────────────────────────────────────────────────────────────
// NEW PHASE 3 TOOLS: Clarify, Cronjob, Todo, Patch
// ────────────────────────────────────────────────────────────────────────────

export const clarifyTool = tool(
  async ({ question, options }) => {
    const gate = getClarificationGate();
    if (!gate) {
      // No human in scope (script / test / timeout-after-disconnect). Stay
      // graceful: return a structured note so the agent can fall back to a
      // best-guess answer instead of hanging.
      return JSON.stringify({
        type: "CLARIFY",
        delivered: false,
        question,
        options: options || [],
        message: "No interactive client is connected. Proceed with your best assumption and document it in the final answer.",
      });
    }
    try {
      const reply = await gate({ question, options: options || [] });
      const trimmed = (reply || "").trim();
      if (!trimmed) {
        return JSON.stringify({
          type: "CLARIFY",
          delivered: true,
          question,
          options: options || [],
          message: "User did not provide a usable answer. Proceed with your best assumption and document it.",
        });
      }
      // Return a flat string so the model treats it as a normal observation.
      return `User clarification: ${trimmed.slice(0, 2000)}`;
    } catch (err: any) {
      return JSON.stringify({
        type: "CLARIFY",
        delivered: false,
        question,
        options: options || [],
        message: `Clarification failed: ${err?.message ?? err}. Proceed with your best assumption.`,
      });
    }
  },
  {
    name: "clarify",
    description:
      "Ask the user one targeted question via the UI modal and wait for their reply. " +
      "Use ONLY when you genuinely cannot proceed without input — otherwise infer the most likely intent and continue. " +
      "Returns the user's reply as plain text (or a fallback message if no client is connected).",
    schema: z.object({
      question: z.string().min(3).describe("The question to ask the user. Keep it short and specific."),
      options: z.array(z.string()).optional().describe("Optional multiple-choice options shown in the UI."),
    }),
  }
);

export const cronjobTool = tool(
  async ({ action, task, intervalMinutes, id }) => {
    try {
      if (action === "create") {
        if (!task || !intervalMinutes) return "Error: task and intervalMinutes required for create.";
        const job = cronManager.addJob(task, intervalMinutes);
        return `Cronjob created with ID: ${job.id} (every ${job.intervalMinutes} min).`;
      }
      if (action === "remove") {
        if (!id) return "Error: id required for remove.";
        const success = cronManager.removeJob(id);
        return success ? `Cronjob ${id} removed.` : `Cronjob ${id} not found.`;
      }
      return JSON.stringify(cronManager.listJobs(), null, 2);
    } catch (e: any) {
      return `Cronjob error: ${e?.message ?? e}`;
    }
  },
  {
    name: "cronjob",
    description:
      "Manage background scheduled cronjobs. Each job runs the given prompt through the agent in-process at the configured interval. Persists across restarts.",
    schema: z.object({
      action: z.enum(["create", "remove", "list"]).describe("Action to perform."),
      task: z.string().optional().describe("The prompt/task to run (required for create)."),
      intervalMinutes: z.number().min(1).optional().describe("Interval in minutes — at least 1 (required for create)."),
      id: z.string().optional().describe("The ID of the job to remove (required for remove)."),
    }),
  }
);

export const todoTool = tool(
  async ({ todos, merge }) => {
    try {
      const store = getTodoStore();
      const items = todos != null ? store.write(todos, merge ?? false) : store.read();
      return JSON.stringify({ todos: items, summary: store.summary() }, null, 2);
    } catch (e: any) {
      return `Todo error: ${e?.message ?? e}`;
    }
  },
  {
    name: "todo",
    description:
      "Manage your task list for the CURRENT session. Use for complex tasks with 3+ steps " +
      "or when the user gives multiple tasks. Call with NO parameters to read the current list.\n\n" +
      "Writing:\n" +
      "- Provide a 'todos' array to create/update items.\n" +
      "- merge=false (default): replace the entire list with a fresh plan.\n" +
      "- merge=true: update existing items by id, append any new ones.\n\n" +
      "Each item: { id: string, content: string, status: pending|in_progress|completed|cancelled }.\n" +
      "List order is priority. Keep only ONE item in_progress at a time. " +
      "Mark items completed immediately when done. If something fails, set it to cancelled and add a revised item.\n\n" +
      "Your active (pending/in_progress) items are automatically re-shown to you after long runs, " +
      "so you never lose the plan. Always returns the full current list plus summary counts.",
    schema: z.object({
      todos: z
        .array(
          z.object({
            id: z.string().describe("Unique item identifier (you choose it, e.g. '1', '2', 'scrape')."),
            content: z.string().describe("Task description."),
            status: z
              .enum(["pending", "in_progress", "completed", "cancelled"])
              .optional()
              .describe("Item status. Defaults to pending."),
          })
        )
        .optional()
        .describe("Task items to write. Omit entirely to READ the current list."),
      merge: z
        .boolean()
        .optional()
        .describe("false (default) replaces the whole list; true updates existing items by id and appends new ones."),
    }),
  }
);

export const patchFileTool = tool(
  async ({ path, old_content, new_content }) => {
    try {
      const result = await runWithSandboxRetry<{ stdout?: string; stderr?: string }>(defaultE2BTemplate, async (liveSandbox: any) => {
        const content = await liveSandbox.files.read(path);
        const firstIdx = content.indexOf(old_content);
        if (firstIdx === -1) {
           return { stderr: "Error: old_content not found in the file exactly as provided. Please check whitespace and try again." };
        }
        // Reject ambiguous patches — if old_content appears more than once we
        // can't know which to change. Ask for more surrounding context.
        if (content.indexOf(old_content, firstIdx + old_content.length) !== -1) {
           return { stderr: "Error: old_content matches MORE THAN ONCE in the file. Include more surrounding lines so the target is unique." };
        }
        // Use a replacer FUNCTION so `$`-sequences ($&, $1, $$, etc.) in
        // new_content are inserted literally instead of being interpreted by
        // String.prototype.replace's special-pattern handling.
        const patched = content.replace(old_content, () => new_content);
        await liveSandbox.files.write(path, patched);
        return { stdout: `Successfully patched ${path}` };
      });
      return result.stdout || result.stderr || "Patched.";
    } catch (e: any) {
      return `Failed to patch file: ${e.message}`;
    }
  },
  {
    name: "patch",
    description: "Fuzzy patch a specific block of text in a file inside the sandbox. More efficient than overwriting the whole file. Provide the exact old block and the new block.",
    schema: z.object({
      path: z.string().describe("Path to the file."),
      old_content: z.string().describe("Exact text to find and replace (including whitespace)."),
      new_content: z.string().describe("New text to insert."),
    }),
  }
);

export const skillViewTool = tool(
  async ({ name }) => {
    const skill = getSkillByName(name);
    if (!skill) return `Skill not found: "${name}". Use skill_manage(action="list") to see available skills.`;
    return skill.body;
  },
  {
    name: "skill_view",
    description:
      "Load the full body of a registered skill (a step-by-step Markdown workflow). " +
      "Call this BEFORE starting a non-trivial task when one of the skills in the system-prompt index matches. " +
      "Returns the full workflow as Markdown. Cheap — no network, no sandbox.",
    schema: z.object({ name: z.string().describe("The exact skill name from the index (kebab-case).") })
  }
);

export const skillManageTool = tool(
  async ({ action, name, description, body, tags }) => {
    try {
      if (action === "list") return JSON.stringify(listSkills(), null, 2);

      if (action === "create") {
        if (!name || !description || !body) {
          return "Error: name, description, and body are required for create.";
        }
        const result = createSkill({ name, description, body, tags: tags || [] });
        return result.status === "exists"
          ? `A skill named "${result.name}" already exists. Use action="update" to revise it, or pick a different name.`
          : `Skill "${result.name}" saved to ${result.filePath}. It will appear in the skill index on the next turn.`;
      }

      if (action === "update") {
        if (!name) return "Error: name is required for update.";
        const result = updateSkill({ name, description, body, tags });
        return result.status === "not_found"
          ? `Skill "${name}" does not exist. Use action="create" to add it.`
          : `Skill "${name}" updated at ${result.filePath}. New content takes effect on the next turn.`;
      }

      if (action === "delete") {
        if (!name) return "Error: name is required for delete.";
        const result = deleteSkill(name);
        return result.status === "not_found"
          ? `Skill "${name}" not found — nothing to delete.`
          : `Skill "${name}" removed.`;
      }

      return `Invalid action "${action}". Use 'list', 'create', 'update', or 'delete'.`;
    } catch (e: any) {
      return `Error: ${e?.message ?? e}`;
    }
  },
  {
    name: "skill_manage",
    description:
      "Closed-loop learning: list, create, update, or delete persistent workflow skills. " +
      "Call action='create' AFTER solving a non-trivial generalizable task to capture the steps. " +
      "Use action='update' if you discovered a better version of an existing skill. " +
      "Use action='delete' only for clearly broken or duplicated skills. " +
      "Skill names are kebab-case (e.g. 'pdf-merge-workflow'). Body should be Markdown with concrete steps and example tool calls. " +
      "Skills auto-load into the system prompt index on the next request.",
    schema: z.object({
      action: z.enum(["list", "create", "update", "delete"]).describe("'list' to enumerate, 'create' / 'update' / 'delete' to mutate."),
      name: z.string().optional().describe("Required for create / update / delete. Kebab-case, 2-63 chars."),
      description: z.string().optional().describe("Required for create. Optional override on update. ≤200 chars."),
      body: z.string().optional().describe("Required for create. Optional override on update. Full Markdown workflow."),
      tags: z.array(z.string()).optional().describe("Optional tags. On update, replaces the existing set if provided.")
    })
  }
);
