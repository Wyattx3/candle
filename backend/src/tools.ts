import { tool } from "@langchain/core/tools";
import Kernel from "@onkernel/sdk";
import * as cheerio from "cheerio";
import { Sandbox as E2BSandbox } from "e2b";
import { z } from "zod";
import { getSessionId } from "./agent/session";
import { classifyCommandRisk, getApprovalGate } from "./approvals";
import { getReadBlockError, getWriteBlockError } from "./agent/file-safety";
import { redactSecrets } from "./security";

/**
 * Per-session E2B sandbox registry.
 *
 * Each WebSocket connection gets its own session id (via
 * `withSessionContext({ sessionId: connectionId })` in `server.ts`). The map
 * below keys a `SandboxRecord` per session so concurrent users do not share
 * `/home/user/`. Scripts and tests that run outside any session context land
 * on `"_default"`, which preserves the legacy single-sandbox behaviour.
 *
 * The legacy `sandbox` export below remains as a `null` shim so any caller
 * that imported the global pointer keeps compiling. New code should call
 * `getSandboxForSession()` or rely on `runWithSandboxRetry`.
 */
interface SandboxRecord {
  sandbox: any;
  templateId: string;
  /** Per-session lock chain to serialise sandbox mutations. */
  lock: Promise<void>;
}

const sandboxes = new Map<string, SandboxRecord>();

// Legacy compatibility shim — `null` means "no global sandbox; use the
// session-keyed registry". Existing imports keep working. Kept as `let`
// (instead of `const`) for backwards-binary-compat with older builds that
// might import a mutable reference.
// eslint-disable-next-line prefer-const, @typescript-eslint/no-explicit-any
export let sandbox: any = null;
let currentTemplate = "";
// eslint-disable-next-line prefer-const
export let defaultE2BTemplate = process.env.E2B_TEMPLATE_ID || process.env.E2B_TEMPLATE_NAME || "lxq0wfatmw3i42mooiea";
const SANDBOX_TIMEOUT_MS = Number(process.env.SANDBOX_TIMEOUT_MS) || 900_000;

const E2B_TEMPLATES = [
  { id: "lxq0wfatmw3i42mooiea", name: "candle-autonomous-agent", cpu: 4, memory: "4GB", useFor: "default Candle autonomous agent template with Python, Node.js, media, docs, data, browser-support, and CLI utilities preinstalled" },
  { id: "rezjpxscgrqpw9oz0wfk", name: "amp", cpu: 2, memory: "2GB", useFor: "light coding agents, small scripts, quick CLI tasks" },
  { id: "77gbcsv20q8kxklidjhe", name: "opencode", cpu: 2, memory: "2GB", useFor: "OpenCode-style coding and repository work" },
  { id: "u2bzpic9lzyttv5jh36g", name: "openclaw", cpu: 4, memory: "4GB", useFor: "heavier coding, scraping, data transforms" },
  { id: "u1yrkaokyjzef8qchho5", name: "codex", cpu: 2, memory: "2GB", useFor: "Codex-like code editing, tests, terminal workflows" },
  { id: "wunszvjeuyrdgrt0z6o9", name: "claude", cpu: 4, memory: "8GB", useFor: "large artifacts, docs, decks, heavier multi-step tasks" },
  { id: "nlhz8vlwyupq845jsdg9", name: "code-interpreter-v1", cpu: 2, memory: "2GB", useFor: "default Python, data analysis, charts, files" },
  { id: "k0wmnzir0zuzye6dndlw", name: "desktop", cpu: 8, memory: "8GB", useFor: "desktop/browser-like workflows and heavier automation" },
  { id: "rki5dems9wqfm4r03t7g", name: "base", cpu: 2, memory: "512MB", useFor: "minimal shell tasks" },
] as const;

function resolveTemplateId(template?: string) {
  const requested = (template || defaultE2BTemplate).trim();
  return E2B_TEMPLATES.find((item) => item.id === requested || item.name === requested)?.id || requested;
}

/**
 * Template selection precedence:
 *   1. Explicit `requestedTemplate` on the tool call (model asked for it).
 *   2. A session-pinned template set via `set_e2b_template` (currentTemplate).
 *   3. The default `candle-autonomous-agent` template.
 *
 * IMPORTANT — why there is no per-task auto-heuristic: only the default
 * `candle-autonomous-agent` template (built from `e2b.Dockerfile`) ships
 * Candle's full toolchain — Playwright + Chromium + the persistent browser
 * profile, ffmpeg, tesseract, pandoc, poppler, etc. The other 8 templates in
 * `E2B_TEMPLATES` are generic coding-agent images imported from the user's
 * dashboard and do NOT have that toolchain. Auto-routing `sandbox_browser`,
 * `download_video`, or `screenshot_analyze` to them would break those tools
 * (missing Playwright/ffmpeg/tesseract). So auto-selection always stays on the
 * fully-equipped default; the specialised templates are reachable only when
 * the agent EXPLICITLY chooses one via `set_e2b_template` / `template_id`
 * (e.g. for a pure coding task in the `codex` or `claude` environment).
 */
export function selectTemplateForTask(toolName: string, param: string = "", requestedTemplate?: string): string {
  return resolveTemplateId(requestedTemplate || currentTemplate || defaultE2BTemplate);
}

function templateNameForId(templateId: string) {
  return E2B_TEMPLATES.find((item) => item.id === templateId)?.name ?? templateId;
}

function selectTemplateForCurrentSandbox(kind: string, signal: string, requestedTemplate?: string) {
  return selectTemplateForTask(kind, signal, requestedTemplate);
}

/**
 * Run `operation` while holding the per-session sandbox lock. The map's
 * record always uses the most recent lock promise — this keeps concurrent
 * tool calls within the SAME session serialised on the sandbox while
 * letting different sessions proceed in parallel.
 */
async function withSessionLock<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
  const existing = sandboxes.get(sessionId);
  const previousLock = existing?.lock ?? Promise.resolve();

  let release!: () => void;
  const nextLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  if (existing) {
    existing.lock = nextLock;
  } else {
    sandboxes.set(sessionId, { sandbox: null, templateId: "", lock: nextLock });
  }

  await previousLock;
  try {
    return await operation();
  } finally {
    release();
  }
}

async function initSandboxForSessionUnlocked(sessionId: string, templateId: string): Promise<any> {
  const resolved = resolveTemplateId(templateId);
  const record = sandboxes.get(sessionId);

  if (record?.sandbox && record.templateId !== resolved) {
    await closeSandboxForSessionUnlocked(sessionId);
  }

  const refreshed = sandboxes.get(sessionId);
  if (!refreshed?.sandbox) {
    const created = await E2BSandbox.create(resolved, { timeoutMs: SANDBOX_TIMEOUT_MS });
    sandboxes.set(sessionId, {
      sandbox: created,
      templateId: resolved,
      lock: refreshed?.lock ?? Promise.resolve(),
    });
    // Keep the legacy `currentTemplate` somewhat in sync so
    // `selectTemplateForTask()` callers without a session see a useful value.
    currentTemplate = resolved;
    return created;
  }
  return refreshed.sandbox;
}

async function closeSandboxForSessionUnlocked(sessionId: string): Promise<void> {
  const record = sandboxes.get(sessionId);
  if (!record?.sandbox) return;
  try {
    if (typeof record.sandbox.kill === "function") {
      await record.sandbox.kill();
    }
  } catch (err: any) {
    console.warn(`[sandbox:${sessionId}] kill failed: ${err?.message ?? err}`);
  }
  sandboxes.set(sessionId, { sandbox: null, templateId: "", lock: record.lock });
}

/** Init the active session's sandbox — used by tools and the /session/start route. */
export const initSandbox = async (templateId: string = defaultE2BTemplate) => {
  const sessionId = getSessionId();
  return withSessionLock(sessionId, () => initSandboxForSessionUnlocked(sessionId, templateId));
};

/** Close the active session's sandbox. */
export const closeSandbox = async () => {
  const sessionId = getSessionId();
  return withSessionLock(sessionId, () => closeSandboxForSessionUnlocked(sessionId));
};

/** Lookup helper for callers that hold an explicit session id. */
export async function getSandboxForSession(sessionId: string, templateId: string = defaultE2BTemplate): Promise<any> {
  return withSessionLock(sessionId, () => initSandboxForSessionUnlocked(sessionId, templateId));
}

async function getLiveSandboxUnlocked(sessionId: string, templateId: string): Promise<any> {
  const resolved = resolveTemplateId(templateId);
  const record = sandboxes.get(sessionId);

  if (!record?.sandbox || record.templateId !== resolved) {
    return initSandboxForSessionUnlocked(sessionId, resolved);
  }

  if (typeof record.sandbox.isRunning === "function") {
    try {
      const running = await record.sandbox.isRunning({ requestTimeoutMs: 10_000 });
      if (!running) {
        await closeSandboxForSessionUnlocked(sessionId);
        return initSandboxForSessionUnlocked(sessionId, resolved);
      }
    } catch {
      await closeSandboxForSessionUnlocked(sessionId);
      return initSandboxForSessionUnlocked(sessionId, resolved);
    }
  }

  return record.sandbox;
}

function isStaleSandboxError(error: any) {
  const message = String(error?.message ?? error ?? "").toLowerCase();
  return message.includes("sandbox is probably not running")
    || message.includes("sandbox timeout")
    || message.includes("port is not open")
    || message.includes("not found")
    || message.includes("no such sandbox")
    || message.includes("connection refused")
    || message.includes("timed out")
    || error?.name === "TimeoutError";
}

export async function runWithSandboxRetry<T>(
  templateId: string,
  operation: (liveSandbox: any) => Promise<T>
) {
  const sessionId = getSessionId();
  return withSessionLock(sessionId, async () => {
    try {
      return await operation(await getLiveSandboxUnlocked(sessionId, templateId));
    } catch (error) {
      if (!isStaleSandboxError(error)) throw error;
      await closeSandboxForSessionUnlocked(sessionId);
      return operation(await initSandboxForSessionUnlocked(sessionId, templateId));
    }
  });
}

/**
 * Approval gate helper used by tools that touch the host or filesystem.
 * Returns a tool-style error string when the user (or the auto-classifier)
 * rejects the action, otherwise resolves to `null`. Tools should `return`
 * this value verbatim when non-null.
 *
 * If no gate is in scope (CLI scripts, tests), the call is allowed silently
 * — the gate is per-WebSocket-connection, not per-tool-implementation.
 */
async function ensureApproval(command: string, reason?: string): Promise<string | null> {
  const gate = getApprovalGate();
  if (!gate) return null;
  const riskLevel = classifyCommandRisk(command);
  if (riskLevel === "low") return null;
  const decision = await gate({ command, riskLevel, reason });
  if (decision === "reject") {
    return `Refused: the user did not approve this ${riskLevel}-risk command. Try a safer alternative or stop and ask.`;
  }
  return null;
}

const TEMPLATE_DESCRIPTIONS =
  "Optional E2B template ID/name. Set this only when you intentionally choose a sandbox environment; otherwise the current/default sandbox is used.";

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * Format an error thrown by a sandbox command run. E2B's `commands.run` throws
 * a `CommandExitError` on non-zero exit, and that error carries `stdout`,
 * `stderr`, and `exitCode`. The previous catch blocks only read `e.message`
 * ("exit status 1"), which hid the traceback and caused the model to blind-
 * retry the same failing code until the run timed out. This surfaces the real
 * stderr/stdout so the model can fix the actual problem on the next attempt.
 */
function formatCommandError(e: any, label: string): string {
  const exitCode = e?.exitCode ?? e?.exit_code;
  const stderr = (e?.stderr ?? "").toString().trim();
  const stdout = (e?.stdout ?? "").toString().trim();
  const msg = (e?.message ?? String(e)).toString().trim();

  const parts: string[] = [];
  parts.push(`${label} failed${exitCode != null ? ` (exit ${exitCode})` : ""}.`);
  if (stderr) parts.push(`stderr:\n${stderr.slice(0, 6000)}`);
  if (stdout) parts.push(`stdout:\n${stdout.slice(0, 2000)}`);
  // Only fall back to the bare message when we have no captured output —
  // otherwise it's just noise like "exit status 1".
  if (!stderr && !stdout && msg) parts.push(msg.slice(0, 2000));
  return parts.join("\n\n");
}

function validatePackageNames(packages: string[]) {
  const invalid = packages.find((pkg) => !/^[a-zA-Z0-9@/_.,:+-]+$/.test(pkg));
  if (invalid) throw new Error(`Invalid package name: ${invalid}`);
}

function formatExecution(execution: any): string {
  if (execution.error) {
    const traceback = Array.isArray(execution.error.traceback)
      ? execution.error.traceback.join("\n")
      : execution.error.traceback ?? "";
    return `Error: ${execution.error.name} - ${execution.error.value}\n${traceback}`;
  }

  const logs = [
    ...(execution.logs?.stdout ?? []),
    ...(execution.logs?.stderr ?? []),
  ].join("").trim();
  const resultTexts = (execution.results ?? [])
    .map((r: any) => r.text)
    .filter(Boolean)
    .join("\n")
    .trim();
  const mainText = execution.text ? String(execution.text).trim() : "";

  const parts = [];
  if (logs) parts.push(`Logs:\n${logs}`);
  if (resultTexts) parts.push(`Results:\n${resultTexts}`);
  else if (mainText) parts.push(`Results:\n${mainText}`);
  return parts.join("\n\n") || "Python finished successfully with no output.";
}

export const runPythonTool = tool(
  async ({ code, template_id }) => {
    try {
      const templateId = selectTemplateForTask("python", code, template_id);
      const execution = await runWithSandboxRetry<{ stdout?: string; stderr?: string }>(templateId, async (liveSandbox) => {
        const filePath = `/home/user/candle_python_${Date.now()}.py`;
        await liveSandbox.files.write(filePath, code, { requestTimeoutMs: 60_000 });
        return liveSandbox.commands.run(`python3 ${filePath}`, {
          timeoutMs: 120_000,
          requestTimeoutMs: 120_000,
        });
      });
      const stdout = execution.stdout?.trim();
      const stderr = execution.stderr?.trim();
      return [
        stdout ? `stdout:\n${stdout}` : "",
        stderr ? `stderr:\n${stderr}` : "",
      ].filter(Boolean).join("\n\n") || "Python finished successfully with no output.";
    } catch (e: any) {
      return formatCommandError(e, "Python execution");
    }
  },
  {
    name: "run_python",
    description: "Execute Python code in an isolated sandbox environment.",
    schema: z.object({
      code: z.string().describe("The Python code to execute."),
      template_id: z.string().optional().describe(TEMPLATE_DESCRIPTIONS),
    }),
  }
);

function isLikelyBinaryCatCommand(command: string) {
  return /\bcat\s+[^;&|]*\.(?:oga|ogg|mp3|mp4|m4a|wav|flac|webm|mov|avi|mkv|png|jpe?g|gif|webp|pdf|zip|gz|tar|7z)\b/i
    .test(command);
}

export const runTerminalTool = tool(
  async ({ command, template_id }) => {
    try {
      if (isLikelyBinaryCatCommand(command)) {
        return "Refused to dump a binary/media file to terminal output. Use ls/stat/file/ffprobe for verification or get_sandbox_file_url to return the file.";
      }

      const denied = await ensureApproval(command, "Shell command requested by the agent.");
      if (denied) return denied;

      const templateId = selectTemplateForTask("terminal", command, template_id);
      const exec = await runWithSandboxRetry<{ stdout?: string; stderr?: string }>(templateId, (liveSandbox) =>
        liveSandbox.commands.run(command, {
          timeoutMs: 120_000,
          requestTimeoutMs: 120_000,
        })
      );
      return `stdout:\n${exec.stdout ?? ""}\nstderr:\n${exec.stderr ?? ""}`;
    } catch (e: any) {
      return formatCommandError(e, "Command");
    }
  },
  {
    name: "run_terminal",
    description: "Run a bash shell command in an isolated sandbox.",
    schema: z.object({
      command: z.string().describe("The bash command to execute."),
      template_id: z.string().optional().describe(TEMPLATE_DESCRIPTIONS),
    }),
  }
);

