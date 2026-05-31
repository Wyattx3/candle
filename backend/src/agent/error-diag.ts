/**
 * ============================================================================
 * ERROR DIAGNOSTICS
 * ============================================================================
 * Ported (TS-adapted) from NousResearch/hermes-agent (`agent/stream_diag.py`).
 *
 * When an LLM/HTTP call dies, the useful detail is often buried in a `cause`
 * chain (LangChain → OpenAI SDK → fetch → undici) and in provider response
 * headers (Cloudflare `cf-ray`, request ids). These helpers flatten the chain
 * into one readable line and pull the diagnostic headers, so `agent.log` shows
 * "why" instead of a bare `[object Object]` — and operators can quote the
 * `cf-ray` id to Cloudflare support.
 *
 * Pure + defensive: never throws, always returns a string / plain object.
 */

import { redactSecrets } from "../security";

/** Headers worth capturing from a provider response for post-hoc debugging. */
const DIAG_HEADER_NAMES = [
  "cf-ray",
  "cf-cache-status",
  "x-request-id",
  "x-amzn-requestid",
  "retry-after",
  "via",
  "server",
];

/**
 * Walk the `cause` / `error` chain of a thrown value and return a compact,
 * redacted one-line summary: `TypeError: fetch failed <- ConnectTimeoutError:
 * Connect Timeout Error`.
 */
export function flattenExceptionChain(error: unknown, maxDepth = 6): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: any = error;
  let depth = 0;

  while (current && depth < maxDepth && !seen.has(current)) {
    seen.add(current);
    depth += 1;

    let label: string;
    if (current instanceof Error) {
      const name = current.name || "Error";
      const msg = (current.message || "").split("\n")[0].slice(0, 200);
      label = msg ? `${name}: ${msg}` : name;
    } else if (typeof current === "string") {
      label = current.split("\n")[0].slice(0, 200);
    } else if (current && typeof current === "object") {
      const code = current.code ?? current.status ?? current.statusCode;
      const msg = current.message ?? current.error ?? "";
      label = [code, typeof msg === "string" ? msg.slice(0, 160) : ""].filter(Boolean).join(" ");
      if (!label) label = "(non-error object)";
    } else {
      label = String(current);
    }

    parts.push(label);
    // Follow common chain links.
    current = current?.cause ?? current?.error ?? current?.originalError ?? null;
  }

  return redactSecrets(parts.join(" <- ")) || "unknown error";
}

/**
 * Extract diagnostic headers from a thrown error's response (if any). Returns a
 * plain object of the headers present; empty object when none found. Handles
 * the common shapes: `error.response.headers` (object/Map/Headers),
 * `error.headers`, and OpenAI SDK's `error.response`.
 */
export function extractDiagHeaders(error: any): Record<string, string> {
  const out: Record<string, string> = {};
  const candidates = [error?.response?.headers, error?.headers, error?.response];
  for (const headers of candidates) {
    if (!headers) continue;
    const get = (k: string): string | undefined => {
      try {
        if (typeof headers.get === "function") return headers.get(k) ?? undefined;
        const lowerKey = k.toLowerCase();
        for (const [hk, hv] of Object.entries(headers as Record<string, unknown>)) {
          if (hk.toLowerCase() === lowerKey) return String(hv);
        }
      } catch {
        /* ignore */
      }
      return undefined;
    };
    for (const name of DIAG_HEADER_NAMES) {
      if (out[name]) continue;
      const v = get(name);
      if (v) out[name] = v;
    }
  }
  return out;
}

/**
 * Build a single redacted diagnostic line for logging an LLM/HTTP failure:
 * `chain | cf-ray=89ab… x-request-id=…`. Safe to log directly.
 */
export function describeError(error: unknown): string {
  const chain = flattenExceptionChain(error);
  const headers = extractDiagHeaders(error);
  const headerStr = Object.entries(headers)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  return headerStr ? `${chain} | ${headerStr}` : chain;
}
