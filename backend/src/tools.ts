import { tool } from "@langchain/core/tools";
import Kernel from "@onkernel/sdk";
import * as cheerio from "cheerio";
import { Sandbox as E2BSandbox } from "e2b";
import { z } from "zod";

// We'll manage a singleton E2B sandbox for the duration of the agent run
export let sandbox: any = null;
let currentTemplate = "";
let defaultE2BTemplate = process.env.E2B_TEMPLATE_ID || process.env.E2B_TEMPLATE_NAME || "lxq0wfatmw3i42mooiea";
const SANDBOX_TIMEOUT_MS = Number(process.env.SANDBOX_TIMEOUT_MS) || 900_000;
let sandboxLock: Promise<void> = Promise.resolve();

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

function selectTemplateForTask(_kind: string, _signal: string, requestedTemplate?: string) {
  return resolveTemplateId(requestedTemplate || currentTemplate || defaultE2BTemplate);
}

function templateNameForId(templateId: string) {
  return E2B_TEMPLATES.find((item) => item.id === templateId)?.name ?? templateId;
}

function selectTemplateForCurrentSandbox(kind: string, signal: string, requestedTemplate?: string) {
  return selectTemplateForTask(kind, signal, requestedTemplate);
}

async function withSandboxLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = sandboxLock;
  let release!: () => void;
  sandboxLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

const initSandboxUnlocked = async (templateId: string = defaultE2BTemplate) => {
  const resolvedTemplateId = resolveTemplateId(templateId);
  if (sandbox && currentTemplate !== resolvedTemplateId) {
    await closeSandboxUnlocked();
    sandbox = null;
  }
  if (!sandbox) {
    sandbox = await E2BSandbox.create(resolvedTemplateId, { timeoutMs: SANDBOX_TIMEOUT_MS });
    currentTemplate = resolvedTemplateId;
  }
  return sandbox;
};

const closeSandboxUnlocked = async () => {
  if (sandbox) {
    if (typeof sandbox.kill === "function") {
      await sandbox.kill();
    }
    sandbox = null;
    currentTemplate = "";
  }
};

export const initSandbox = async (templateId: string = defaultE2BTemplate) =>
  withSandboxLock(() => initSandboxUnlocked(templateId));

export const closeSandbox = async () =>
  withSandboxLock(() => closeSandboxUnlocked());