export const runNodeTool = tool(
  async ({ code, template_id }) => {
    try {
      const templateId = selectTemplateForTask("node", code, template_id);
      const execution = await runWithSandboxRetry<{ stdout?: string; stderr?: string }>(templateId, async (liveSandbox) => {
        const filePath = `/home/user/candle_node_${Date.now()}.js`;
        await liveSandbox.files.write(filePath, code, { requestTimeoutMs: 60_000 });
        return liveSandbox.commands.run(`node ${shellQuote(filePath)}`, {
          timeoutMs: 120_000,
          requestTimeoutMs: 120_000,
        });
      });
      const stdout = execution.stdout?.trim();
      const stderr = execution.stderr?.trim();
      return [
        stdout ? `stdout:\n${stdout}` : "",
        stderr ? `stderr:\n${stderr}` : "",
      ].filter(Boolean).join("\n\n") || "Node.js finished successfully with no output.";
    } catch (e: any) {
      return formatCommandError(e, "Node.js execution");
    }
  },
  {
    name: "run_node",
    description: "Execute Node.js/JavaScript code in the isolated E2B sandbox.",
    schema: z.object({
      code: z.string().describe("The JavaScript code to execute with Node.js."),
      template_id: z.string().optional().describe(TEMPLATE_DESCRIPTIONS),
    }),
  }
);

export const installPackagesTool = tool(
  async ({ manager, packages, template_id }) => {
    try {
      validatePackageNames(packages);
      const templateId = selectTemplateForTask("install packages", packages.join(" "), template_id);
      const quoted = packages.map(shellQuote).join(" ");
      const command = manager === "pip"
        ? `python3 -m pip install -q ${quoted}`
        : manager === "npm"
          ? `mkdir -p /home/user/.candle_node && npm install --prefix /home/user/.candle_node ${quoted}`
          : `apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y ${quoted}`;

      // apt can change system state outside /home/user — prompt the user
      // before running. pip/npm install only into the project dirs and skip
      // the prompt by classifying as low risk.
      if (manager === "apt") {
        const denied = await ensureApproval(command, `Install apt packages: ${packages.join(", ")}`);
        if (denied) return denied;
      }

      const exec = await runWithSandboxRetry<{ stdout?: string; stderr?: string }>(templateId, (liveSandbox) =>
        liveSandbox.commands.run(command, {
          timeoutMs: 240_000,
          requestTimeoutMs: 240_000,
        })
      );
      return JSON.stringify({
        manager,
        packages,
        stdout: (exec.stdout ?? "").slice(-4000),
        stderr: (exec.stderr ?? "").slice(-4000),
      });
    } catch (e: any) {
      return `Failed to install packages: ${e.message}`;
    }
  },
  {
    name: "install_packages",
    description: "Install Python, Node, or apt packages in the current E2B sandbox when a task needs extra runtime capabilities.",
    schema: z.object({
      manager: z.enum(["pip", "npm", "apt"]).describe("Package manager to use."),
      packages: z.array(z.string()).min(1).max(20).describe("Package names to install."),
      template_id: z.string().optional().describe(TEMPLATE_DESCRIPTIONS),
    }),
  }
);

export const inspectSandboxFileTool = tool(
  async ({ path: filePath, template_id }) => {
    try {
      const templateId = selectTemplateForCurrentSandbox("inspect file", filePath, template_id);
      const command = [
        `python3 - <<'PY'`,
        `import hashlib, json, mimetypes, os, pathlib`,
        `p = pathlib.Path(${JSON.stringify(filePath)})`,
        `if not p.exists(): raise FileNotFoundError(str(p))`,
        `data = p.read_bytes() if p.is_file() else b""`,
        `print(json.dumps({`,
        `  "path": str(p),`,
        `  "exists": p.exists(),`,
        `  "type": "directory" if p.is_dir() else "file",`,
        `  "sizeBytes": p.stat().st_size,`,
        `  "mimeGuess": mimetypes.guess_type(str(p))[0],`,
        `  "sha256": hashlib.sha256(data).hexdigest() if p.is_file() else None,`,
        `  "children": sorted([x.name for x in p.iterdir()])[:100] if p.is_dir() else None,`,
        `}, ensure_ascii=False))`,
        `PY`,
      ].join("\n");
      const exec = await runWithSandboxRetry<{ stdout?: string; stderr?: string }>(templateId, (liveSandbox) =>
        liveSandbox.commands.run(command, { timeoutMs: 60_000, requestTimeoutMs: 60_000 })
      );
      return exec.stdout?.trim() || exec.stderr?.trim() || "File inspected.";
    } catch (e: any) {
      return `Failed to inspect sandbox file: ${e.message}`;
    }
  },
  {
    name: "inspect_sandbox_file",
    description: "Inspect a sandbox file or directory without dumping binary contents. Returns size, type, MIME guess, checksum, and directory children.",
    schema: z.object({
      path: z.string().describe("Absolute path inside the sandbox."),
      template_id: z.string().optional().describe(TEMPLATE_DESCRIPTIONS),
    }),
  }
);

export const readSandboxFileTool = tool(
  async ({ path: filePath, max_bytes, template_id }) => {
    try {
      const blocked = getReadBlockError(filePath);
      if (blocked) return blocked;
      const limit = Math.min(Math.max(Number(max_bytes || 8000), 1), 64_000);
      const templateId = selectTemplateForCurrentSandbox("read file", filePath, template_id);
      const command = [
        `python3 - <<'PY'`,
        `import pathlib`,
        `p = pathlib.Path(${JSON.stringify(filePath)})`,
        `data = p.read_bytes()[:${limit}]`,
        `print(data.decode("utf-8", errors="replace"))`,
        `PY`,
      ].join("\n");
      const exec = await runWithSandboxRetry<{ stdout?: string; stderr?: string }>(templateId, (liveSandbox) =>
        liveSandbox.commands.run(command, { timeoutMs: 60_000, requestTimeoutMs: 60_000 })
      );
      return exec.stdout ?? exec.stderr ?? "";
    } catch (e: any) {
      return `Failed to read sandbox file: ${e.message}`;
    }
  },
  {
    name: "read_sandbox_file",
    description: "Read a bounded UTF-8 preview of a text file from the E2B sandbox.",
    schema: z.object({
      path: z.string().describe("Absolute path inside the sandbox."),
      max_bytes: z.number().optional().describe("Maximum bytes to read. Defaults to 8000; hard limit 64000."),
      template_id: z.string().optional().describe(TEMPLATE_DESCRIPTIONS),
    }),
  }
);

export const writeSandboxFileTool = tool(
  async ({ path: filePath, content, encoding, template_id }) => {
    try {
      const blocked = getWriteBlockError(filePath);
      if (blocked) return blocked;
      const templateId = selectTemplateForCurrentSandbox("write file", filePath, template_id);
      const data = encoding === "base64"
        ? Uint8Array.from(Buffer.from(content, "base64"))
        : content;
      await runWithSandboxRetry(templateId, async (liveSandbox) => {
        await liveSandbox.commands.run(`mkdir -p ${shellQuote(filePath.split("/").slice(0, -1).join("/") || "/home/user")}`, {
          timeoutMs: 30_000,
          requestTimeoutMs: 30_000,
        });
        await liveSandbox.files.write(filePath, data, { requestTimeoutMs: 60_000 });
      });
      return JSON.stringify({ path: filePath, bytesWritten: encoding === "base64" ? Buffer.from(content, "base64").byteLength : Buffer.byteLength(content) });
    } catch (e: any) {
      return `Failed to write sandbox file: ${e.message}`;
    }
  },
  {
    name: "write_sandbox_file",
    description: "Write a text or base64 file directly into the E2B sandbox for later execution or processing.",
    schema: z.object({
      path: z.string().describe("Absolute path inside the sandbox."),
      content: z.string().describe("File content as text or base64."),
      encoding: z.enum(["text", "base64"]).optional().describe("Content encoding. Defaults to text."),
      template_id: z.string().optional().describe(TEMPLATE_DESCRIPTIONS),
    }),
  }
);

export const manageSandboxFilesTool = tool(
  async ({ action, path: sourcePath, target_path, template_id }) => {
    try {
      // Destructive actions cross the approval gate. Mkdir/copy/zip stay
      // free since they only add files inside /home/user.
      if (action === "delete" || action === "move") {
        const denied = await ensureApproval(
          `manage_sandbox_files ${action} ${sourcePath}${target_path ? ` -> ${target_path}` : ""}`,
          `Destructive file operation (${action}) on ${sourcePath}.`
        );
        if (denied) return denied;
      }

      const templateId = selectTemplateForCurrentSandbox("manage files", sourcePath, template_id);
      const command = [
        `python3 - <<'PY'`,
        `import json, os, pathlib, shutil, tarfile, zipfile`,
        `action = ${JSON.stringify(action)}`,
        `source = pathlib.Path(${JSON.stringify(sourcePath)})`,
        `target = pathlib.Path(${JSON.stringify(target_path || "")}) if ${target_path ? "True" : "False"} else None`,
        `def guard_delete(p):`,
        `    resolved = str(p.resolve())`,
        `    if not resolved.startswith("/home/user/") and resolved != "/home/user":`,
        `        raise ValueError("delete is restricted to /home/user paths")`,
        `if action == "mkdir":`,
        `    source.mkdir(parents=True, exist_ok=True)`,
        `elif action == "copy":`,
        `    if target is None: raise ValueError("target_path is required")`,
        `    target.parent.mkdir(parents=True, exist_ok=True)`,
        `    shutil.copytree(source, target, dirs_exist_ok=True) if source.is_dir() else shutil.copy2(source, target)`,
        `elif action == "move":`,
        `    if target is None: raise ValueError("target_path is required")`,
        `    target.parent.mkdir(parents=True, exist_ok=True)`,
        `    shutil.move(str(source), str(target))`,
        `elif action == "delete":`,
        `    guard_delete(source)`,
        `    shutil.rmtree(source) if source.is_dir() else source.unlink(missing_ok=True)`,
        `elif action == "zip":`,
        `    if target is None: raise ValueError("target_path is required")`,
        `    target.parent.mkdir(parents=True, exist_ok=True)`,
        `    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as z:`,
        `        if source.is_dir():`,
        `            for item in source.rglob("*"):`,
        `                if item.is_file(): z.write(item, item.relative_to(source))`,
        `        else:`,
        `            z.write(source, source.name)`,
        `elif action == "unzip":`,
        `    if target is None: raise ValueError("target_path is required")`,
        `    target.mkdir(parents=True, exist_ok=True)`,
        `    with zipfile.ZipFile(source) as z: z.extractall(target)`,
        `else:`,
        `    raise ValueError(f"unsupported action: {action}")`,
        `out = target if target is not None and action != "mkdir" else source`,
        `print(json.dumps({"action": action, "path": str(source), "targetPath": str(target) if target else None, "exists": out.exists()}, ensure_ascii=False))`,
        `PY`,
      ].join("\n");
      const exec = await runWithSandboxRetry<{ stdout?: string; stderr?: string }>(templateId, (liveSandbox) =>
        liveSandbox.commands.run(command, { timeoutMs: 120_000, requestTimeoutMs: 120_000 })
      );
      return exec.stdout?.trim() || exec.stderr?.trim() || "File operation completed.";
    } catch (e: any) {
      return `Failed to manage sandbox files: ${e.message}`;
    }
  },
  {
    name: "manage_sandbox_files",
    description: "Create directories, copy, move, delete, zip, or unzip files inside the E2B sandbox. Delete is restricted to /home/user.",
    schema: z.object({
      action: z.enum(["mkdir", "copy", "move", "delete", "zip", "unzip"]).describe("File operation to perform."),
      path: z.string().describe("Source path inside the sandbox."),
      target_path: z.string().optional().describe("Target path for copy, move, zip, or unzip."),
      template_id: z.string().optional().describe(TEMPLATE_DESCRIPTIONS),
    }),
  }
);

export const httpRequestTool = tool(
  async ({ url, method, headers, body, timeout_ms }) => {
    const httpMethod = (method || "GET").toUpperCase();
    // Mutating HTTP methods cross the approval gate. Read-only verbs (GET,
    // HEAD) skip the prompt — they're equivalent to browse_web in side-
    // effect terms.
    if (httpMethod !== "GET" && httpMethod !== "HEAD") {
      const denied = await ensureApproval(
        `http_request ${httpMethod} ${url}`,
        `Mutating HTTP request — ${httpMethod} can change remote state.`
      );
      if (denied) return denied;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(Math.max(timeout_ms || 30_000, 1000), 120_000));
    try {
      const response = await fetch(url, {
        method: httpMethod,
        headers,
        body,
        signal: controller.signal,
      });
      const responseHeaders = Object.fromEntries(
        [...response.headers.entries()].filter(([key]) => !/cookie|authorization|token|secret/i.test(key))
      );
      const text = await response.text();
      return JSON.stringify({
        url: response.url,
        status: response.status,
        ok: response.ok,
        headers: responseHeaders,
        bodyPreview: text.slice(0, 8000),
        truncated: text.length > 8000,
      });
    } catch (e: any) {
      return `HTTP request failed: ${e.message}`;
    } finally {
      clearTimeout(timeout);
    }
  },
  {
    name: "http_request",
    description: "Make an HTTP/API request from the backend when browser rendering is unnecessary. Do not expose secrets in returned text.",
    schema: z.object({
      url: z.string().url().describe("Request URL."),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]).optional().describe("HTTP method. Defaults to GET."),
      headers: z.record(z.string(), z.string()).optional().describe("Optional request headers. Secret values are redacted before display."),
      body: z.string().optional().describe("Optional request body."),
      timeout_ms: z.number().optional().describe("Timeout in milliseconds. Defaults to 30000."),
    }),
  }
);

export const listE2BTemplatesTool = tool(
  async () => JSON.stringify({
    defaultTemplate: defaultE2BTemplate,
    currentTemplate,
    templates: E2B_TEMPLATES,
    note: "The agent may choose a template when it has a clear reason; otherwise the current/default sandbox is used.",
  }),
  {
    name: "list_e2b_templates",
    description: "List the E2B templates imported from the user's E2B dashboard.",
    schema: z.object({}),
  }
);

export const setE2BTemplateTool = tool(
  async ({ template }) => {
    const templateId = resolveTemplateId(template);
    const meta = E2B_TEMPLATES.find((item) => item.id === templateId);
    defaultE2BTemplate = templateId;
    if (sandbox && currentTemplate !== templateId) {
      await closeSandbox();
    }
    return JSON.stringify({ defaultTemplate: templateId, template: meta ?? null });
  },
  {
    name: "set_e2b_template",
    description:
      "Switch the active E2B sandbox template for subsequent tools. " +
      "ONLY the default 'candle-autonomous-agent' template ships the full Candle toolchain " +
      "(Playwright + Chromium browser profile, ffmpeg, tesseract/OCR, pandoc, poppler). " +
      "The other templates (codex, claude, desktop, etc.) are lighter coding-agent images WITHOUT that toolchain — " +
      "switching to one will make sandbox_browser, download_video, and screenshot_analyze fail. " +
      "Use this ONLY for a pure coding/terminal task that benefits from a specific environment, and switch back to the default before any browser/media/OCR work. " +
      "Switching also starts a FRESH sandbox: files in /home/user from the previous template are not carried over.",
    schema: z.object({
      template: z.string().describe("Template alias or ID, for example codex, claude, desktop, code-interpreter-v1, or an E2B template ID."),
    }),
  }
);

