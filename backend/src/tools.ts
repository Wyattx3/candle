import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { Sandbox as E2BSandbox } from "e2b";
import Steel from "steel-sdk";
import puppeteer from "puppeteer-core";
import * as cheerio from "cheerio";

// We'll manage a singleton E2B sandbox for the duration of the agent run
export let sandbox: any = null;
let currentTemplate = "";
let defaultE2BTemplate = "nlhz8vlwyupq845jsdg9";
const SANDBOX_TIMEOUT_MS = 900_000;

const E2B_TEMPLATES = [
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

export const initSandbox = async (templateId: string = defaultE2BTemplate) => {
  const resolvedTemplateId = resolveTemplateId(templateId);
  if (sandbox && currentTemplate !== resolvedTemplateId) {
    await closeSandbox();
    sandbox = null;
  }
  if (!sandbox) {
    sandbox = await E2BSandbox.create(resolvedTemplateId, { timeoutMs: SANDBOX_TIMEOUT_MS });
    currentTemplate = resolvedTemplateId;
  }
  return sandbox;
};

export const closeSandbox = async () => {
  if (sandbox) {
    if (typeof sandbox.kill === "function") {
      await sandbox.kill();
    }
    sandbox = null;
    currentTemplate = "";
  }
};

async function getLiveSandbox(templateId: string = defaultE2BTemplate) {
  if (!sandbox || currentTemplate !== templateId) {
    return initSandbox(resolveTemplateId(templateId));
  }

  if (typeof sandbox.isRunning === "function") {
    try {
      const running = await sandbox.isRunning({ requestTimeoutMs: 10_000 });
      if (!running) {
        await closeSandbox();
        return initSandbox(resolveTemplateId(templateId));
      }
    } catch {
      await closeSandbox();
      return initSandbox(resolveTemplateId(templateId));
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
  try {
    return await operation(await getLiveSandbox(templateId));
  } catch (error) {
    if (!isStaleSandboxError(error)) throw error;
    await closeSandbox();
    return operation(await initSandbox(templateId));
  }
}

const TEMPLATE_DESCRIPTIONS =
  "Optional E2B template ID/name. Set this only when you intentionally choose a sandbox environment; otherwise the current/default sandbox is used.";

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
  "browser interaction and form workflows",
  "sandboxed Python and terminal execution",
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

function cleanDuckDuckGoUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl, "https://duckduckgo.com");
    const redirected = url.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : url.toString();
  } catch {
    return rawUrl;
  }
}

function getSteelApiKey() {
  return process.env.STEEL_API_KEY?.trim();
}