async function getLiveSandboxUnlocked(templateId: string = defaultE2BTemplate) {
  if (!sandbox || currentTemplate !== templateId) {
    return initSandboxUnlocked(resolveTemplateId(templateId));
  }

  if (typeof sandbox.isRunning === "function") {
    try {
      const running = await sandbox.isRunning({ requestTimeoutMs: 10_000 });
      if (!running) {
        await closeSandboxUnlocked();
        return initSandboxUnlocked(resolveTemplateId(templateId));
      }
    } catch {
      await closeSandboxUnlocked();
      return initSandboxUnlocked(resolveTemplateId(templateId));
    }
  }

  return sandbox;
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

async function runWithSandboxRetry<T>(
  templateId: string,
  operation: (liveSandbox: any) => Promise<T>
) {
  return withSandboxLock(async () => {
    try {
      return await operation(await getLiveSandboxUnlocked(templateId));
    } catch (error) {
      if (!isStaleSandboxError(error)) throw error;
      await closeSandboxUnlocked();
      return operation(await initSandboxUnlocked(templateId));
    }
  });
}

const TEMPLATE_DESCRIPTIONS =
  "Optional E2B template ID/name. Set this only when you intentionally choose a sandbox environment; otherwise the current/default sandbox is used.";

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
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
      return `Failed to run python code: ${e.message}`;
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

      const templateId = selectTemplateForTask("terminal", command, template_id);
      const exec = await runWithSandboxRetry<{ stdout?: string; stderr?: string }>(templateId, (liveSandbox) =>
        liveSandbox.commands.run(command, {
          timeoutMs: 120_000,
          requestTimeoutMs: 120_000,
        })
      );
      return `stdout:\n${exec.stdout ?? ""}\nstderr:\n${exec.stderr ?? ""}`;
    } catch (e: any) {
      return `Failed to run command: ${e.message}`;
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
      return `Failed to run Node.js code: ${e.message}`;
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(Math.max(timeout_ms || 30_000, 1000), 120_000));
    try {
      const response = await fetch(url, {
        method: method || "GET",
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
    description: "Set the default E2B template for subsequent Python, terminal, file, artifact, and download tools.",
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

async function searchViaYouCom(query: string, targetCount: number): Promise<any[] | null> {
  const apiKey = process.env.YOUCOM_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    const params = new URLSearchParams({
      query,
      count: String(Math.min(Math.max(targetCount, 1), 20)),
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    const response = await fetch(`https://ydc-index.io/v1/search?${params.toString()}`, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        "Accept": "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

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

async function searchViaDuckDuckGo(query: string, targetCount: number): Promise<any[] | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    // DuckDuckGo HTML lite endpoint (no API key needed)
    const params = new URLSearchParams({ q: query, kl: "us-en" });
    const response = await fetch(`https://html.duckduckgo.com/html/?${params.toString()}`, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

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

async function searchViaBrave(query: string, targetCount: number): Promise<any[] | null> {
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

    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params.toString()}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Subscription-Token": apiKey,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

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
    for (let start = 1; results.length < targetCount && start <= 91; start += 10) {
      const url = new URL("https://www.googleapis.com/customsearch/v1");
      url.searchParams.set("key", apiKey);
      url.searchParams.set("cx", cx);
      url.searchParams.set("q", query);
      url.searchParams.set("num", String(Math.min(10, targetCount - results.length)));
      url.searchParams.set("start", String(start));

      const response = await fetch(url, { signal: controller.signal });
      const payload = await response.json() as any;
      clearTimeout(timeout);

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
    const proxy = await withTimeout(
      kernel.proxies.create({ type: "residential", config: { country: "US" }, name: "candle-search" }),
      15_000,
      "Kernel residential proxy creation"
    );
    proxyId = proxy.id;
  }

  const session = await withTimeout(
    kernel.browsers.create({
      stealth: true,
      headless: opts?.headless ?? true,
      timeout_seconds: timeoutSec,
      viewport: mobile ? { width: 390, height: 844 } : { width: 1365, height: 900 },
      ...(proxyId ? { proxy_id: proxyId } : {}),
    }),
    20_000,
    "Kernel browser creation"
  );

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

async function searchGoogleViaKernel(query: string, targetCount: number) {
  return withKernelBrowser(async (sessionId) => {
    const code = `
      const results = [];
      const seen = new Set();
      const targetCount = ${targetCount};

      for (let start = 0; results.length < targetCount && start <= 30; start += 10) {
        const url = new URL("https://www.google.com/search");
        url.searchParams.set("q", ${JSON.stringify(query)});
        url.searchParams.set("hl", "en");
        url.searchParams.set("num", String(Math.min(10, targetCount - results.length)));
        url.searchParams.set("filter", "0");
        url.searchParams.set("pws", "0");
        if (start > 0) url.searchParams.set("start", String(start));

        await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(2000);

        // CAPTCHA handling: wait for Kernel auto-CAPTCHA solver
        let pageUrl = page.url();
        if (pageUrl.includes("/sorry/") || pageUrl.includes("consent.google")) {
          for (let attempt = 0; attempt < 4; attempt++) {
            await page.waitForTimeout(5000);
            pageUrl = page.url();
            if (!pageUrl.includes("/sorry/") && !pageUrl.includes("consent.google")) break;
          }
          if (pageUrl.includes("/sorry/")) {
            throw new Error("Google CAPTCHA not resolved");
          }
        }

        const html = await page.content();
        let addedThisPage = 0;

        const links = await page.$$eval('#search a[href]', (els) => {
          return els.map(el => {
            const h3 = el.querySelector('h3');
            const title = h3 ? h3.innerText.replace(/\\s+/g, ' ').trim() : '';
            const href = el.getAttribute('href') || '';
            const container = el.closest('div')?.parentElement;
            const snippet = container ? container.innerText.replace(/\\s+/g, ' ').trim() : '';
            return { title, href, snippet };
          }).filter(l => l.title);
        });

        for (const link of links) {
          if (results.length >= targetCount) break;
          let resultUrl = link.href;
          try {
            const u = new URL(resultUrl, "https://www.google.com");
            const q = u.searchParams.get("q") || u.searchParams.get("url");
            if (q) resultUrl = decodeURIComponent(q);
            else resultUrl = u.toString();
          } catch {}
          if (!/^https?:\\/\\//.test(resultUrl)) continue;
          try {
            const hostname = new URL(resultUrl).hostname.replace(/^www\\./, "");
            if (hostname === "google.com" || hostname.endsWith(".google.com") || hostname === "gstatic.com") continue;
          } catch { continue; }
          if (seen.has(resultUrl)) continue;
          seen.add(resultUrl);
          addedThisPage++;
          results.push({
            rank: results.length + 1,
            title: link.title,
            url: resultUrl,
            snippet: link.snippet.replace(link.title, '').trim().slice(0, 320),
            source: "google"
          });
        }
        if (addedThisPage === 0) break;
      }
      return results;
    `;
    return await kernelPlaywright(sessionId, code, 90);
  }, { timeoutMs: 120_000, headless: false, useResidentialProxy: true });
}

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
  async ({ query, max_results }) => {
    try {
      const targetCount = boundedSearchResultCount(max_results);

      // Check cache first
      const cached = getCachedSearch(query);
      if (cached) {
        console.log(`[search] cache hit for: ${query.slice(0, 60)}`);
        return JSON.stringify(cached.slice(0, targetCount));
      }

      // Run fast API-based providers in parallel
      const [youResults, braveResults, ddgResults, googleApiResults] = await Promise.allSettled([
        searchViaYouCom(query, targetCount),
        searchViaBrave(query, targetCount),
        searchViaDuckDuckGo(query, targetCount),
        searchGoogleCustomSearch(query, targetCount),
      ]);

      // Collect all successful results, prioritizing by quality
      const allResults: any[] = [];

      // Priority 1: you.com (best snippets)
      if (youResults.status === "fulfilled" && youResults.value) {
        allResults.push(...youResults.value);
      }
      // Priority 2: Brave (good quality, fast)
      if (braveResults.status === "fulfilled" && braveResults.value) {
        allResults.push(...braveResults.value);
      }
      // Priority 3: Google Custom Search API
      if (googleApiResults.status === "fulfilled" && googleApiResults.value) {
        allResults.push(...googleApiResults.value);
      }
      // Priority 4: DuckDuckGo (no API key, always available)
      if (ddgResults.status === "fulfilled" && ddgResults.value) {
        allResults.push(...ddgResults.value);
      }

      // Deduplicate and take top results
      if (allResults.length > 0) {
        const final = deduplicateResults(allResults, targetCount);
        setCachedSearch(query, final);
        console.log(`[search] ${final.length} results for: ${query.slice(0, 60)} (sources: ${[...new Set(final.map(r => r.source))].join(", ")})`);
        return JSON.stringify(final);
      }

      // Fallback: Google via Kernel stealth browser (slowest but most reliable)
      console.log(`[search] all fast providers failed, falling back to Kernel browser for: ${query.slice(0, 60)}`);
      const googleResults = await searchGoogleViaKernel(query, targetCount);
      if (Array.isArray(googleResults) && googleResults.length > 0) {
        const final = deduplicateResults(googleResults, targetCount);
        setCachedSearch(query, final);
        return JSON.stringify(final);
      }

      return JSON.stringify([{ rank: 1, title: "No results found", url: "", snippet: "Search returned no results for this query. Try different keywords or rephrase.", source: "none" }]);
    } catch (e: any) {
      return `Failed to search web: ${e.message}`;
    }
  },
  {
    name: "search_web",
    description: "Search the web using multiple providers in parallel (you.com, Brave, DuckDuckGo, Google). Returns deduplicated structured results with titles, URLs, and snippets. Fast and reliable.",
    schema: z.object({
      query: z.string().describe("The search query."),
      max_results: z.number().optional().describe("How many organic results to return. Defaults to 10; maximum 25."),
    }),
  }
);

export const browseWebTool = tool(
  async ({ url, max_text_chars }) => {
    try {
      const maxChars = Math.max(1000, Math.min(20_000, max_text_chars ?? 7000));
      return await withKernelBrowser(async (sessionId, session) => {
        const snapshot = await kernelPlaywright(sessionId, `
          await page.goto(${JSON.stringify(url)}, { waitUntil: "domcontentloaded", timeout: 35000 });
          await page.waitForTimeout(1500);
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
        `, 45);
        return JSON.stringify({
          ...snapshot,
          liveViewUrl: session.browser_live_view_url || null,
        });
      }, { timeoutMs: 45_000 });
    } catch (e: any) {
      return `Failed to browse web: ${e.message}`;
    }
  },
  {
    name: "browse_web",
    description: "Fetch/read a page through a Kernel stealth browser and return the final URL, title, meta description, headings, useful links, and visible text.",
    schema: z.object({
      url: z.string().describe("The URL to visit."),
      max_text_chars: z.number().optional().describe("Maximum visible page text characters to return. Defaults to 7000; maximum 20000."),
    }),
  }
);

export const screenshotAnalyzeTool = tool(
  async ({ url, question, template_id }) => {
    try {
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

      // Save screenshot to sandbox and run basic analysis
      const templateId = selectTemplateForTask("screenshot", url, template_id);
      const analysis = await runWithSandboxRetry(templateId, async (liveSandbox) => {
        const screenshotPath = `/home/user/screenshot_${Date.now()}.png`;
        const imageData = Uint8Array.from(Buffer.from(screenshotBase64, "base64"));
        await liveSandbox.files.write(screenshotPath, imageData, { requestTimeoutMs: 60_000 });

        const code = `
import json, os, subprocess, sys

screenshot_path = ${JSON.stringify(`/home/user/screenshot_${Date.now()}.png`)}
# Use the actual saved path
import glob
screenshots = sorted(glob.glob("/home/user/screenshot_*.png"), key=os.path.getmtime, reverse=True)
screenshot_path = screenshots[0] if screenshots else screenshot_path

# Get basic image info
result = subprocess.run(["file", screenshot_path], capture_output=True, text=True)
file_info = result.stdout.strip()

# Try OCR if tesseract is available
ocr_text = ""
try:
    result = subprocess.run(
        ["tesseract", screenshot_path, "stdout", "-l", "eng+mya"],
        capture_output=True, text=True, timeout=30
    )
    ocr_text = result.stdout.strip()[:4000]
except Exception:
    # Try installing tesseract
    try:
        subprocess.run(["apt-get", "install", "-y", "-qq", "tesseract-ocr"], capture_output=True, timeout=60)
        result = subprocess.run(
            ["tesseract", screenshot_path, "stdout"],
            capture_output=True, text=True, timeout=30
        )
        ocr_text = result.stdout.strip()[:4000]
    except Exception as e:
        ocr_text = f"OCR unavailable: {e}"

# Get image dimensions
try:
    from PIL import Image
    img = Image.open(screenshot_path)
    dimensions = f"{img.width}x{img.height}"
except Exception:
    dimensions = "unknown"

print(json.dumps({
    "path": screenshot_path,
    "fileInfo": file_info,
    "dimensions": dimensions,
    "ocrText": ocr_text,
    "sizeBytes": os.path.getsize(screenshot_path),
}, ensure_ascii=False))
`;
        const exec = await liveSandbox.commands.run(`python3 -c ${JSON.stringify(code)}`, {
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