export const listSandboxFilesTool = tool(
  async ({ path: targetPath, template_id }) => {
    try {
      const templateId = selectTemplateForCurrentSandbox("list files", targetPath || "/home/user", template_id);
      const entries = await runWithSandboxRetry(templateId, (liveSandbox) =>
        liveSandbox.files.list(targetPath || "/home/user", {
          requestTimeoutMs: 30_000,
        })
      );
      const fileEntries = entries as any[];
      return JSON.stringify(fileEntries.map((entry: any) => ({
        name: entry.name,
        path: entry.path,
        type: entry.type,
        size: entry.size,
        modifiedTime: entry.modifiedTime,
      })));
    } catch (e: any) {
      return `Failed to list sandbox files: ${e.message}`;
    }
  },
  {
    name: "list_sandbox_files",
    description: "List files in the live E2B sandbox so you can find generated artifacts before returning them to the user.",
    schema: z.object({
      path: z.string().optional().describe("Directory path to list. Defaults to /home/user."),
      template_id: z.string().optional().describe(TEMPLATE_DESCRIPTIONS),
    }),
  }
);

export const getSandboxFileUrlTool = tool(
  async ({ path: filePath, template_id }) => {
    try {
      const templateId = selectTemplateForCurrentSandbox("download file url", filePath, template_id);
      const url = await runWithSandboxRetry(templateId, (liveSandbox) =>
        liveSandbox.downloadUrl(filePath, {
          requestTimeoutMs: 30_000,
        })
      );
      return JSON.stringify({ path: filePath, url });
    } catch (e: any) {
      return `Failed to create sandbox file download URL: ${e.message}`;
    }
  },
  {
    name: "get_sandbox_file_url",
    description: "Create a temporary download URL for a file produced inside the live E2B sandbox. Use this after creating/downloading/exporting an artifact.",
    schema: z.object({
      path: z.string().describe("Absolute path to the file inside the sandbox, for example /home/user/report.pdf."),
      template_id: z.string().optional().describe(TEMPLATE_DESCRIPTIONS),
    }),
  }
);

export const createArtifactTool = tool(
  async ({ filename, content, encoding, template_id }) => {
    try {
      const templateId = selectTemplateForTask("artifact", filename, template_id);
      const safeName = filename.replace(/\\/g, "/").replace(/^\/+/, "");
      const filePath = safeName.startsWith("home/user/")
        ? `/${safeName}`
        : `/home/user/artifacts/${safeName}`;
      const data = encoding === "base64"
        ? Uint8Array.from(Buffer.from(content, "base64"))
        : content;
      const result = await runWithSandboxRetry(templateId, async (liveSandbox) => {
        await liveSandbox.commands.run("mkdir -p /home/user/artifacts", {
          timeoutMs: 30_000,
          requestTimeoutMs: 30_000,
        });
        await liveSandbox.files.write(filePath, data, { requestTimeoutMs: 60_000 });
        const url = await liveSandbox.downloadUrl(filePath, { requestTimeoutMs: 30_000 });
        return { path: filePath, url };
      });
      return JSON.stringify(result);
    } catch (e: any) {
      return `Failed to create artifact: ${e.message}`;
    }
  },
  {
    name: "create_artifact",
    description: "Create a text or base64 file artifact in E2B and return a temporary download URL. Use for generated markdown, HTML, CSV, JSON, code files, docs sources, and small artifacts.",
    schema: z.object({
      filename: z.string().describe("Artifact filename, for example report.md, data.csv, app.tsx, deck.html."),
      content: z.string().describe("File content as text or base64."),
      encoding: z.enum(["text", "base64"]).optional().describe("Content encoding. Defaults to text."),
      template_id: z.string().optional().describe(TEMPLATE_DESCRIPTIONS),
    }),
  }
);

const CAPABILITY_FAMILIES = [
  "web research and browsing",
  "direct HTTP and API requests",
  "browser interaction and form workflows",
  "sandboxed Python, Node.js, and terminal execution",
  "sandbox package installation",
  "sandbox file reading, writing, inspection, archiving, and cleanup",
  "code generation, editing, debugging, testing, and builds",
  "data analysis, charts, and file transforms",
  "documents, presentations, spreadsheets, and other artifacts",
  "media processing and downloadable file results",
  "API requests, automation workflows, and verification",
] as const;

export const capabilityCatalogTool = tool(
  async ({ query }) => {
    const q = (query || "").toLowerCase();
    const matches = q
      ? CAPABILITY_FAMILIES.filter((item) => item.includes(q))
      : CAPABILITY_FAMILIES;
    return JSON.stringify({
      count: matches.length,
      matches,
      note: "Use the available tools directly; this catalog is only a broad orientation aid.",
    });
  },
  {
    name: "capability_catalog",
    description: "Show broad Candle tool families when the agent needs orientation.",
    schema: z.object({
      query: z.string().optional().describe("Optional broad capability search query."),
    }),
  }
);

export const downloadVideoTool = tool(
  async ({ url, max_height, template_id }) => {
    try {
      const templateId = selectTemplateForTask("video download", url, template_id);
      const height = Math.min(Math.max(Number(max_height || 720), 144), 1080);
      const result = await runWithSandboxRetry(templateId, async (liveSandbox) => {
        const code = `
import glob
import json
import os
import subprocess
import sys
import time

url = ${JSON.stringify(url)}
max_height = ${JSON.stringify(height)}
outdir = "/home/user/downloads"
os.makedirs(outdir, exist_ok=True)

package_dir = "/home/user/.candle_pip"
if package_dir not in sys.path:
    sys.path.insert(0, package_dir)
try:
    import yt_dlp
except Exception:
    os.makedirs(package_dir, exist_ok=True)
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--target", package_dir, "-q", "yt-dlp"])
    import importlib
    importlib.invalidate_caches()
    import yt_dlp

before = set(glob.glob(os.path.join(outdir, "*")))
format_selector = f"best[ext=mp4][height<={max_height}]/best[ext=mp4]/best"
options = {
    "outtmpl": os.path.join(outdir, "%(title).90s [%(id)s].%(ext)s"),
    "format": format_selector,
    "noplaylist": True,
    "quiet": True,
    "no_warnings": True,
    "restrictfilenames": True,
}

with yt_dlp.YoutubeDL(options) as ydl:
    info = ydl.extract_info(url, download=True)
    prepared = ydl.prepare_filename(info)

after = set(glob.glob(os.path.join(outdir, "*")))
created = sorted(after - before, key=lambda p: os.path.getmtime(p), reverse=True)
path = prepared if os.path.exists(prepared) else (created[0] if created else "")
if not path:
    candidates = sorted(glob.glob(os.path.join(outdir, "*")), key=lambda p: os.path.getmtime(p), reverse=True)
    path = candidates[0] if candidates else ""
if not path or not os.path.exists(path):
    raise RuntimeError("Download finished but no output file was found.")

payload = {
    "title": info.get("title") or os.path.basename(path),
    "path": path,
    "filename": os.path.basename(path),
    "sizeBytes": os.path.getsize(path),
    "duration": info.get("duration"),
    "ext": os.path.splitext(path)[1].lstrip(".") or info.get("ext"),
}
print("CANDLE_DOWNLOAD_RESULT=" + json.dumps(payload, ensure_ascii=False))
`;
        const scriptPath = `/home/user/candle_video_${Date.now()}.py`;
        await liveSandbox.files.write(scriptPath, code, { requestTimeoutMs: 60_000 });
        const execution = await liveSandbox.commands.run(`python3 ${scriptPath}`, {
          timeoutMs: 240_000,
          requestTimeoutMs: 240_000,
        });
        const logs = `${execution.stdout ?? ""}\n${execution.stderr ?? ""}`;
        const match = logs.match(/CANDLE_DOWNLOAD_RESULT=(\{.*\})/);
        if (!match) return { error: "Video downloaded, but the output metadata was not returned." };
        const data = JSON.parse(match[1]);
        const downloadUrl = await liveSandbox.downloadUrl(data.path, { requestTimeoutMs: 30_000 });
        return { ...data, url: downloadUrl };
      });

      if ((result as any).error) return `Failed to download video: ${(result as any).error}`;
      return JSON.stringify(result);
    } catch (e: any) {
      return `Failed to download video: ${e.message}`;
    }
  },
  {
    name: "download_video",
    description: "Create a downloadable file artifact from a public video URL when that is the appropriate tool for the task.",
    schema: z.object({
      url: z.string().describe("The video page URL to download."),
      max_height: z.number().optional().describe("Maximum video height. Defaults to 720."),
      template_id: z.string().optional().describe(TEMPLATE_DESCRIPTIONS),
    }),
  }
);

/**
 * Speech-to-text for audio attachments. GAIA (and real users) hand the agent
 * voice memos / recordings whose CONTENT is the answer — the agent must read
 * them, not tell the user to transcribe them. The sandbox has ffmpeg but no
 * local ASR model, so we call Cloudflare Workers AI Whisper (same account/key
 * as the primary LLM) over HTTP: read the file's bytes out of the sandbox,
 * base64-encode, POST to whisper-large-v3-turbo, return the transcript.
 */
export const transcribeAudioTool = tool(
  async ({ path: filePath, template_id }) => {
    const acct = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const key = process.env.CLOUDFLARE_API_KEY?.trim();
    if (!acct || !key) {
      return "Transcription unavailable: CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_KEY are not configured.";
    }
    try {
      const templateId = selectTemplateForCurrentSandbox("transcribe audio", filePath, template_id);
      // Pull the raw audio bytes out of the sandbox.
      const bytes: Uint8Array = await runWithSandboxRetry(templateId, (liveSandbox) =>
        liveSandbox.files.read(filePath, { format: "bytes", requestTimeoutMs: 120_000 })
      );
      if (!bytes || bytes.byteLength === 0) {
        return `Transcription failed: file at ${filePath} is empty or unreadable.`;
      }
      const b64 = Buffer.from(bytes).toString("base64");
      const url = `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/openai/whisper-large-v3-turbo`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ audio: b64 }),
      });
      const json: any = await resp.json().catch(() => null);
      if (!resp.ok || !json?.result) {
        const detail = json?.errors?.[0]?.message ?? `HTTP ${resp.status}`;
        return `Transcription failed: ${detail}`;
      }
      const text: string = (json.result.text ?? "").trim();
      if (!text) return "Transcription returned no speech (the audio may be silent or non-speech).";
      return JSON.stringify({ path: filePath, sizeBytes: bytes.byteLength, transcript: text });
    } catch (e: any) {
      return `Transcription failed: ${e?.message ?? e}`;
    }
  },
  {
    name: "transcribe_audio",
    description:
      "Transcribe a speech audio file (.mp3/.wav/.m4a/.ogg/.flac) that is staged inside the sandbox to text, using Cloudflare Whisper. " +
      "Use this whenever a task provides an audio attachment whose spoken content you need — never tell the user to transcribe it themselves.",
    schema: z.object({
      path: z.string().describe("Absolute path to the audio file INSIDE the sandbox (e.g. /home/user/gaia_files/memo.mp3)."),
      template_id: z.string().optional().describe(TEMPLATE_DESCRIPTIONS),
    }),
  }
);

// --- Kernel browser infrastructure ---
let _kernelClient: InstanceType<typeof Kernel> | null = null;
function getKernelClient() {
  if (!_kernelClient) {
    const apiKey = process.env.KERNEL_API_KEY?.trim();
    if (!apiKey) throw new Error("KERNEL_API_KEY is not set.");
    _kernelClient = new Kernel({ apiKey });
  }
  return _kernelClient;
}

function cleanGoogleUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, "https://www.google.com");
    const redirected = url.searchParams.get("q") || url.searchParams.get("url");
    return redirected ? decodeURIComponent(redirected) : url.toString();
  } catch {
    return rawUrl;
  }
}