function steelWsEndpoint(session: any, apiKey: string) {
  const raw = session.websocketUrl || `wss://connect.steel.dev?sessionId=${session.id}`;
  const separator = raw.includes("?") ? "&" : "?";
  return raw.includes("apiKey=") ? raw : `${raw}${separator}apiKey=${encodeURIComponent(apiKey)}`;
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

async function withSteelBrowser<T>(
  task: (page: Awaited<ReturnType<Awaited<ReturnType<typeof puppeteer.connect>>["newPage"]>>, session: any) => Promise<T>,
  opts?: { mobile?: boolean; timeoutMs?: number; useProxy?: boolean; solveCaptcha?: boolean }
) {
  const apiKey = getSteelApiKey();
  if (!apiKey) throw new Error("STEEL_API_KEY is not set.");

  const client = new Steel({ steelAPIKey: apiKey });
  const timeoutMs = opts?.timeoutMs ?? 45_000;
  const session = await withTimeout(client.sessions.create({
    headless: true,
    useProxy: opts?.useProxy ?? false,
    solveCaptcha: opts?.solveCaptcha ?? false,
    timeout: timeoutMs,
    dimensions: opts?.mobile ? { width: 390, height: 844 } : { width: 1365, height: 900 },
    deviceConfig: opts?.mobile ? { device: "mobile" } : { device: "desktop" },
    stealthConfig: {
      autoCaptchaSolving: true,
      humanizeInteractions: true,
    },
  } as any), 20_000, "Steel session creation");

  let browser: Awaited<ReturnType<typeof puppeteer.connect>> | undefined;
  try {
    browser = await withTimeout(
      puppeteer.connect({ browserWSEndpoint: steelWsEndpoint(session, apiKey), protocolTimeout: timeoutMs }),
      20_000,
      "Steel browser connection"
    );
    const page = await withTimeout(browser.newPage(), 10_000, "Steel page creation");
    return await withTimeout(task(page, session), timeoutMs, "Steel browser task");
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    await client.sessions.release(session.id).catch(() => undefined);
  }
}

const ANDROID_APP_ALIASES: Record<string, { name: string; packageId: string; publisher: string; official?: string }> = {
  "coc": {
    name: "Clash of Clans",
    packageId: "com.supercell.clashofclans",
    publisher: "Supercell",
    official: "https://supercell.com/en/games/clashofclans/",
  },
  "clash of clans": {
    name: "Clash of Clans",
    packageId: "com.supercell.clashofclans",
    publisher: "Supercell",
    official: "https://supercell.com/en/games/clashofclans/",
  },
};

export const officialAndroidAppTool = tool(
  async ({ app_name }) => {
    const normalized = app_name.toLowerCase().replace(/\s+/g, " ").trim();
    const known = ANDROID_APP_ALIASES[normalized];

    if (known) {
      return JSON.stringify({
        name: known.name,
        publisher: known.publisher,
        packageId: known.packageId,
        googlePlayUrl: `https://play.google.com/store/apps/details?id=${known.packageId}`,
        officialUrl: known.official,
        note: "Use the official Google Play/developer link for installation. Do not mirror the APK unless the publisher provides an official direct APK.",
      });
    }

    const query = encodeURIComponent(app_name);
    return JSON.stringify({
      name: app_name,
      googlePlaySearchUrl: `https://play.google.com/store/search?q=${query}&c=apps`,
      webSearchUrl: `https://www.google.com/search?q=${query}+official+Android+app+Google+Play`,
      note: "No known package mapping is configured. Use the official Google Play or publisher listing, not cracked/modded APK mirrors.",
    });
  },
  {
    name: "official_android_app",
    description: "Return official Android app/game install sources such as Google Play or the publisher website. Use this for Android app download requests before doing slower web browsing.",
    schema: z.object({
      app_name: z.string().describe("The Android app or game name, for example Clash of Clans or COC."),
    }),
  }
);

export const searchWebTool = tool(
  async ({ query }) => {
    try {
      return await withSteelBrowser(async (page) => {
        page.setDefaultNavigationTimeout(15_000);
        await page.goto(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, {
          waitUntil: "domcontentloaded",
          timeout: 15_000,
        });
        const html = await page.content();
        const $ = cheerio.load(html);
        const results: any[] = [];
        $("a[href]").each((_, el) => {
          if (results.length >= 5) return false;
          const title = $(el).text().replace(/\s+/g, " ").trim();
          const rawUrl = $(el).attr("href") || "";
          const url = cleanDuckDuckGoUrl(rawUrl);
          if (!title || !/^https?:\/\//i.test(url)) return;
          if (/duckduckgo\.com/i.test(url)) return;
          const snippet = $(el).closest("tr, li, div").text().replace(/\s+/g, " ").trim().slice(0, 240);
          results.push({ title, url, snippet });
        });
        return JSON.stringify(results);
      }, { timeoutMs: 30_000 });
    } catch (e: any) {
      return `Failed to search web via Steel: ${e.message}`;
    }
  },
  {
    name: "search_web",
    description: "Search the web autonomously through a Steel cloud browser session. Returns structured search results.",
    schema: z.object({ query: z.string().describe("The search query.") }),
  }
);

export const browseWebTool = tool(
  async ({ url }) => {
    try {
      return await withSteelBrowser(async (page, session) => {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        const text = await page.evaluate(() => {
          if (document && document.body) return document.body.innerText;
          if (document && document.documentElement) return document.documentElement.innerText;
          return "";
        });
        const title = await page.title().catch(() => "");
        return JSON.stringify({
          url: page.url(),
          title,
          sessionViewerUrl: session.sessionViewerUrl,
          text: text.replace(/\s+/g, " ").trim().slice(0, 5000),
        });
      }, { timeoutMs: 45_000 });
    } catch (e: any) {
      return `Failed to browse web via Steel: ${e.message}`;
    }
  },
  {
    name: "browse_web",
    description: "Load a URL through Steel and return the page title, final URL, visible text, and Steel session viewer URL.",
    schema: z.object({ url: z.string().describe("The URL to visit.") }),
  }
);

const browserActionSchema = z.object({
  type: z.enum(["goto", "click", "type", "select", "wait", "extract"]),
  selector: z.string().optional().describe("CSS selector for click/type/select/extract actions."),
  text: z.string().optional().describe("Text to type for type actions."),
  value: z.string().optional().describe("Value to select for select actions."),
  url: z.string().optional().describe("URL for goto actions."),
  milliseconds: z.number().optional().describe("Delay for wait actions."),
});

export const browserInteractTool = tool(
  async ({ url, actions, mobile }) => {
    try {
      return await withSteelBrowser(async (page, session) => {
        if (url) await page.goto(url, { waitUntil: "domcontentloaded" });

        const extracted: Array<{ selector?: string; text: string }> = [];
        for (const action of actions) {
          if (action.type === "goto") {
            if (!action.url) return "Browser interaction failed: goto action requires a URL.";
            await page.goto(action.url, { waitUntil: "domcontentloaded" });
          } else if (action.type === "click") {
            if (!action.selector) return "Browser interaction failed: click action requires a selector.";
            await page.waitForSelector(action.selector, { timeout: 15_000 });
            await page.click(action.selector);
          } else if (action.type === "type") {
            if (!action.selector) return "Browser interaction failed: type action requires a selector.";
            await page.waitForSelector(action.selector, { timeout: 15_000 });
            await page.click(action.selector, { clickCount: 3 });
            await page.type(action.selector, action.text ?? "");
          } else if (action.type === "select") {
            if (!action.selector) return "Browser interaction failed: select action requires a selector.";
            await page.waitForSelector(action.selector, { timeout: 15_000 });
            await page.select(action.selector, action.value ?? "");
          } else if (action.type === "wait") {
            await new Promise((resolve) => setTimeout(resolve, action.milliseconds ?? 1000));
          } else if (action.type === "extract") {
            const text = action.selector
              ? await page.$eval(action.selector, (el) => (el as HTMLElement).innerText || (el as HTMLInputElement).value || "")
              : await page.evaluate(() => document.body.innerText);
            extracted.push({ selector: action.selector, text: String(text).replace(/\s+/g, " ").trim().slice(0, 4000) });
          }
        }

        const finalUrl = page.url();
        const title = await page.title().catch(() => "");
        const bodyText = extracted.length
          ? extracted
          : [{ text: (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").trim().slice(0, 4000) }];
        return JSON.stringify({ finalUrl, title, sessionViewerUrl: session.sessionViewerUrl, extracted: bodyText });
      }, { mobile, timeoutMs: 90_000 });
    } catch (e: any) {
      return `Failed to interact with browser via Steel: ${e.message}`;
    }
  },
  {
    name: "browser_interact",
    description: "Use Steel to open pages, click, type into forms, select values, wait, and extract visible text. Use for form filling and web task execution.",
    schema: z.object({
      url: z.string().optional().describe("Initial URL to open before running actions."),
      actions: z.array(browserActionSchema).describe("Ordered browser actions to perform."),
      mobile: z.boolean().optional().describe("Run the Steel browser session in mobile viewport/device mode."),
    }),
  }
);
