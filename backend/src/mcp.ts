/**
 * ============================================================================
 * MCP HOST INTEGRATION
 * ============================================================================
 * Lets Candle plug in external Model Context Protocol servers at runtime.
 * Each connected server contributes its tools to the agent's `parentTools`
 * array — no code changes or restarts required when configuring a new
 * community server, just an env-var update.
 *
 * Loading order, matching the rest of the bootstrap:
 *   server.ts → initMcpHost() → llm.ts (re-binds tools) → wss.listen()
 *
 * The host is intentionally fail-soft: any server that fails to connect is
 * logged and skipped. The agent still works on the local tool set.
 *
 * Configuration (backend/.env):
 *   MCP_SERVERS                JSON array, see types below
 *   MCP_DEFAULT_TIMEOUT_MS     Per-tool-call timeout (default 30 000)
 *   MCP_TOOL_PREFIX            Optional namespace prefix for imported tools
 *
 * Example MCP_SERVERS value:
 *   [
 *     {
 *       "name": "fs",
 *       "transport": "stdio",
 *       "command": "npx",
 *       "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
 *     },
 *     {
 *       "name": "github",
 *       "transport": "http",
 *       "url": "https://mcp.example.com",
 *       "headers": { "Authorization": "Bearer ..." }
 *     }
 *   ]
 */

import { redactSecrets } from "./security";

export type McpTransport = "stdio" | "http" | "sse";

export interface McpServerConfig {
  /** Friendly name used in logs and (optionally) as a tool prefix. */
  name: string;
  /** Transport. `stdio` spawns a child process; `http`/`sse` connects over the network. */
  transport: McpTransport;
  /** stdio only — command to spawn (e.g. "npx", "uvx"). */
  command?: string;
  /** stdio only — argv. */
  args?: string[];
  /** stdio only — env vars to pass to the child. */
  env?: Record<string, string>;
  /** http/sse only — server URL. */
  url?: string;
  /** http/sse only — request headers. */
  headers?: Record<string, string>;
  /** Disable the server without removing the entry. */
  disabled?: boolean;
}

interface LoadedServer {
  name: string;
  toolNames: string[];
  closer?: () => Promise<void>;
}

let mcpTools: any[] = [];
let loadedServers: LoadedServer[] = [];
let initStarted = false;
let initPromise: Promise<void> | null = null;

/**
 * Tools contributed by all currently-connected MCP servers. Empty array
 * before `initMcpHost()` resolves; safe to read at any time.
 */
export function getMcpTools(): any[] {
  return mcpTools;
}

/**
 * Compact catalog string for the system prompt. Helps the model discover
 * what extra tools are available without bloating the static prompt — only
 * a name + (optional) one-line description per tool.
 */
export function getMcpCatalogText(): string {
  if (mcpTools.length === 0) {
    return "(no MCP servers connected — set MCP_SERVERS in the backend env to add external tools)";
  }
  const lines: string[] = [];
  for (const server of loadedServers) {
    if (server.toolNames.length === 0) continue;
    lines.push(`- ${server.name} → ${server.toolNames.join(", ")}`);
  }
  return lines.join("\n") || "(no tools exposed by configured MCP servers)";
}

function parseServerConfigs(): McpServerConfig[] {
  const raw = (process.env.MCP_SERVERS ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn("[mcp] MCP_SERVERS must be a JSON array — ignoring.");
      return [];
    }
    return parsed.filter((entry): entry is McpServerConfig => {
      if (!entry || typeof entry !== "object") return false;
      if (typeof entry.name !== "string" || !entry.name.trim()) return false;
      if (entry.transport !== "stdio" && entry.transport !== "http" && entry.transport !== "sse") {
        console.warn(`[mcp] Server "${entry.name}" has invalid transport — skipping.`);
        return false;
      }
      if (entry.transport === "stdio" && !entry.command) {
        console.warn(`[mcp] Server "${entry.name}" missing command — skipping.`);
        return false;
      }
      if ((entry.transport === "http" || entry.transport === "sse") && !entry.url) {
        console.warn(`[mcp] Server "${entry.name}" missing url — skipping.`);
        return false;
      }
      return true;
    });
  } catch (err: any) {
    console.warn(`[mcp] Failed to parse MCP_SERVERS: ${err?.message ?? err}`);
    return [];
  }
}