function normalizeVisibleText(value: unknown, maxLength = 5000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function boundedSearchResultCount(maxResults?: number) {
  if (!Number.isFinite(maxResults)) return 10;
  return Math.max(1, Math.min(25, Math.floor(maxResults as number)));
}

/**
 * Map a query's time-sensitivity to a You.com / Brave freshness window.
 * Returns undefined for evergreen queries so we don't needlessly restrict
 * results. Keyword-only (no LLM) — runs on every search.
 */
function detectFreshness(query: string): "day" | "week" | "month" | undefined {
  const q = query.toLowerCase();
  if (/\b(today|breaking|right now|just now|this morning|latest news|live)\b/.test(q)) return "day";
  if (/\b(this week|past week|recent|recently|latest|current|now)\b/.test(q)) return "week";
  if (/\b(this month|past month|this year|2025|2026|upcoming|newest)\b/.test(q)) return "month";
  return undefined;
}

/** Map You.com-style freshness to a Brave `freshness` token (pd/pw/pm). */
function braveFreshnessToken(freshness?: string): string | undefined {
  if (freshness === "day") return "pd";
  if (freshness === "week") return "pw";
  if (freshness === "month") return "pm";
  return undefined;
}

function stripHtml(value: string) {
  return cheerio.load(`<div>${value}</div>`)("div").text().replace(/\s+/g, " ").trim();
}

/**
 * ============================================================================
 * SEARCH RESULT CACHE
 * ============================================================================
 * Avoids repeating the same query within a short window.
 */
const searchCache = new Map<string, { results: any[]; timestamp: number }>();
const SEARCH_CACHE_TTL_MS = Number(process.env.SEARCH_CACHE_TTL_MS) || 120_000; // 2 minutes

function getCachedSearch(query: string): any[] | null {
  const key = query.toLowerCase().trim();
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > SEARCH_CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  return entry.results;
}

function setCachedSearch(query: string, results: any[]) {
  const key = query.toLowerCase().trim();
  searchCache.set(key, { results, timestamp: Date.now() });
  // Evict old entries
  if (searchCache.size > 50) {
    const oldest = [...searchCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < 10; i++) searchCache.delete(oldest[i][0]);
  }
}

/**
 * ============================================================================
 * SEARCH PROVIDERS
 * ============================================================================
 */

async function searchViaYouCom(query: string, targetCount: number, opts?: { freshness?: string; country?: string }): Promise<any[] | null> {
  const apiKey = process.env.YOUCOM_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const params = new URLSearchParams({
      query,
      count: String(Math.min(Math.max(targetCount, 1), 20)),
      // Maximise the paid You.com plan: unrestricted results (the app is for
      // an adult user who is responsible for their own use — matches the
      // agent's permissive scope), default English-friendly moderation off.
      safesearch: (process.env.YOUCOM_SAFESEARCH || "off").trim(),
    });
    // Time-sensitivity: when the caller detected a "latest/today/news" intent,
    // pass freshness so You.com returns fresh pages instead of stale ones.
    if (opts?.freshness) params.set("freshness", opts.freshness);
    if (opts?.country || process.env.YOUCOM_COUNTRY) {
      params.set("country", (opts?.country || process.env.YOUCOM_COUNTRY || "").trim());
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    let response: Response;
    try {
      response = await fetch(`https://ydc-index.io/v1/search?${params.toString()}`, {
        method: "GET",
        headers: {
          "X-API-Key": apiKey,
          "Accept": "application/json",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) return null;

    const data = (await response.json()) as any;
    const webResults: any[] = data?.results?.web ?? data?.hits ?? [];
    const newsResults: any[] = data?.results?.news ?? [];

    const merged: any[] = [];
    for (const r of webResults) {
      const snippet = (r.snippets && r.snippets.join(" ")) || r.description || "";
      merged.push({
        title: r.title || "",
        url: r.url || "",
        snippet: snippet.slice(0, 400),
        publishedDate: r.page_age || null,
        source: "you.com",
      });
    }
    for (const r of newsResults) {
      merged.push({
        title: r.title || "",
        url: r.url || "",
        snippet: (r.description || "").slice(0, 400),
        publishedDate: r.page_age || null,
        source: "you.com:news",
      });
    }

    if (merged.length === 0) return null;
    return merged.slice(0, targetCount).map((r, i) => ({ rank: i + 1, ...r }));
  } catch {
    return null;
  }
}

interface YouSource {
  url: string;
  title: string;
  snippets?: string[];
}

interface YouResearchResult {
  content: string;
  sources: YouSource[];
}

/**
 * You.com Research API — does search + fetch + read + synthesize server-side in
 * ONE call, returning a cited answer plus its sources. We hand the synthesized
 * content + sources back to the agent's own model so IT writes the final reply
 * (in the user's language / Candle's voice) — you.com does the legwork, Kimi
 * stays the author.
 */
async function youResearch(
  input: string,
  effort: "lite" | "standard" | "deep" | "exhaustive",
  endpoint: "research" | "finance_research",
  freshness?: string,
): Promise<YouResearchResult | null> {
  const apiKey = process.env.YOUCOM_API_KEY?.trim();
  if (!apiKey) return null;

  const body: Record<string, unknown> = { input: input.slice(0, 40_000), research_effort: effort };
  if (endpoint === "research" && freshness) {
    body.source_control = { freshness };
  }

  // Deep research can take a while server-side; give it a generous ceiling.
  const timeoutMs = effort === "exhaustive" ? 290_000 : effort === "deep" ? 180_000 : 90_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`https://api.you.com/v1/${endpoint}`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`you.com ${endpoint} HTTP ${response.status}: ${detail.slice(0, 200)}`);
    }
    const data = (await response.json()) as any;
    const out = data?.output ?? {};
    const content = typeof out.content === "string" ? out.content : JSON.stringify(out.content ?? "");
    const sources: YouSource[] = Array.isArray(out.sources)
      ? out.sources.map((s: any) => ({
          url: String(s?.url ?? ""),
          title: String(s?.title ?? ""),
          snippets: Array.isArray(s?.snippets) ? s.snippets.slice(0, 3) : undefined,
        }))
      : [];
    if (!content) return null;
    return { content, sources };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * You.com Contents API — fetch full page content (markdown) for one or more
 * URLs in a single call. No browser. Returns null when nothing usable comes
 * back so callers can fall back to a plain HTTP fetch or the stealth browser.
 */
async function fetchViaYouContents(
  url: string,
  maxChars: number,
): Promise<{ url: string; title: string; markdown: string } | null> {
  const apiKey = process.env.YOUCOM_API_KEY?.trim();
  if (!apiKey) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch("https://ydc-index.io/v1/contents", {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ urls: [url], formats: ["markdown", "metadata"], crawl_timeout: 15 }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as any;
    const first = Array.isArray(data) ? data[0] : (Array.isArray(data?.results) ? data.results[0] : null);
    if (!first) return null;
    const markdown = typeof first.markdown === "string" ? first.markdown : "";
    if (!markdown.trim()) return null;
    return {
      url: String(first.url ?? url),
      title: String(first.title ?? first.metadata?.site_name ?? ""),
      markdown: markdown.slice(0, maxChars),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * You.com Contents API — batch-fetch full page content (markdown) for MANY
 * URLs in ONE HTTP call. This is what lets `search_web` read the top results in
 * parallel instead of issuing a separate browse_web round-trip per page. Each
 * returned item is { url, title, markdown } (markdown trimmed to maxCharsPerPage);
 * pages that fail to crawl are silently dropped.
 */
async function fetchManyViaYouContents(
  urls: string[],
  maxCharsPerPage: number,
): Promise<{ url: string; title: string; markdown: string }[]> {
  const apiKey = process.env.YOUCOM_API_KEY?.trim();
  if (!apiKey || urls.length === 0) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch("https://ydc-index.io/v1/contents", {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ urls: urls.slice(0, 10), formats: ["markdown", "metadata"], crawl_timeout: 15 }),
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const data = (await response.json()) as any;
    const items: any[] = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
    const out: { url: string; title: string; markdown: string }[] = [];
    for (const item of items) {
      const markdown = typeof item?.markdown === "string" ? item.markdown : "";
      if (!markdown.trim()) continue;
      out.push({
        url: String(item.url ?? ""),
        title: String(item.title ?? item.metadata?.site_name ?? ""),
        markdown: markdown.slice(0, maxCharsPerPage),
      });
    }
    return out;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function searchViaDuckDuckGo(query: string, targetCount: number): Promise<any[] | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    // DuckDuckGo HTML lite endpoint (no API key needed)
    const params = new URLSearchParams({ q: query, kl: "us-en" });
    let response: Response;
    try {
      response = await fetch(`https://html.duckduckgo.com/html/?${params.toString()}`, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          "Accept": "text/html",
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);
    const results: any[] = [];

    $(".result").each((_, el) => {
      if (results.length >= targetCount) return;
      const titleEl = $(el).find(".result__a");
      const snippetEl = $(el).find(".result__snippet");
      const title = titleEl.text().trim();
      let url = titleEl.attr("href") || "";

      // DuckDuckGo wraps URLs in a redirect
      if (url.startsWith("//duckduckgo.com/l/?uddg=")) {
        try {
          const parsed = new URL(`https:${url}`);
          url = decodeURIComponent(parsed.searchParams.get("uddg") || url);
        } catch {}
      }

      if (!title || !url || !/^https?:\/\//.test(url)) return;

      results.push({
        rank: results.length + 1,
        title,
        url,
        snippet: snippetEl.text().trim().slice(0, 400),
        source: "duckduckgo",
      });
    });

    return results.length > 0 ? results : null;
  } catch {
    return null;
  }
}

async function searchViaBrave(query: string, targetCount: number, opts?: { freshness?: string }): Promise<any[] | null> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(targetCount, 20)),
      text_decorations: "false",
      search_lang: "en",
    });
    const freshToken = braveFreshnessToken(opts?.freshness);
    if (freshToken) params.set("freshness", freshToken);

    let response: Response;
    try {
      response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params.toString()}`, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "X-Subscription-Token": apiKey,
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) return null;

    const data = (await response.json()) as any;
    const webResults: any[] = data?.web?.results ?? [];

    if (webResults.length === 0) return null;

    return webResults.slice(0, targetCount).map((r, i) => ({
      rank: i + 1,
      title: r.title || "",
      url: r.url || "",
      snippet: (r.description || "").slice(0, 400),
      publishedDate: r.page_age || r.age || null,
      source: "brave",
    }));
  } catch {
    return null;
  }
}

async function searchGoogleCustomSearch(query: string, targetCount: number) {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY?.trim();
  const cx = process.env.GOOGLE_SEARCH_CX?.trim();
  if (!apiKey || !cx) return undefined;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    const results: any[] = [];
    try {
      for (let start = 1; results.length < targetCount && start <= 91; start += 10) {
        const url = new URL("https://www.googleapis.com/customsearch/v1");
        url.searchParams.set("key", apiKey);
        url.searchParams.set("cx", cx);
        url.searchParams.set("q", query);
        url.searchParams.set("num", String(Math.min(10, targetCount - results.length)));
        url.searchParams.set("start", String(start));

        const response = await fetch(url, { signal: controller.signal });
        const payload = await response.json() as any;

        if (!response.ok) {
          console.warn(`[search:google] API error ${response.status}: ${payload?.error?.message || ""}`);
          break;
        }

        const items = Array.isArray(payload.items) ? payload.items : [];
        if (!items.length) break;
        for (const item of items) {
          if (results.length >= targetCount) break;
          const resultUrl = String(item.link || "");
          if (!/^https?:\/\//i.test(resultUrl)) continue;
          results.push({
            rank: results.length + 1,
            title: String(item.title || "").trim(),
            url: resultUrl,
            snippet: stripHtml(String(item.htmlSnippet || item.snippet || "")).slice(0, 400),
            source: "google_api",
          });
        }
      }
    } finally {
      clearTimeout(timeout);
    }

    return results.length > 0 ? results : undefined;
  } catch {
    return undefined;
  }
}

function isGoogleInternalUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname === "google.com" || hostname.endsWith(".google.com") || hostname === "gstatic.com";
  } catch {
    return true;
  }
}




async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type KernelSession = { session_id: string; browser_live_view_url?: string };

async function withKernelBrowser<T>(
  task: (sessionId: string, session: KernelSession) => Promise<T>,
  opts?: { mobile?: boolean; timeoutMs?: number; headless?: boolean; useResidentialProxy?: boolean }
): Promise<T> {
  const kernel = getKernelClient();
  const timeoutMs = opts?.timeoutMs ?? 45_000;
  const timeoutSec = Math.max(10, Math.ceil(timeoutMs / 1000));
  const mobile = opts?.mobile ?? false;

  let proxyId: string | undefined;
  if (opts?.useResidentialProxy) {
    // If the create call resolves AFTER our timeout rejected, we'd otherwise
    // leak the proxy (residential proxies have no quick self-expiry). Attach a
    // late-cleanup so a slow-but-successful create is still torn down.
    const proxyPromise = kernel.proxies.create({ type: "residential", config: { country: "US" }, name: "candle-search" });
    try {
      const proxy = await withTimeout(proxyPromise, 15_000, "Kernel residential proxy creation");
      proxyId = proxy.id;
    } catch (err) {
      void proxyPromise.then((p) => { if (p?.id) kernel.proxies.delete(p.id).catch(() => undefined); }).catch(() => undefined);
      throw err;
    }
  }

  const browserPromise = kernel.browsers.create({
    stealth: true,
    headless: opts?.headless ?? true,
    timeout_seconds: timeoutSec,
    viewport: mobile ? { width: 390, height: 844 } : { width: 1365, height: 900 },
    ...(proxyId ? { proxy_id: proxyId } : {}),
  });
  let session: KernelSession;
  try {
    session = await withTimeout(browserPromise, 20_000, "Kernel browser creation");
  } catch (err) {
    // Late-resolving browser create → tear it down so it doesn't linger.
    void browserPromise.then((s) => kernel.browsers.deleteByID(s.session_id).catch(() => undefined)).catch(() => undefined);
    if (proxyId) await kernel.proxies.delete(proxyId).catch(() => undefined);
    throw err;
  }

  try {
    return await withTimeout(task(session.session_id, session), timeoutMs, "Kernel browser task");
  } finally {
    await kernel.browsers.deleteByID(session.session_id).catch(() => undefined);
    if (proxyId) await kernel.proxies.delete(proxyId).catch(() => undefined);
  }
}

async function kernelPlaywright(sessionId: string, code: string, timeoutSec = 60): Promise<any> {
  const kernel = getKernelClient();
  const response = await kernel.browsers.playwright.execute(sessionId, { code, timeout_sec: timeoutSec });
  if (!response.success) {
    throw new Error(`Playwright execution failed: ${response.error || response.stderr || "unknown error"}`);
  }
  return response.result;
}

interface AppInfo {
  name: string;
  publisher: string;
  android?: { packageId: string };
  ios?: { appId: string; bundleId?: string };
  official?: string;
}

const APP_ALIASES: Record<string, AppInfo> = {
  // Supercell
  "coc": { name: "Clash of Clans", publisher: "Supercell", android: { packageId: "com.supercell.clashofclans" }, ios: { appId: "529479190", bundleId: "com.supercell.magic" }, official: "https://supercell.com/en/games/clashofclans/" },
  "clash of clans": { name: "Clash of Clans", publisher: "Supercell", android: { packageId: "com.supercell.clashofclans" }, ios: { appId: "529479190", bundleId: "com.supercell.magic" }, official: "https://supercell.com/en/games/clashofclans/" },
  "clash royale": { name: "Clash Royale", publisher: "Supercell", android: { packageId: "com.supercell.clashroyale" }, ios: { appId: "1053012308", bundleId: "com.supercell.scroll" }, official: "https://supercell.com/en/games/clashroyale/" },
  "cr": { name: "Clash Royale", publisher: "Supercell", android: { packageId: "com.supercell.clashroyale" }, ios: { appId: "1053012308", bundleId: "com.supercell.scroll" }, official: "https://supercell.com/en/games/clashroyale/" },
  "brawl stars": { name: "Brawl Stars", publisher: "Supercell", android: { packageId: "com.supercell.brawlstars" }, ios: { appId: "1229016807", bundleId: "com.supercell.laser" }, official: "https://supercell.com/en/games/brawlstars/" },
  "bs": { name: "Brawl Stars", publisher: "Supercell", android: { packageId: "com.supercell.brawlstars" }, ios: { appId: "1229016807", bundleId: "com.supercell.laser" }, official: "https://supercell.com/en/games/brawlstars/" },
  // Social
  "telegram": { name: "Telegram", publisher: "Telegram FZ-LLC", android: { packageId: "org.telegram.messenger" }, ios: { appId: "686449807", bundleId: "ph.telegra.Telegraph" }, official: "https://telegram.org/" },
  "whatsapp": { name: "WhatsApp", publisher: "Meta", android: { packageId: "com.whatsapp" }, ios: { appId: "310633997", bundleId: "net.whatsapp.WhatsApp" }, official: "https://www.whatsapp.com/" },
  "instagram": { name: "Instagram", publisher: "Meta", android: { packageId: "com.instagram.android" }, ios: { appId: "389801252", bundleId: "com.burbn.instagram" }, official: "https://www.instagram.com/" },
  "facebook": { name: "Facebook", publisher: "Meta", android: { packageId: "com.facebook.katana" }, ios: { appId: "284882215", bundleId: "com.facebook.Facebook" }, official: "https://www.facebook.com/" },
  "messenger": { name: "Messenger", publisher: "Meta", android: { packageId: "com.facebook.orca" }, ios: { appId: "454638411", bundleId: "com.facebook.Messenger" } },
  "tiktok": { name: "TikTok", publisher: "ByteDance", android: { packageId: "com.zhiliaoapp.musically" }, ios: { appId: "835599320", bundleId: "com.zhiliaoapp.musically" } },
  "twitter": { name: "X (Twitter)", publisher: "X Corp", android: { packageId: "com.twitter.android" }, ios: { appId: "333903271", bundleId: "com.atebits.Tweetie2" } },
  "x": { name: "X (Twitter)", publisher: "X Corp", android: { packageId: "com.twitter.android" }, ios: { appId: "333903271", bundleId: "com.atebits.Tweetie2" } },
  "snapchat": { name: "Snapchat", publisher: "Snap Inc", android: { packageId: "com.snapchat.android" }, ios: { appId: "447188370", bundleId: "com.toyopagroup.picaboo" } },
  "discord": { name: "Discord", publisher: "Discord Inc", android: { packageId: "com.discord" }, ios: { appId: "985746746", bundleId: "com.hammerandchisel.discord" } },
  "reddit": { name: "Reddit", publisher: "Reddit Inc", android: { packageId: "com.reddit.frontpage" }, ios: { appId: "1064216828", bundleId: "com.reddit.Reddit" } },
  "threads": { name: "Threads", publisher: "Meta", android: { packageId: "com.instagram.barcelona" }, ios: { appId: "6446901002", bundleId: "com.burbn.barcelona" } },
  "signal": { name: "Signal", publisher: "Signal Foundation", android: { packageId: "org.thoughtcrime.securesms" }, ios: { appId: "874139669", bundleId: "org.whispersystems.signal" } },
  // Productivity
  "gmail": { name: "Gmail", publisher: "Google", android: { packageId: "com.google.android.gm" }, ios: { appId: "422689480", bundleId: "com.google.Gmail" } },
  "google maps": { name: "Google Maps", publisher: "Google", android: { packageId: "com.google.android.apps.maps" }, ios: { appId: "585027354", bundleId: "com.google.Maps" } },
  "chrome": { name: "Chrome", publisher: "Google", android: { packageId: "com.android.chrome" }, ios: { appId: "535886823", bundleId: "com.google.chrome.ios" } },
  "youtube": { name: "YouTube", publisher: "Google", android: { packageId: "com.google.android.youtube" }, ios: { appId: "544007664", bundleId: "com.google.ios.youtube" } },
  "spotify": { name: "Spotify", publisher: "Spotify AB", android: { packageId: "com.spotify.music" }, ios: { appId: "324684580", bundleId: "com.spotify.client" } },
  "netflix": { name: "Netflix", publisher: "Netflix Inc", android: { packageId: "com.netflix.mediaclient" }, ios: { appId: "363590051", bundleId: "com.netflix.Netflix" } },
  "notion": { name: "Notion", publisher: "Notion Labs", android: { packageId: "notion.id" }, ios: { appId: "1232780281", bundleId: "notion.id" } },
  "slack": { name: "Slack", publisher: "Salesforce", android: { packageId: "com.Slack" }, ios: { appId: "618783545", bundleId: "com.tinyspeck.chatlyio" } },
  // Games
  "pubg": { name: "PUBG Mobile", publisher: "Tencent", android: { packageId: "com.tencent.ig" }, ios: { appId: "1330123889", bundleId: "com.tencent.ig" } },
  "pubg mobile": { name: "PUBG Mobile", publisher: "Tencent", android: { packageId: "com.tencent.ig" }, ios: { appId: "1330123889", bundleId: "com.tencent.ig" } },
  "free fire": { name: "Free Fire", publisher: "Garena", android: { packageId: "com.dts.freefireth" }, ios: { appId: "1300146617", bundleId: "com.dts.freefireth" } },
  "genshin impact": { name: "Genshin Impact", publisher: "miHoYo", android: { packageId: "com.miHoYo.GenshinImpact" }, ios: { appId: "1517783697", bundleId: "com.miHoYo.GenshinImpact" } },
  "genshin": { name: "Genshin Impact", publisher: "miHoYo", android: { packageId: "com.miHoYo.GenshinImpact" }, ios: { appId: "1517783697", bundleId: "com.miHoYo.GenshinImpact" } },
  "mobile legends": { name: "Mobile Legends", publisher: "Moonton", android: { packageId: "com.mobile.legends" }, ios: { appId: "1160056295", bundleId: "com.mobile.legends" } },
  "ml": { name: "Mobile Legends", publisher: "Moonton", android: { packageId: "com.mobile.legends" }, ios: { appId: "1160056295", bundleId: "com.mobile.legends" } },
  "mlbb": { name: "Mobile Legends", publisher: "Moonton", android: { packageId: "com.mobile.legends" }, ios: { appId: "1160056295", bundleId: "com.mobile.legends" } },
  "candy crush": { name: "Candy Crush Saga", publisher: "King", android: { packageId: "com.king.candycrushsaga" }, ios: { appId: "553834731", bundleId: "com.king.candycrushsaga" } },
  "among us": { name: "Among Us", publisher: "Innersloth", android: { packageId: "com.innersloth.spacemafia" }, ios: { appId: "1351168404", bundleId: "com.innersloth.amongus" } },
  "minecraft": { name: "Minecraft", publisher: "Mojang", android: { packageId: "com.mojang.minecraftpe" }, ios: { appId: "479516143", bundleId: "com.mojang.minecraftpe" } },
  "roblox": { name: "Roblox", publisher: "Roblox Corporation", android: { packageId: "com.roblox.client" }, ios: { appId: "431946152", bundleId: "com.roblox.robloxmobile" } },
  "subway surfers": { name: "Subway Surfers", publisher: "SYBO Games", android: { packageId: "com.kiloo.subwaysurf" }, ios: { appId: "512939461", bundleId: "com.kiloo.subwaysurf" } },
  "call of duty mobile": { name: "Call of Duty: Mobile", publisher: "Activision", android: { packageId: "com.activision.callofduty.shooter" }, ios: { appId: "1287282214", bundleId: "com.activision.callofduty.shooter" } },
  "cod mobile": { name: "Call of Duty: Mobile", publisher: "Activision", android: { packageId: "com.activision.callofduty.shooter" }, ios: { appId: "1287282214", bundleId: "com.activision.callofduty.shooter" } },
  "fortnite": { name: "Fortnite", publisher: "Epic Games", android: { packageId: "com.epicgames.fortnite" }, ios: { appId: "1261357853", bundleId: "com.epicgames.fortnite" } },
  // Utilities
  "vpn": { name: "1.1.1.1 (Cloudflare WARP)", publisher: "Cloudflare", android: { packageId: "com.cloudflare.onedotonedotonedotone" }, ios: { appId: "1423538627", bundleId: "com.cloudflare.1dot1dot1dot1" } },
  "shazam": { name: "Shazam", publisher: "Apple", android: { packageId: "com.shazam.android" }, ios: { appId: "284993459", bundleId: "com.shazam.Shazam" } },
  "zoom": { name: "Zoom", publisher: "Zoom", android: { packageId: "us.zoom.videomeetings" }, ios: { appId: "546505307", bundleId: "us.zoom.videomeetings" } },
  "capcut": { name: "CapCut", publisher: "ByteDance", android: { packageId: "com.lemon.lvoverseas" }, ios: { appId: "1500855883", bundleId: "com.lemon.lv" } },
  "canva": { name: "Canva", publisher: "Canva", android: { packageId: "com.canva.editor" }, ios: { appId: "897446215", bundleId: "com.canva.CanvaEditor" } },
  // iOS-only popular apps
  "imovie": { name: "iMovie", publisher: "Apple", ios: { appId: "377298193", bundleId: "com.apple.iMovie" } },
  "garageband": { name: "GarageBand", publisher: "Apple", ios: { appId: "408709785", bundleId: "com.apple.mobilegarageband" } },
  "pages": { name: "Pages", publisher: "Apple", ios: { appId: "361309726", bundleId: "com.apple.Pages" } },
  "keynote": { name: "Keynote", publisher: "Apple", ios: { appId: "361285480", bundleId: "com.apple.Keynote" } },
};

export const officialAndroidAppTool = tool(
  async ({ app_name, platform }) => {
    const normalized = app_name.toLowerCase().replace(/\s+/g, " ").trim();
    const known = APP_ALIASES[normalized];
    const targetPlatform = (platform || "both").toLowerCase();

    if (known) {
      const result: Record<string, unknown> = {
        name: known.name,
        publisher: known.publisher,
        officialUrl: known.official || null,
      };

      if ((targetPlatform === "android" || targetPlatform === "both") && known.android) {
        result.android = {
          packageId: known.android.packageId,
          googlePlayUrl: `https://play.google.com/store/apps/details?id=${known.android.packageId}`,
        };
      }

      if ((targetPlatform === "ios" || targetPlatform === "both") && known.ios) {
        result.ios = {
          appId: known.ios.appId,
          bundleId: known.ios.bundleId || null,
          appStoreUrl: `https://apps.apple.com/app/id${known.ios.appId}`,
        };
      }

      if (!result.android && !result.ios) {
        result.note = `App found but not available on ${targetPlatform}.`;
      } else {
        result.note = "Install/download path found.";
      }

      return JSON.stringify(result);
    }

    // Unknown app — return search links for both platforms
    const query = encodeURIComponent(app_name);
    const result: Record<string, unknown> = { name: app_name };

    if (targetPlatform === "android" || targetPlatform === "both") {
      result.googlePlaySearchUrl = `https://play.google.com/store/search?q=${query}&c=apps`;
    }
    if (targetPlatform === "ios" || targetPlatform === "both") {
      result.appStoreSearchUrl = `https://search.itunes.apple.com/WebObjects/MZSearch.woa/wa/search?q=${query}&media=software`;
    }
    result.webSearchUrl = `https://www.google.com/search?q=${query}+${targetPlatform === "ios" ? "iOS" : targetPlatform === "android" ? "Android" : "mobile"}+app+download`;
    result.note = "No known package mapping. Search or browse for a working install/download path.";

    return JSON.stringify(result);
  },
  {
    name: "app_source",
    description: "Return fast install paths for known mobile apps on Google Play Store and/or Apple App Store. Supports Android and iOS. Use this before slower web browsing.",
    schema: z.object({
      app_name: z.string().describe("The app or game name, for example Clash of Clans, Telegram, or Spotify."),
      platform: z.enum(["android", "ios", "both"]).optional().describe("Target platform. Defaults to both (Android + iOS)."),
    }),
  }
);

