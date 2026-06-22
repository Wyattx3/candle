/**
 * Pure helpers for the chat agent — WebSocket URL resolution, tool-name
 * mapping, target extraction, and small string utilities. Kept free of React
 * so they can be unit-tested in isolation.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { ApprovalRisk, HistoryMessage, MessageItem } from './chat-types';

/** Convert an http(s) origin to its ws(s) equivalent. */
export function toWebSocketUrl(httpUrl: string): string {
  if (httpUrl.startsWith('https://')) return 'wss://' + httpUrl.slice('https://'.length);
  if (httpUrl.startsWith('http://')) return 'ws://' + httpUrl.slice('http://'.length);
  return httpUrl;
}

/**
 * Best-effort discovery of the dev machine host from the Expo manifest, so a
 * physical device / emulator can reach the backend running on the same LAN.
 */
export function getExpoHost(): string | null {
  const c = Constants as unknown as {
    expoConfig?: { hostUri?: string };
    manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
    manifest?: { debuggerHost?: string; hostUri?: string };
  };
  const candidates = [
    c.expoConfig?.hostUri,
    c.manifest2?.extra?.expoClient?.hostUri,
    c.manifest?.debuggerHost,
    c.manifest?.hostUri,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      const host = candidate.split(':')[0];
      if (host) return host;
    }
  }
  return null;
}

const BACKEND_PORT = 3000;

/**
 * Resolve the WebSocket URL the chat agent should connect to.
 *
 * Priority:
 *   1. `EXPO_PUBLIC_WS_URL` (already a ws/wss URL, used verbatim).
 *   2. `EXPO_PUBLIC_BACKEND_URL` (http/https origin → ws/wss).
 *   3. The Expo dev host (port 3000).
 *   4. Platform localhost fallback (Android emulator → 10.0.2.2).
 */
export function getWebSocketUrl(): string {
  const explicitWs = process.env.EXPO_PUBLIC_WS_URL;
  if (explicitWs && explicitWs.length > 0) return explicitWs;

  const explicitBackend = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (explicitBackend && explicitBackend.length > 0) {
    return toWebSocketUrl(explicitBackend.replace(/\/+$/, ''));
  }

  const expoHost = getExpoHost();
  if (expoHost) return `ws://${expoHost}:${BACKEND_PORT}`;

  const fallbackHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  return `ws://${fallbackHost}:${BACKEND_PORT}`;
}

/** Monotonic-ish id generator for stream nodes / messages. */
let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

/** Maps a backend tool name to a short, human action label for the UI. */
export function toolActionName(toolName: string): string {
  switch (toolName) {
    case 'search_web':
    case 'semantic_search':
      return 'Search';
    case 'research':
      return 'Research';
    case 'finance_research':
      return 'Finance';
    case 'browse_web':
      return 'Browse';
    case 'browser_interact':
    case 'sandbox_browser':
      return 'Browser';
    case 'screenshot_analyze':
      return 'Screenshot';
    case 'run_python':
    case 'run_python_with_tools':
      return 'Python';
    case 'run_node':
      return 'Node';
    case 'run_terminal':
      return 'Terminal';
    case 'install_packages':
      return 'Install';
    case 'http_request':
      return 'Request';
    case 'spawn_subagent':
      return 'Subagent';
    case 'spawn_subagents_parallel':
      return 'Workers';
    case 'skill_view':
    case 'skill_manage':
      return 'Skill';
    case 'write_sandbox_file':
    case 'read_sandbox_file':
    case 'inspect_sandbox_file':
    case 'manage_sandbox_files':
    case 'create_artifact':
    case 'list_sandbox_files':
    case 'get_sandbox_file_url':
      return 'File';
    case 'patch':
      return 'Edit';
    case 'download_video':
      return 'Video';
    case 'list_e2b_templates':
    case 'set_e2b_template':
      return 'E2B';
    case 'capability_catalog':
      return 'Toolbox';
    case 'app_source':
      return 'App';
    case 'cronjob':
      return 'Schedule';
    case 'kanban':
      return 'Board';
    case 'todo':
      return 'Tasks';
    case 'clarify':
      return 'Question';
    case 'recall_runs':
      return 'Recall';
    case 'store_memory':
    case 'search_memory':
    case 'delete_memory':
      return 'Memory';
    default:
      return 'Executing';
  }
}

/** Pull a concise target string from a tool's input payload. */
export function toolTargetName(input: unknown): string {
  if (input == null) return '';
  if (typeof input === 'string') return truncate(input, 50);
  if (typeof input !== 'object') return truncate(String(input), 50);

  const obj = input as Record<string, unknown>;
  const keys = ['query', 'url', 'command', 'filename', 'path', 'task'];
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.length > 0) {
      return truncate(value, 50);
    }
  }
  return '';
}

/** Normalize the risk level reported on an approval request. */
export function normalizeRisk(raw: unknown): ApprovalRisk {
  if (raw === 'high') return 'high';
  if (raw === 'low') return 'low';
  return 'medium';
}

/** Stringify arbitrary tool output for display. */
export function stringifyOutput(output: unknown): string {
  if (output == null) return '';
  if (typeof output === 'string') return output;
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}

/** Truncate a string to `max` chars with an ellipsis. */
export function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).trimEnd() + '…';
}

/** Drop the recursion-limit noise that should never reach the answer pane. */
export function isRecursionNoise(content: string): boolean {
  return /recursion limit|GRAPH_RECURSION_LIMIT/i.test(content);
}

/**
 * Build the `history` array sent with each prompt: user turns map directly,
 * AI turns concatenate their visible text nodes into one assistant message
 * (skipped when empty so placeholders don't leak into history).
 */
export function buildHistory(messages: MessageItem[]): HistoryMessage[] {
  const history: HistoryMessage[] = [];
  for (const message of messages) {
    if (message.type === 'user') {
      history.push({ role: 'user', content: message.content });
      continue;
    }
    const text = message.nodes
      .filter((node): node is Extract<typeof node, { type: 'text' }> => node.type === 'text')
      .map((node) => node.content)
      .join('')
      .trim();
    if (text.length > 0) {
      history.push({ role: 'assistant', content: text });
    }
  }
  return history;
}