/**
 * Connect to all configured MCP servers, collect their tools, and stash them
 * for `getMcpTools()`. Idempotent — repeated calls return the same promise.
 *
 * Failures on individual servers are logged but do not fail the bootstrap.
 */
export async function initMcpHost(): Promise<void> {
  if (initStarted && initPromise) return initPromise;
  initStarted = true;

  initPromise = (async () => {
    const configs = parseServerConfigs().filter((c) => !c.disabled);
    if (configs.length === 0) {
      console.log("[mcp] No MCP servers configured — running with local tools only.");
      return;
    }

    let MultiServerMCPClient: any;
    try {
      // Lazy import keeps the dep optional for users who don't enable MCP.
      ({ MultiServerMCPClient } = require("@langchain/mcp-adapters"));
    } catch (err: any) {
      console.warn(
        `[mcp] @langchain/mcp-adapters not installed — skipping MCP host. Run "npm install @langchain/mcp-adapters" to enable.`
      );
      return;
    }

    const defaultTimeout = Number(process.env.MCP_DEFAULT_TIMEOUT_MS) || 30_000;
    const prefix = (process.env.MCP_TOOL_PREFIX ?? "").trim();

    // The adapter expects a flat record { serverName: serverConfig }.
    const mcpServers: Record<string, any> = {};
    for (const cfg of configs) {
      if (cfg.transport === "stdio") {
        mcpServers[cfg.name] = {
          transport: "stdio",
          command: cfg.command!,
          args: cfg.args ?? [],
          env: cfg.env ?? {},
        };
      } else {
        mcpServers[cfg.name] = {
          transport: cfg.transport,
          url: cfg.url!,
          headers: cfg.headers ?? {},
        };
      }
    }

    let client: any;
    try {
      client = new MultiServerMCPClient({
        mcpServers,
        prefixToolNameWithServerName: Boolean(prefix),
        additionalToolNamePrefix: prefix || undefined,
        useStandardContentBlocks: true,
        defaultToolTimeout: defaultTimeout,
      });

      const tools = await client.getTools();
      mcpTools = Array.isArray(tools) ? tools : [];

      // Group tool names by server for the catalog block.
      loadedServers = configs.map((cfg) => {
        const serverPrefix = prefix ? `${prefix}_${cfg.name}__` : `${cfg.name}__`;
        const owned = mcpTools
          .map((t: any) => t?.name)
          .filter((n: string) => typeof n === "string" && n.startsWith(serverPrefix));
        return {
          name: cfg.name,
          toolNames: owned,
          closer: undefined,
        };
      });

      console.log(
        `[mcp] Connected ${configs.length} server(s); imported ${mcpTools.length} tool(s).`
      );
      for (const server of loadedServers) {
        if (server.toolNames.length > 0) {
          console.log(`[mcp]   ${server.name}: ${server.toolNames.join(", ")}`);
        }
      }

      // Register a single shutdown closer for the whole client.
      loadedServers[0] = loadedServers[0] ?? { name: "_root", toolNames: [] };
      loadedServers[0].closer = async () => {
        try {
          await client.close();
        } catch (err: any) {
          console.warn(`[mcp] Error closing MCP client: ${redactSecrets(String(err?.message ?? err))}`);
        }
      };
    } catch (err: any) {
      console.warn(`[mcp] Failed to initialise MCP client: ${redactSecrets(String(err?.message ?? err))}`);
      mcpTools = [];
      loadedServers = [];
    }
  })();

  return initPromise;
}

/**
 * Disconnect every configured MCP server. Called from `server.ts` on
 * graceful shutdown so child processes don't linger.
 */
export async function shutdownMcpHost(): Promise<void> {
  for (const server of loadedServers) {
    if (server.closer) {
      try {
        await server.closer();
      } catch {
        /* already logged */
      }
    }
  }
  loadedServers = [];
  mcpTools = [];
  initStarted = false;
  initPromise = null;
}