/**
 * ============================================================================
 * IMPROVED SEARCH: PARALLEL + DEDUP + MERGE
 * ============================================================================
 */

function deduplicateResults(results: any[], targetCount: number): any[] {
  const seen = new Set<string>();
  const deduped: any[] = [];

  for (const r of results) {
    if (deduped.length >= targetCount) break;
    if (!r.url) continue;

    // Normalize URL for dedup (strip trailing slash, www, protocol)
    let normalized: string;
    try {
      const u = new URL(r.url);
      normalized = u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/+$/, "") + u.search;
    } catch {
      normalized = r.url;
    }

    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push({ ...r, rank: deduped.length + 1 });
  }

  return deduped;
}

export const searchWebTool = tool(
  async ({ query, max_results, fetch_content }) => {
    try {
      const targetCount = boundedSearchResultCount(max_results);

      // Check cache first (cache key includes whether content was fetched).
      const cacheKey = fetch_content ? `${query} +content` : query;
      const cached = getCachedSearch(cacheKey);
      if (cached) {
        console.log(`[search] cache hit for: ${query.slice(0, 60)}`);
        return JSON.stringify(cached.slice(0, targetCount));
      }

      // Detect a time-sensitive query so providers return FRESH pages instead
      // of stale evergreen ones. Cheap keyword heuristic — maps to You.com /
      // Brave freshness windows.
      const freshness = detectFreshness(query);

      // Kick off ALL providers in parallel. Swallow rejections on each so a
      // laggard we don't wait for can't surface as an unhandled rejection.
      const youPromise = Promise.resolve(searchViaYouCom(query, targetCount, { freshness })).catch(() => null);
      const bravePromise = Promise.resolve(searchViaBrave(query, targetCount, { freshness })).catch(() => null);
      const ddgPromise = Promise.resolve(searchViaDuckDuckGo(query, targetCount)).catch(() => null);
      const googlePromise = Promise.resolve(searchGoogleCustomSearch(query, targetCount)).catch(() => null);

      let final: any[] = [];

      // Fast path: You.com is the paid priority provider with the best snippets.
      // Await it FIRST and, if it already returns enough, use it immediately —
      // don't block on the slower scrapers (DuckDuckGo HTML, Google pagination)
      // which otherwise drag every search out to their 10-12s timeouts even when
      // You.com answered in ~1s. The other promises keep running harmlessly.
      const youFast = await youPromise;
      if (Array.isArray(youFast) && youFast.length >= Math.min(targetCount, 5)) {
        final = deduplicateResults(youFast, targetCount);
        console.log(`[search] ${final.length} results for: ${query.slice(0, 60)} (you.com fast path)`);
      } else {
        // You.com was insufficient — wait for the rest (already running
        // concurrently, so no latency beyond the slowest remaining one).
        const [braveResults, ddgResults, googleApiResults] = await Promise.all([
          bravePromise, ddgPromise, googlePromise,
        ]);
        const allResults: any[] = [];
        if (youFast) allResults.push(...youFast);            // P1: you.com
        if (braveResults) allResults.push(...braveResults);   // P2: Brave
        if (googleApiResults) allResults.push(...googleApiResults); // P3: Google
        if (ddgResults) allResults.push(...ddgResults);       // P4: DuckDuckGo
        if (allResults.length > 0) {
          final = deduplicateResults(allResults, targetCount);
          console.log(`[search] ${final.length} results for: ${query.slice(0, 60)} (sources: ${[...new Set(final.map(r => r.source))].join(", ")})`);
        }
      }

      if (final.length === 0) {
        // No Kernel browser fallback here — search stays pure HTTP-API. Kernel
        // is reserved for actual browser ACTIONS (browser_interact,
        // sandbox_browser, browse_web's bot-wall escalation).
        return JSON.stringify([{ rank: 1, title: "No results found", url: "", snippet: "Search returned no results for this query. Try different keywords or rephrase.", source: "none" }]);
      }

      // OPTIONAL CONTENT FETCH — the Grok-style "search + fetch in one shot".
      // When fetch_content is set, batch-fetch the FULL page content of the top
      // results in a SINGLE you.com Contents call (parallel server-side) and
      // attach it to each result. This collapses search → browse → browse → …
      // into ONE tool call so the model can answer from real page text without
      // a separate round-trip per page.
      if (fetch_content) {
        const topUrls = final.map((r) => r.url).filter(Boolean).slice(0, 6);
        const pages = await fetchManyViaYouContents(topUrls, 4000);
        if (pages.length > 0) {
          const byUrl = new Map(pages.map((p) => [p.url, p]));
          // you.com may return a slightly normalized URL — match by hostname+path too.
          const norm = (u: string) => { try { const x = new URL(u); return x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/+$/, ""); } catch { return u; } };
          const byNorm = new Map(pages.map((p) => [norm(p.url), p]));
          let attached = 0;
          for (const r of final) {
            const hit = byUrl.get(r.url) ?? byNorm.get(norm(r.url));
            if (hit?.markdown) { r.content = hit.markdown; attached += 1; }
          }
          console.log(`[search] fetched full content for ${attached}/${topUrls.length} top results.`);
        }
      }

      setCachedSearch(cacheKey, final);
      return JSON.stringify(final);
    } catch (e: any) {
      return `Failed to search web: ${e.message}`;
    }
  },
  {
    name: "search_web",
    description:
      "Search the web across multiple providers in parallel and return ranked results (title, URL, snippet). " +
      "Set fetch_content=true to ALSO pull the full page text of the top results in the SAME call — use this whenever you need to READ the results, instead of calling browse_web on them one by one. " +
      "One search_web(fetch_content=true) replaces a search followed by several browse_web calls.",
    schema: z.object({
      query: z.string().describe("The search query."),
      max_results: z.number().optional().describe("How many organic results to return. Defaults to 10; maximum 25."),
      fetch_content: z.boolean().optional().describe("When true, also fetch the full page content (markdown) of the top ~6 results in one batch, attached as `content` on each result. Use for reading/answering; skip for a quick list of links."),
    }),
  }
);

function formatResearchResult(r: YouResearchResult): string {
  const sources = r.sources
    .filter((s) => s.url)
    .slice(0, 15)
    .map((s, i) => `[${i + 1}] ${s.title || s.url} — ${s.url}`)
    .join("\n");
  return [
    "RESEARCH FINDINGS (gathered + synthesized from live web sources):",
    r.content,
    sources ? `\nSOURCES:\n${sources}` : "",
  ].filter(Boolean).join("\n");
}

export const researchTool = tool(
  async ({ query, depth }) => {
    try {
      const effort = (["lite", "standard", "deep", "exhaustive"].includes(depth ?? "")
        ? depth
        : "standard") as "lite" | "standard" | "deep" | "exhaustive";
      const result = await youResearch(query, effort, "research", detectFreshness(query));
      if (!result) {
        return "Research returned no answer. The provider may be unavailable — fall back to search_web + browse_web.";
      }
      return formatResearchResult(result);
    } catch (e: any) {
      return `Research failed: ${e?.message ?? e}. Fall back to search_web + browse_web.`;
    }
  },
  {
    name: "research",
    description:
      "Answer a knowledge/research question in ONE call: it searches the web, fetches and reads the relevant pages, and returns a synthesized, citation-backed summary of findings. " +
      "Use this INSTEAD of chaining search_web + browse_web for fact-finding, 'what is the latest…', comparisons, explanations, and any question whose answer lives on the public web. " +
      "It returns research FINDINGS for YOU to compose into your final reply in the user's language and voice — not a finished user-facing answer. " +
      "Do NOT use for tasks that need browser actions (logins, clicks, downloads) or sandbox work — use sandbox_browser / browser_interact for those.",
    schema: z.object({
      query: z.string().min(3).describe("The question or research topic, stated in full."),
      depth: z
        .enum(["lite", "standard", "deep", "exhaustive"])
        .optional()
        .describe("Research effort. 'lite' for a quick fact (fastest), 'standard' (default) for most questions, 'deep'/'exhaustive' for multi-faceted reports (slower)."),
    }),
  }
);

export const financeResearchTool = tool(
  async ({ query, depth }) => {
    try {
      const effort = (depth === "exhaustive" ? "exhaustive" : "deep") as "deep" | "exhaustive";
      const result = await youResearch(query, effort, "finance_research");
      if (!result) {
        return "Finance research returned no answer. The provider may be unavailable — fall back to research or search_web.";
      }
      return formatResearchResult(result);
    } catch (e: any) {
      return `Finance research failed: ${e?.message ?? e}. Fall back to research or search_web.`;
    }
  },
  {
    name: "finance_research",
    description:
      "Deep financial research in ONE call: company financials, earnings, valuation, revenue drivers, market/sector analysis, comparisons of public companies. " +
      "Searches financial sources, reads them, and returns a synthesized, citation-backed analysis for YOU to compose into your reply. " +
      "Use for finance/markets/investing questions specifically; use `research` for general web questions. Not investment advice — present it as research.",
    schema: z.object({
      query: z.string().min(3).describe("The financial research question, stated in full (e.g. 'NVIDIA fiscal 2025 revenue drivers')."),
      depth: z.enum(["deep", "exhaustive"]).optional().describe("Effort. 'deep' (default) or 'exhaustive' for the most thorough analysis (slower)."),
    }),
  }
);

/**
 * Detects a bot-wall / verification interstitial in fetched content so we know
 * a plain fetch was blocked rather than the page being genuinely empty.
 */
function looksBotWalled(title: string, text: string): boolean {
  const blob = `${title ?? ""} ${text ?? ""}`.toLowerCase();
  return /just a moment|verifying you are human|security verification|enable javascript|cloudflare|attention required|access denied|are you a robot|captcha/.test(blob)
    || (typeof text === "string" && text.trim().length < 80);
}

/**
 * Plain HTTP fetch + cheerio parse — NO browser. The cheap, fast default for
 * read-only page reads. Returns null when the fetch fails or the page is
 * bot-walled, so the caller can escalate to the Kernel stealth browser.
 */
async function fetchPageViaHttp(url: string, maxChars: number): Promise<any | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }

  const ctype = response.headers.get("content-type") ?? "";
  if (!response.ok || !/text\/html|application\/xhtml|text\/plain/i.test(ctype)) {
    // Non-HTML (PDF/binary) or an error status — let the browser path handle it.
    return null;
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  $("script, style, noscript, svg").remove();

  const c = (v: string | undefined | null, m = 500) =>
    String(v ?? "").replace(/\s+/g, " ").trim().slice(0, m);

  const title = c($("title").first().text(), 300);
  const metaDescription = c($('meta[name="description"]').attr("content"), 500);
  const headings = $("h1, h2, h3")
    .map((_, el) => c($(el).text(), 180)).get()
    .filter(Boolean).slice(0, 20);
  const links = $("a[href]")
    .map((_, el) => ({ text: c($(el).text() || $(el).attr("aria-label"), 160), url: $(el).attr("href") || "" })).get()
    .filter((l) => l.text && /^https?:\/\//.test(l.url)).slice(0, 30);
  const text = c($("body").text(), maxChars);

  const snapshot = { url: response.url || url, title, metaDescription, headings, links, text };
  return looksBotWalled(title, text) ? null : snapshot;
}

export const browseWebTool = tool(
  async ({ url, max_text_chars }) => {
    const maxChars = Math.max(1000, Math.min(20_000, max_text_chars ?? 7000));

    // 1. you.com Contents API first — server-side fetch + clean markdown, no
    // browser, defeats most light bot-walls. The primary path for reading a page.
    const youContents = await fetchViaYouContents(url, maxChars);
    if (youContents) {
      return JSON.stringify({ url: youContents.url, title: youContents.title, text: youContents.markdown, source: "you.com:contents" });
    }

    // 2. Pure HTTP fetch — fast, no browser. For pages you.com couldn't return.
    const httpResult = await fetchPageViaHttp(url, maxChars);
    if (httpResult) return JSON.stringify(httpResult);

    // 3. Kernel stealth browser — last resort for JS-heavy / hard bot-walls.
    const runBrowse = async (useResidentialProxy: boolean) =>
      withKernelBrowser(async (sessionId, session) => {
        const snapshot = await kernelPlaywright(sessionId, `
          await page.goto(${JSON.stringify(url)}, { waitUntil: "domcontentloaded", timeout: 20000 });
          await page.waitForTimeout(1200);
          const title = await page.title();
          const result = await page.evaluate((limit) => {
            const c = (v, m = 500) => String(v ?? "").replace(/\\s+/g, " ").trim().slice(0, m);
            const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
              .map(el => c(el.innerText, 180)).filter(Boolean).slice(0, 20);
            const links = Array.from(document.querySelectorAll("a[href]"))
              .map(el => ({ text: c(el.innerText || el.getAttribute("aria-label"), 160), url: el.href }))
              .filter(l => l.text && /^https?:\\/\\//.test(l.url)).slice(0, 30);
            const metaDescription = c(document.querySelector('meta[name="description"]')?.getAttribute("content"), 500);
            const text = c(document.body?.innerText, limit);
            return { metaDescription, headings, links, text };
          }, ${maxChars});
          return { url: page.url(), title, ...result };
        `, useResidentialProxy ? 34 : 28);
        return {
          ...snapshot,
          liveViewUrl: session.browser_live_view_url || null,
        };
      }, { timeoutMs: useResidentialProxy ? 38_000 : 30_000, useResidentialProxy });

    // Detects a bot-wall / verification interstitial in the returned snapshot
    // so we know the plain fetch was blocked rather than genuinely empty.
    const looksBlocked = (snap: any): boolean => {
      const blob = `${snap?.title ?? ""} ${snap?.text ?? ""}`.toLowerCase();
      return /just a moment|verifying you are human|security verification|enable javascript|cloudflare|attention required|access denied|are you a robot|captcha/.test(blob)
        || (typeof snap?.text === "string" && snap.text.trim().length < 80);
    };

    try {
      const first = await runBrowse(false);
      if (!looksBlocked(first)) return JSON.stringify(first);

      // First pass hit a bot-wall / near-empty page. Retry ONCE through a
      // Kernel residential proxy (the paid capability that defeats most
      // bot detection). If the retry is no better, return its result anyway
      // so the model still has something to work with.
      console.warn(`[browse_web] first pass looked blocked — retrying via residential proxy: ${url}`);
      try {
        const second = await runBrowse(true);
        return JSON.stringify(looksBlocked(second) ? { ...second, note: "Page appears bot-protected; content may be incomplete." } : second);
      } catch {
        return JSON.stringify({ ...first, note: "Page appears bot-protected; content may be incomplete." });
      }
    } catch (e: any) {
      // The plain pass errored/timed out. One residential-proxy retry before
      // giving up — slow sites sometimes only resolve through a clean IP.
      try {
        console.warn(`[browse_web] first pass failed (${e?.message ?? e}) — retrying via residential proxy: ${url}`);
        const second = await runBrowse(true);
        return JSON.stringify(second);
      } catch (e2: any) {
        return `Failed to browse web: ${e2?.message ?? e2}. The site may be blocking automated access — try sandbox_browser, or search for the same content on another source.`;
      }
    }
  },
  {
    name: "browse_web",
    description: "Fetch/read a page and return the final URL, title, meta description, headings, useful links, and visible text. Uses a fast plain HTTP fetch first; only falls back to a stealth browser when the page is bot-walled or blocks the fetch.",
    schema: z.object({
      url: z.string().describe("The URL to visit."),
      max_text_chars: z.number().optional().describe("Maximum visible page text characters to return. Defaults to 7000; maximum 20000."),
    }),
  }
);

/**
 * Read an image from the sandbox and describe/transcribe it with Cloudflare
 * llama-3.2-vision. Tesseract OCR garbles text-heavy images (worksheets,
 * fractions like "3/4", handwriting); a real multimodal model reads them
 * accurately. Returns "" when vision is unavailable so callers fall back to OCR.
 */
async function describeImageWithVision(templateId: string, sandboxPath: string, question?: string): Promise<string> {
  const acct = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const key = process.env.CLOUDFLARE_API_KEY?.trim();
  if (!acct || !key) return "";
  try {
    const bytes: Uint8Array = await runWithSandboxRetry(templateId, (liveSandbox) =>
      liveSandbox.files.read(sandboxPath, { format: "bytes", requestTimeoutMs: 120_000 })
    );
    if (!bytes || bytes.byteLength === 0) return "";
    const prompt = question
      ? `${question}\n\nFirst transcribe ALL text in the image exactly as written — every number and fraction (write fractions with a slash, e.g. 3/4) in reading order — then use it to answer.`
      : "Transcribe ALL text in this image exactly as written, including every number and fraction (write fractions with a slash, e.g. 3/4), in reading order top to bottom, left to right. Then briefly describe any non-text visual content.";
    const url = `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ image: Array.from(bytes), prompt, max_tokens: 1024 }),
    });
    const json: any = await resp.json().catch(() => null);
    if (!resp.ok || !json?.result?.response) return "";
    return String(json.result.response).trim();
  } catch {
    return "";
  }
}

export const screenshotAnalyzeTool = tool(
  async ({ url, question, template_id }) => {
    try {
      const templateId = selectTemplateForTask("screenshot", url, template_id);

      // Local sandbox image (file:// or an absolute /home/user path)? Then we
      // already HAVE the image in the sandbox — OCR it directly with tesseract
      // and skip the Kernel cloud browser entirely. Kernel runs in the cloud
      // and CANNOT open file:// paths on our sandbox, which is exactly why the
      // previous version failed with ERR_FILE_NOT_FOUND on screenshots that
      // sandbox_browser had just saved.
      const localMatch = /^file:\/\/(.+)/.exec(url) || (url.startsWith("/home/user/") ? [url, url] : null);
      if (localMatch) {
        const localPath = localMatch[1];
        // Vision FIRST: a multimodal model reads printed text, fractions ("3/4"),
        // handwriting, and worksheet layouts FAR more reliably than tesseract,
        // and it's the answer the model needs. Run OCR only as a backstop (one
        // cheap pass) so the call stays fast — the old multi-PSM upscale loop ran
        // up to 8 tesseract invocations and blew the agent's time budget.
        const vision = await describeImageWithVision(templateId, localPath, question);
        const analysis = await runWithSandboxRetry(templateId, async (liveSandbox) => {
          const code = [
            "import json, os, subprocess",
            `p = ${JSON.stringify(localPath)}`,
            "if not os.path.exists(p): print(json.dumps({'error': 'file not found: ' + p})); raise SystemExit(0)",
            "info = subprocess.run(['file', p], capture_output=True, text=True).stdout.strip()",
            "dim = 'unknown'",
            "try:",
            "    from PIL import Image",
            "    dim = '{}x{}'.format(*Image.open(p).size)",
            "except Exception:",
            "    pass",
            "ocr = ''",
            "# Single quick OCR pass as a backstop (vision is primary). mya+eng then",
            "# eng-only: the Myanmar pack may be missing, so a non-zero exit on the",
            "# first attempt must NOT surface the tesseract error as 'OCR text'.",
            "for _langs in ('eng', 'mya+eng'):",
            "    try:",
            "        r = subprocess.run(['tesseract', p, 'stdout', '-l', _langs, '--psm', '6'], capture_output=True, text=True, timeout=30)",
            "        if r.returncode == 0 and (r.stdout or '').strip():",
            "            ocr = r.stdout.strip()[:3000]; break",
            "    except Exception:",
            "        pass",
            "if not ocr: ocr = '(no text extracted)'",
            "print(json.dumps({'path': p, 'fileInfo': info, 'dimensions': dim, 'ocrText': ocr, 'sizeBytes': os.path.getsize(p) if os.path.exists(p) else 0}, ensure_ascii=False))",
          ].join("\n");
          const exec = await liveSandbox.commands.run(`python3 -c ${shellQuote(code)}`, { timeoutMs: 45_000, requestTimeoutMs: 45_000 });
          return exec.stdout?.trim() || exec.stderr?.trim() || "Image analysis produced no output.";
        });
        const questionContext = question ? `\nUser question: ${question}` : "";
        if (vision) {
          return `IMAGE READING (vision model — authoritative, use this):\n${vision}\n\n[Raw OCR backstop below — ignore if it conflicts with the reading above]\n${analysis}${questionContext}`;
        }
        return `Image analysis (OCR):\n${analysis}${questionContext}`;
      }

      // Take screenshot via Kernel browser, save to sandbox, analyze with Python (OCR/description)
      const screenshotBase64 = await withKernelBrowser(async (sessionId) => {
        const result = await kernelPlaywright(sessionId, `
          await page.goto(${JSON.stringify(url)}, { waitUntil: "domcontentloaded", timeout: 35000 });
          await page.waitForTimeout(2000);
          const buffer = await page.screenshot({ fullPage: false, type: "png" });
          return buffer.toString("base64");
        `, 45);
        return result;
      }, { timeoutMs: 50_000 });

      if (!screenshotBase64 || typeof screenshotBase64 !== "string") {
        return "Failed to capture screenshot.";
      }

      // Save screenshot to sandbox and run OCR analysis on the EXACT path we
      // just wrote (no timestamp-glob guessing, which could pick the wrong
      // image if another screenshot exists in the sandbox).
      const analysis = await runWithSandboxRetry(templateId, async (liveSandbox) => {
        const screenshotPath = `/home/user/screenshot_${Date.now()}.png`;
        const imageData = Uint8Array.from(Buffer.from(screenshotBase64, "base64"));
        await liveSandbox.files.write(screenshotPath, imageData, { requestTimeoutMs: 60_000 });

        const code = [
          "import json, os, subprocess",
          `p = ${JSON.stringify(screenshotPath)}`,
          "info = subprocess.run(['file', p], capture_output=True, text=True).stdout.strip()",
          "ocr = ''",
          "try:",
          "    r = subprocess.run(['tesseract', p, 'stdout', '-l', 'mya+eng'], capture_output=True, text=True, timeout=40)",
          "    ocr = (r.stdout or '').strip()[:4000] or (r.stderr or '').strip()[:500]",
          "except Exception as e:",
          "    ocr = 'OCR error: ' + str(e)",
          "try:",
          "    from PIL import Image",
          "    dim = '{}x{}'.format(*Image.open(p).size)",
          "except Exception:",
          "    dim = 'unknown'",
          "print(json.dumps({'path': p, 'fileInfo': info, 'dimensions': dim, 'ocrText': ocr, 'sizeBytes': os.path.getsize(p) if os.path.exists(p) else 0}, ensure_ascii=False))",
        ].join("\n");
        const exec = await liveSandbox.commands.run(`python3 -c ${shellQuote(code)}`, {
          timeoutMs: 60_000,
          requestTimeoutMs: 60_000,
        });
        return exec.stdout?.trim() || exec.stderr?.trim() || "Screenshot captured but analysis failed.";
      });

      const questionContext = question ? `\nUser question: ${question}` : "";
      return `Screenshot analysis:\n${analysis}${questionContext}`;
    } catch (e: any) {
      return `Failed to screenshot and analyze: ${e.message}`;
    }
  },
  {
    name: "screenshot_analyze",
    description: "Take a screenshot of a webpage and analyze its visual content using OCR. Use when you need to understand visual layout, read text from images, or verify visual elements on a page.",
    schema: z.object({
      url: z.string().describe("The URL to screenshot."),
      question: z.string().optional().describe("Optional question about the screenshot content."),
      template_id: z.string().optional().describe(TEMPLATE_DESCRIPTIONS),
    }),
  }
);

const browserActionSchema = z.object({
  type: z.enum(["goto", "click", "type", "press", "select", "wait", "extract"]),
  selector: z.string().optional().describe("CSS selector for click/type/press/select/extract actions."),
  text: z.string().optional().describe("Text to type for type actions."),
  key: z.string().optional().describe("Keyboard key to press for press actions, for example Enter or Tab."),
  value: z.string().optional().describe("Value to select for select actions."),
  url: z.string().optional().describe("URL for goto actions."),
  milliseconds: z.number().optional().describe("Delay for wait actions."),
  waitForNavigation: z.boolean().optional().describe("After click/type/press, wait briefly for navigation or network idle. Defaults to true for click and press."),
});

export const browserInteractTool = tool(
  async ({ url, actions, mobile }) => {
    try {
      return await withKernelBrowser(async (sessionId, session) => {
        // Build Playwright code string from actions
        const actionLines: string[] = [];
        if (url) {
          actionLines.push(`await page.goto(${JSON.stringify(url)}, { waitUntil: "domcontentloaded", timeout: 35000 });`);
          actionLines.push(`await page.waitForTimeout(1500);`);
        }

        const extractIndices: number[] = [];
        for (let i = 0; i < actions.length; i++) {
          const action = actions[i];
          if (action.type === "goto") {
            if (!action.url) return "Browser interaction failed: goto action requires a URL.";
            actionLines.push(`await page.goto(${JSON.stringify(action.url)}, { waitUntil: "domcontentloaded", timeout: 35000 });`);
            actionLines.push(`await page.waitForTimeout(1500);`);
          } else if (action.type === "click") {
            if (!action.selector) return "Browser interaction failed: click action requires a selector.";
            actionLines.push(`await page.waitForSelector(${JSON.stringify(action.selector)}, { timeout: 15000, state: "visible" });`);
            actionLines.push(`await page.click(${JSON.stringify(action.selector)});`);
            if (action.waitForNavigation !== false) actionLines.push(`await page.waitForTimeout(1500);`);
          } else if (action.type === "type") {
            if (!action.selector) return "Browser interaction failed: type action requires a selector.";
            actionLines.push(`await page.waitForSelector(${JSON.stringify(action.selector)}, { timeout: 15000, state: "visible" });`);
            actionLines.push(`await page.fill(${JSON.stringify(action.selector)}, ${JSON.stringify(action.text ?? "")});`);
            if (action.waitForNavigation === true) actionLines.push(`await page.waitForTimeout(1500);`);
          } else if (action.type === "press") {
            if (action.selector) {
              actionLines.push(`await page.waitForSelector(${JSON.stringify(action.selector)}, { timeout: 15000, state: "visible" });`);
              actionLines.push(`await page.click(${JSON.stringify(action.selector)});`);
            }
            actionLines.push(`await page.keyboard.press(${JSON.stringify(action.key ?? "Enter")});`);
            if (action.waitForNavigation !== false) actionLines.push(`await page.waitForTimeout(1500);`);
          } else if (action.type === "select") {
            if (!action.selector) return "Browser interaction failed: select action requires a selector.";
            actionLines.push(`await page.waitForSelector(${JSON.stringify(action.selector)}, { timeout: 15000, state: "visible" });`);
            actionLines.push(`await page.selectOption(${JSON.stringify(action.selector)}, ${JSON.stringify(action.value ?? "")});`);
          } else if (action.type === "wait") {
            actionLines.push(`await page.waitForTimeout(${action.milliseconds ?? 1000});`);
          } else if (action.type === "extract") {
            extractIndices.push(i);
            if (action.selector) {
              actionLines.push(`{ const el = await page.waitForSelector(${JSON.stringify(action.selector)}, { timeout: 15000, state: "visible" });`);
              actionLines.push(`const t = await el.innerText().catch(() => ""); extracted.push({ selector: ${JSON.stringify(action.selector)}, text: t.replace(/\\s+/g, " ").trim().slice(0, 8000) }); }`);
            } else {
              actionLines.push(`{ const t = await page.evaluate(() => document.body?.innerText || ""); extracted.push({ text: t.replace(/\\s+/g, " ").trim().slice(0, 8000) }); }`);
            }
          }
        }

        const code = `
          const extracted = [];
          ${actionLines.join("\n          ")}
          const finalUrl = page.url();
          const title = await page.title();
          if (extracted.length === 0) {
            const t = await page.evaluate(() => document.body?.innerText || "");
            extracted.push({ text: t.replace(/\\s+/g, " ").trim().slice(0, 8000) });
          }
          return { finalUrl, title, extracted };
        `;

        const result = await kernelPlaywright(sessionId, code, 90);
        return JSON.stringify({
          ...result,
          liveViewUrl: session.browser_live_view_url || null,
        });
      }, { mobile, timeoutMs: 90_000 });
    } catch (e: any) {
      return `Failed to interact with browser: ${e.message}`;
    }
  },
  {
    name: "browser_interact",
    description: "Use a Kernel stealth browser for web interaction: open pages, click controls, type, press keys, select values, wait, and extract page text. Use for form filling and web task execution.",
    schema: z.object({
      url: z.string().optional().describe("Initial URL to open before running actions."),
      actions: z.array(browserActionSchema).describe("Ordered browser actions to perform."),
      mobile: z.boolean().optional().describe("Run the browser in mobile viewport mode."),
    }),
  }
);

// ────────────────────────────────────────────────────────────────────────────
// SANDBOX_BROWSER — in-sandbox Playwright with persistent profile
// ────────────────────────────────────────────────────────────────────────────
// Why this tool exists alongside `browse_web` and `browser_interact`:
//   - browse_web: read-only HTML fetch, no JS execution, no auth.
//   - browser_interact: Kernel cloud stealth browser. Ephemeral, no shared
//     state with the sandbox filesystem, costs against Kernel quota.
//   - sandbox_browser (THIS): Playwright running inside the agent's own E2B
//     sandbox. Cookies / localStorage persist across calls within a session
//     (same sandbox), downloaded files land directly under /home/user/
//     so subsequent `run_python` / `run_terminal` calls can process them
//     without an extra hop, and a follow-up screenshot can be analyzed by
//     `screenshot_analyze` against the same image. Use this for multi-step
//     workflows that need login state or that produce files for downstream
//     processing.
//
// Action surface mirrors `browser_interact` so the model can swap between
// them with minimal cognitive overhead, plus three additions: download,
// scroll, screenshot. Each call drives a fresh Python+Playwright process —
// the persistent state lives in the user-data directory on disk, not in a
// long-running browser handle.
// ────────────────────────────────────────────────────────────────────────────

const SANDBOX_BROWSER_PROFILE = "/home/user/.candle_browser_profile";
const SANDBOX_BROWSER_DOWNLOADS = "/home/user/downloads";
const SANDBOX_BROWSER_SCREENSHOTS = "/home/user/screenshots";

const sandboxBrowserActionSchema = z.object({
  type: z.enum([
    "goto",
    "click",
    "type",
    "press",
    "select",
    "scroll",
    "wait",
    "extract",
    "screenshot",
    "download",
  ]).describe("Action kind."),
  selector: z.string().optional().describe("CSS selector for click/type/press/select/extract/download actions."),
  text: z.string().optional().describe("Text to type for type actions."),
  key: z.string().optional().describe("Keyboard key for press actions (e.g. 'Enter', 'Tab')."),
  value: z.string().optional().describe("Value for select actions."),
  url: z.string().optional().describe("URL for goto actions."),
  filename: z.string().optional().describe("Optional output filename for screenshot/download actions (relative to /home/user/downloads or /home/user/screenshots)."),
  pixels: z.number().optional().describe("Pixels to scroll vertically for scroll actions (negative scrolls up)."),
  milliseconds: z.number().optional().describe("Delay for wait actions, or post-action settle for click/type/press."),
  waitForNavigation: z.boolean().optional().describe("Wait briefly for navigation/network idle after click/press. Defaults to true for click and press."),
  fullPage: z.boolean().optional().describe("Capture full scrollable page for screenshot actions. Defaults to false."),
});

/**
 * Build the Python driver script. The script reads a JSON manifest from the
 * `MANIFEST` env var so we never interpolate user-controlled strings into the
 * script body — closes the obvious code-injection vector. The script writes
 * a JSON envelope on stdout summarising every step.
 */
const SANDBOX_BROWSER_DRIVER = String.raw`
import json, os, sys, time, traceback
from pathlib import Path

manifest = json.loads(os.environ.get("MANIFEST", "{}"))
actions = manifest.get("actions") or []
mobile = bool(manifest.get("mobile"))
reset_profile = bool(manifest.get("reset_profile"))
profile_dir = manifest.get("profileDir") or "/home/user/.candle_browser_profile"
downloads_dir = manifest.get("downloadsDir") or "/home/user/downloads"
screenshots_dir = manifest.get("screenshotsDir") or "/home/user/screenshots"
overall_timeout_ms = int(manifest.get("overallTimeoutMs") or 90000)

if reset_profile and os.path.isdir(profile_dir):
    import shutil
    shutil.rmtree(profile_dir, ignore_errors=True)

Path(profile_dir).mkdir(parents=True, exist_ok=True)
Path(downloads_dir).mkdir(parents=True, exist_ok=True)
Path(screenshots_dir).mkdir(parents=True, exist_ok=True)

events = []

def event(action, ok, detail):
    events.append({"action": action, "ok": ok, "detail": detail})

def safe_filename(name, fallback):
    if not name:
        return fallback
    cleaned = "".join(c for c in name if c.isalnum() or c in "-_.")
    return cleaned or fallback

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PWTimeoutError
except Exception as e:
    print(json.dumps({"ok": False, "error": "playwright not available: " + str(e), "events": events}))
    sys.exit(1)

start = time.time()
result = {"ok": False, "events": events, "artifacts": []}

with sync_playwright() as pw:
    viewport = {"width": 390, "height": 844} if mobile else {"width": 1280, "height": 800}
    user_agent = (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 "
        "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
        if mobile else
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )

    try:
        ctx = pw.chromium.launch_persistent_context(
            profile_dir,
            headless=True,
            accept_downloads=True,
            viewport=viewport,
            user_agent=user_agent,
            channel="chromium",
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-blink-features=AutomationControlled"],
        )
    except Exception as e:
        result["error"] = "failed to launch browser: " + str(e)
        print(json.dumps(result))
        sys.exit(1)

    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.set_default_timeout(15000)
    page.set_default_navigation_timeout(20000)

    try:
        for idx, raw in enumerate(actions):
            if (time.time() - start) * 1000 > overall_timeout_ms:
                event("budget", False, "overall timeout reached, stopping")
                break

            kind = raw.get("type")
            try:
                if kind == "goto":
                    url = raw.get("url") or ""
                    if not url:
                        event("goto", False, "missing url")
                        continue
                    page.goto(url, wait_until="domcontentloaded")
                    event("goto", True, {"url": page.url, "title": page.title()})

                elif kind == "click":
                    sel = raw.get("selector") or ""
                    if not sel:
                        event("click", False, "missing selector")
                        continue
                    page.locator(sel).first.click()
                    if raw.get("waitForNavigation", True):
                        try: page.wait_for_load_state("networkidle", timeout=4000)
                        except PWTimeoutError: pass
                    event("click", True, {"selector": sel})

                elif kind == "type":
                    sel = raw.get("selector") or ""
                    text = raw.get("text") or ""
                    if not sel:
                        event("type", False, "missing selector")
                        continue
                    page.locator(sel).first.fill(text)
                    event("type", True, {"selector": sel, "chars": len(text)})

                elif kind == "press":
                    key = raw.get("key") or "Enter"
                    sel = raw.get("selector")
                    if sel:
                        page.locator(sel).first.press(key)
                    else:
                        page.keyboard.press(key)
                    if raw.get("waitForNavigation", True):
                        try: page.wait_for_load_state("networkidle", timeout=4000)
                        except PWTimeoutError: pass
                    event("press", True, {"key": key, "selector": sel})

                elif kind == "select":
                    sel = raw.get("selector") or ""
                    val = raw.get("value") or ""
                    if not sel:
                        event("select", False, "missing selector")
                        continue
                    page.locator(sel).first.select_option(val)
                    event("select", True, {"selector": sel, "value": val})

                elif kind == "scroll":
                    px = int(raw.get("pixels") or 600)
                    page.evaluate("(p) => window.scrollBy(0, p)", px)
                    event("scroll", True, {"pixels": px})

                elif kind == "wait":
                    ms = int(raw.get("milliseconds") or 1000)
                    page.wait_for_timeout(min(ms, 15000))
                    event("wait", True, {"milliseconds": ms})

                elif kind == "extract":
                    sel = raw.get("selector")
                    if sel:
                        nodes = page.locator(sel).all()[:30]
                        texts = [n.inner_text()[:1000] for n in nodes]
                    else:
                        texts = [page.inner_text("body")[:8000]]
                    event("extract", True, {"texts": texts})

                elif kind == "screenshot":
                    name = safe_filename(raw.get("filename"), "screenshot_" + str(int(time.time()*1000)) + ".png")
                    if not name.endswith((".png", ".jpg", ".jpeg")):
                        name += ".png"
                    out = os.path.join(screenshots_dir, name)
                    page.screenshot(path=out, full_page=bool(raw.get("fullPage")))
                    event("screenshot", True, {"path": out})
                    result["artifacts"].append({"path": out, "filename": name, "kind": "screenshot"})

                elif kind == "download":
                    sel = raw.get("selector") or ""
                    if not sel:
                        event("download", False, "missing selector")
                        continue
                    with page.expect_download(timeout=20000) as info:
                        page.locator(sel).first.click()
                    dl = info.value
                    suggested = dl.suggested_filename or "download.bin"
                    name = safe_filename(raw.get("filename"), suggested)
                    out = os.path.join(downloads_dir, name)
                    dl.save_as(out)
                    size = os.path.getsize(out) if os.path.exists(out) else 0
                    event("download", True, {"path": out, "filename": name, "bytes": size})
                    result["artifacts"].append({"path": out, "filename": name, "kind": "download", "bytes": size})

                else:
                    event(kind or "unknown", False, "unsupported action type")

            except PWTimeoutError as e:
                event(kind, False, "timeout: " + str(e)[:200])
            except Exception as e:
                event(kind, False, "error: " + str(e)[:300])

        # Always finish with a tail screenshot for downstream visual verification
        # unless the last action was already a screenshot.
        if not actions or actions[-1].get("type") != "screenshot":
            try:
                tail = os.path.join(screenshots_dir, "tail_" + str(int(time.time()*1000)) + ".png")
                page.screenshot(path=tail, full_page=False)
                result["artifacts"].append({"path": tail, "filename": os.path.basename(tail), "kind": "tail_screenshot"})
            except Exception:
                pass

        result["ok"] = True
        result["finalUrl"] = page.url
        try:
            result["title"] = page.title()
        except Exception:
            result["title"] = ""
    finally:
        try:
            ctx.close()
        except Exception:
            pass

print(json.dumps(result, ensure_ascii=False))
`;

export const sandboxBrowserTool = tool(
  async ({ actions, mobile, reset_profile, template_id }) => {
    const trimmedActions = (actions ?? []).slice(0, 12);
    if (trimmedActions.length === 0) {
      return JSON.stringify({ ok: false, error: "No actions provided." });
    }
    const manifest = {
      actions: trimmedActions,
      mobile: Boolean(mobile),
      reset_profile: Boolean(reset_profile),
      profileDir: SANDBOX_BROWSER_PROFILE,
      downloadsDir: SANDBOX_BROWSER_DOWNLOADS,
      screenshotsDir: SANDBOX_BROWSER_SCREENSHOTS,
      overallTimeoutMs: 90_000,
    };

    try {
      const templateId = selectTemplateForTask("sandbox_browser", "", template_id);
      // The driver always writes its JSON envelope to stdout — even on
      // failure. Catch the e2b CommandExitError so the model still sees the
      // structured error instead of an opaque "exit status 1".
      const execution = await runWithSandboxRetry<{ stdout?: string; stderr?: string; exitCode?: number }>(
        templateId,
        async (liveSandbox) => {
          const driverPath = `/home/user/.candle_browser_driver_${Date.now()}.py`;
          await liveSandbox.files.write(driverPath, SANDBOX_BROWSER_DRIVER, { requestTimeoutMs: 60_000 });
          try {
            return await liveSandbox.commands.run(`python3 ${driverPath}`, {
              timeoutMs: 110_000,
              requestTimeoutMs: 110_000,
              envs: {
                MANIFEST: JSON.stringify(manifest),
                // The E2B sandbox doesn't propagate Dockerfile ENV to the
                // command runtime, so we re-export it here. The Dockerfile
                // installed Playwright binaries under this system-wide path
                // so the unprivileged sandbox user can read them.
                PLAYWRIGHT_BROWSERS_PATH: "/usr/local/share/ms-playwright",
              },
            });
          } catch (err: any) {
            // e2b throws CommandExitError on non-zero exits but still hands
            // back the captured stdout/stderr on the error object. Forward
            // them so we can surface the driver's JSON envelope.
            if (err?.result) {
              return err.result;
            }
            throw err;
          }
        }
      );

      const stdout = (execution.stdout ?? "").trim();
      const stderr = (execution.stderr ?? "").trim();

      // The driver always prints a single JSON envelope on stdout. If parsing
      // fails we fall back to returning the raw stderr — usually a Python
      // traceback that helps the model recover.
      let parsed: any = null;
      if (stdout) {
        try {
          // Driver may emit warnings before the JSON; take the LAST line.
          const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
          parsed = JSON.parse(lines[lines.length - 1]);
        } catch {
          parsed = null;
        }
      }

      if (!parsed) {
        return `Sandbox browser failed to produce a JSON envelope.\nstdout:\n${stdout.slice(0, 1500)}\nstderr:\n${stderr.slice(0, 1500)}`;
      }

      // Promote the FIRST artifact (if any) to the top-level url/path so
      // ArtifactRegistry.extractFromToolOutput picks it up automatically.
      const firstArtifact = Array.isArray(parsed.artifacts) ? parsed.artifacts[0] : null;
      if (firstArtifact?.path) {
        parsed.path = firstArtifact.path;
        if (firstArtifact.filename) parsed.filename = firstArtifact.filename;
      }
      return JSON.stringify(parsed);
    } catch (e: any) {
      return `Failed to drive sandbox browser: ${e?.message ?? e}`;
    }
  },
  {
    name: "sandbox_browser",
    description:
      "Drive a persistent Chromium browser INSIDE the agent's E2B sandbox via Playwright. " +
      "Use when you need login state to persist across tool calls, when downloaded files must land in the sandbox filesystem for downstream processing, or when you want a screenshot you can post-process with screenshot_analyze. " +
      "For one-shot read-only fetches prefer browse_web; for stealth / non-sandbox interaction prefer browser_interact. " +
      "IMPORTANT: each call runs a FRESH browser process — the live page does NOT carry over between calls. Cookies/localStorage DO persist (under /home/user/.candle_browser_profile), but the open page does not. So EVERY call must start with a `goto` action; do not call `extract`/`click` alone expecting the previous call's page (it will be about:blank). Put goto + interact + extract/screenshot in ONE call's actions array. " +
      "Pass reset_profile=true to wipe cookies. Returns a JSON envelope { ok, finalUrl, title, events, artifacts }.",
    schema: z.object({
      actions: z.array(sandboxBrowserActionSchema).min(1).max(12).describe("Ordered actions to run. Up to 12 per call."),
      mobile: z.boolean().optional().describe("Use a mobile viewport + UA. Defaults to false."),
      reset_profile: z.boolean().optional().describe("Wipe the persistent profile before launching. Defaults to false."),
      template_id: z.string().optional().describe(TEMPLATE_DESCRIPTIONS),
    }),
  }
);

// ────────────────────────────────────────────────────────────────────────────
// PROGRAMMATIC TOOL CALLING (PTC) — run a sandbox script that calls Candle's
// own tools over a file-based RPC bridge, so a multi-step pipeline collapses
// into ONE tool turn with zero intermediate context cost.
//
// Transport: the sandbox script writes request files under
// /home/user/.candle_rpc/req/<seq>.{json,done}; this host loop (running inside
// the current session context) reads each request, dispatches to an allow-
// listed tool via `.invoke()`, and writes /home/user/.candle_rpc/resp/<seq>.
// {json,done}. NO new inbound network endpoint is opened. The session lock is
// only held for individual filesystem ops — never across a dispatch — so the
// dispatched sandbox tools can acquire it without deadlocking.
// ────────────────────────────────────────────────────────────────────────────

const PTC_RPC_ROOT = "/home/user/.candle_rpc";

function ptcMaxRpcCalls(): number {
  const parsed = Number(process.env.PTC_MAX_RPC_CALLS);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function ptcMaxWallMs(): number {
  const parsed = Number(process.env.PTC_MAX_WALL_MS);
  if (!Number.isFinite(parsed)) return 120_000;
  return Math.max(15_000, Math.min(300_000, Math.floor(parsed)));
}

// Python preamble injected ABOVE the user's script. Defines the RPC helpers so
// the model just calls search_web(...), read_file(...), etc. directly. No `${`
// sequences here, so it is safe inside a TS template literal.
const PTC_PYTHON_PREAMBLE = `import json, os, time
_CANDLE_RPC = "${PTC_RPC_ROOT}"
_CANDLE_SEQ = 0

def _candle_call(tool, args):
    global _CANDLE_SEQ
    seq = _CANDLE_SEQ
    _CANDLE_SEQ += 1
    req_dir = os.path.join(_CANDLE_RPC, "req")
    resp_dir = os.path.join(_CANDLE_RPC, "resp")
    os.makedirs(req_dir, exist_ok=True)
    os.makedirs(resp_dir, exist_ok=True)
    with open(os.path.join(req_dir, str(seq) + ".json"), "w", encoding="utf-8") as f:
        f.write(json.dumps({"tool": tool, "args": args}))
    with open(os.path.join(req_dir, str(seq) + ".done"), "w", encoding="utf-8") as f:
        f.write("1")
    resp_json = os.path.join(resp_dir, str(seq) + ".json")
    resp_done = os.path.join(resp_dir, str(seq) + ".done")
    deadline = time.time() + 150
    while time.time() < deadline:
        if os.path.exists(resp_done):
            with open(resp_json, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("error"):
                raise RuntimeError("candle tool error: " + str(data["error"]))
            return data.get("result")
        time.sleep(0.1)
    raise TimeoutError("candle tool call timed out: " + tool)

def search_web(query, max_results=10):
    return _candle_call("search_web", {"query": query, "max_results": max_results})

def browse_web(url, max_text_chars=7000):
    return _candle_call("browse_web", {"url": url, "max_text_chars": max_text_chars})

def read_file(path, max_bytes=8000):
    return _candle_call("read_file", {"path": path, "max_bytes": max_bytes})

def write_file(path, content, encoding="text"):
    return _candle_call("write_file", {"path": path, "content": content, "encoding": encoding})

def list_files(path="/home/user"):
    return _candle_call("list_files", {"path": path})

def http_request(url, method="GET", headers=None, body=None):
    return _candle_call("http_request", {"url": url, "method": method, "headers": headers, "body": body})
`;

const ptcSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Dispatch one RPC request to an allow-listed tool. Never throws. */
async function ptcDispatch(toolName: string, args: any): Promise<{ result?: unknown; error?: string }> {
  try {
    const a = args ?? {};
    let out: unknown;
    switch (toolName) {
      case "search_web":
        out = await searchWebTool.invoke({ query: String(a.query ?? ""), max_results: a.max_results } as any);
        break;
      case "browse_web":
        out = await browseWebTool.invoke({ url: String(a.url ?? ""), max_text_chars: a.max_text_chars } as any);
        break;
      case "read_file":
        out = await readSandboxFileTool.invoke({ path: String(a.path ?? ""), max_bytes: a.max_bytes } as any);
        break;
      case "write_file":
        out = await writeSandboxFileTool.invoke({ path: String(a.path ?? ""), content: String(a.content ?? ""), encoding: a.encoding } as any);
        break;
      case "list_files":
        out = await listSandboxFilesTool.invoke({ path: String(a.path ?? "/home/user") } as any);
        break;
      case "http_request":
        out = await httpRequestTool.invoke({ url: String(a.url ?? ""), method: a.method, headers: a.headers, body: a.body } as any);
        break;
      default:
        return { error: `tool not allowed via RPC: ${toolName}` };
    }
    return { result: typeof out === "string" ? out.slice(0, 16_000) : out };
  } catch (e: any) {
    return { error: String(e?.message ?? e).slice(0, 2_000) };
  }
}

export const runPythonWithToolsTool = tool(
  async ({ code, template_id }) => {
    const templateId = selectTemplateForTask("python", code, template_id);
    const maxCalls = ptcMaxRpcCalls();
    const maxWallMs = ptcMaxWallMs();
    const fullScript = `${PTC_PYTHON_PREAMBLE}\n\n# ===== user script =====\n${code}`;
    const scriptPath = `/home/user/candle_ptc_${Date.now()}.py`;
    const reqDir = `${PTC_RPC_ROOT}/req`;
    const respDir = `${PTC_RPC_ROOT}/resp`;

    let handle: any;
    try {
      // Fresh RPC dirs + script, then launch the script in the background.
      await runWithSandboxRetry(templateId, async (sb: any) => {
        await sb.commands.run(`rm -rf ${PTC_RPC_ROOT} && mkdir -p ${reqDir} ${respDir}`, {
          timeoutMs: 30_000,
          requestTimeoutMs: 30_000,
        });
        await sb.files.write(scriptPath, fullScript, { requestTimeoutMs: 60_000 });
      });
      handle = await runWithSandboxRetry(templateId, (sb: any) =>
        sb.commands.run(`python3 ${scriptPath}`, {
          background: true,
          timeoutMs: maxWallMs,
          requestTimeoutMs: 30_000,
        })
      );
    } catch (e: any) {
      return formatCommandError(e, "Programmatic execution (startup)");
    }

    let done = false;
    let result: any = null;
    let err: any = null;
    const waitPromise = handle
      .wait()
      .then((r: any) => { result = r; done = true; })
      .catch((e: any) => { err = e; done = true; });

    let seq = 0;
    let rpcCalls = 0;
    const deadline = Date.now() + maxWallMs;

    while (!done && Date.now() < deadline) {
      let entries: any[] = [];
      try {
        entries = await runWithSandboxRetry(templateId, (sb: any) => sb.files.list(reqDir, { requestTimeoutMs: 15_000 }));
      } catch {
        entries = [];
      }
      const hasNext = entries.some((e: any) => e?.name === `${seq}.done`);
      if (!hasNext) {
        await ptcSleep(200);
        continue;
      }

      rpcCalls += 1;
      let reqData: any = null;
      try {
        const raw = await runWithSandboxRetry(templateId, (sb: any) => sb.files.read(`${reqDir}/${seq}.json`, { requestTimeoutMs: 15_000 }));
        reqData = JSON.parse(typeof raw === "string" ? raw : String(raw));
      } catch {
        reqData = null;
      }

      let respObj: { result?: unknown; error?: string };
      if (rpcCalls > maxCalls) {
        respObj = { error: `RPC call limit (${maxCalls}) reached — stop calling candle tools and finish the script.` };
      } else if (!reqData || typeof reqData.tool !== "string") {
        respObj = { error: "malformed RPC request" };
      } else {
        respObj = await ptcDispatch(reqData.tool, reqData.args);
      }

      try {
        await runWithSandboxRetry(templateId, async (sb: any) => {
          await sb.files.write(`${respDir}/${seq}.json`, JSON.stringify(respObj), { requestTimeoutMs: 30_000 });
          await sb.files.write(`${respDir}/${seq}.done`, "1", { requestTimeoutMs: 15_000 });
        });
      } catch {
        // If we can't deliver the response the script will time out on its own.
      }
      seq += 1;
    }

    if (!done) {
      try { await handle.kill(); } catch { /* already gone */ }
      await Promise.race([waitPromise, ptcSleep(2_000)]);
    }

    const footer = `\n\n[${rpcCalls} tool call(s) made via RPC${rpcCalls > maxCalls ? `, limit ${maxCalls} hit` : ""}]`;
    if (err) {
      return redactSecrets(formatCommandError(err, "Programmatic execution") + footer);
    }
    if (result) {
      const stdout = (result.stdout ?? "").toString().trim();
      const stderr = (result.stderr ?? "").toString().trim();
      const body = [stdout ? `stdout:\n${stdout}` : "", stderr ? `stderr:\n${stderr}` : ""]
        .filter(Boolean)
        .join("\n\n") || "Script finished with no output.";
      return redactSecrets(body + footer);
    }
    return redactSecrets(`Programmatic execution timed out after ${Math.round(maxWallMs / 1000)}s and was killed.${footer}`);
  },
  {
    name: "run_python_with_tools",
    description:
      "Run a Python script in the sandbox that can call Candle's OWN tools as plain functions, so a whole multi-step pipeline runs as ONE turn with no intermediate context cost. " +
      "Available functions (call them directly — no import needed): " +
      "search_web(query, max_results=10), browse_web(url, max_text_chars=7000), read_file(path, max_bytes=8000), " +
      "write_file(path, content, encoding='text'), list_files(path='/home/user'), http_request(url, method='GET', headers=None, body=None). " +
      "Each returns the tool's raw string output; parse it in Python as needed. " +
      "Use this for loops over many items (e.g. search 10 queries and write a combined report) where calling tools one-by-one would flood the conversation. " +
      "print() whatever you want returned to you — only stdout comes back. " +
      `Hard caps: ${ptcMaxRpcCalls()} tool calls and ${Math.round(ptcMaxWallMs() / 1000)}s wall-clock per script.`,
    schema: z.object({
      code: z.string().describe("Python script body. Call search_web/read_file/write_file/etc. directly; print() the final result."),
      template_id: z.string().optional().describe(TEMPLATE_DESCRIPTIONS),
    }),
  }
);

/**
 * Tear down the sandbox for a specific session id (typically the WebSocket
 * connection id). Called from `server.ts` on connection close. Errors are
 * logged but not thrown — we never want cleanup to mask the original failure.
 */
export async function closeSandboxForSession(sessionId: string): Promise<void> {
  if (!sandboxes.has(sessionId)) return;
  await withSessionLock(sessionId, () => closeSandboxForSessionUnlocked(sessionId));
  sandboxes.delete(sessionId);
}
