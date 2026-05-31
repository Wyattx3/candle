/**
 * ============================================================================
 * MESSAGE & TOOL-PAYLOAD SANITIZATION
 * ============================================================================
 * Ported from NousResearch/hermes-agent (`agent/message_sanitization.py`).
 *
 * Byte-level reasoning models (Kimi, GLM, MiMo) can emit lone UTF-16 surrogate
 * code points in their content / reasoning / tool-call arguments. Those
 * surrogates are invalid in UTF-8 and crash `JSON.stringify` inside the
 * provider SDK on the NEXT turn when the history is re-serialized — a silent
 * mid-loop failure. They can also emit malformed tool-call argument JSON
 * (trailing commas, unclosed braces, literal control chars, Python `None`).
 *
 * These pure helpers scrub messages and repair tool-call arguments BEFORE they
 * go back to the model, so a single bad token can't kill the whole run.
 *
 * All functions return NEW values (no in-place mutation) to fit Candle's
 * immutable message-passing style.
 */

// Lone (unpaired) surrogate code points — invalid in UTF-8 and crash
// JSON.stringify in the provider SDK. We must NOT touch valid surrogate
// PAIRS (e.g. emoji), which are how JS/UTF-16 represents astral code points.
// A high surrogate (D800-DBFF) is only valid when immediately followed by a
// low surrogate (DC00-DFFF); a low surrogate is only valid when immediately
// preceded by a high one. These two patterns match the unpaired cases.
const LONE_SURROGATE_RE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const LONE_SURROGATE_RE_G =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Replace lone (unpaired) surrogate code points with U+FFFD. Fast no-op when clean. */
export function sanitizeSurrogates(text: string): string {
  if (typeof text !== "string") return text;
  return LONE_SURROGATE_RE.test(text) ? text.replace(LONE_SURROGATE_RE_G, "\uFFFD") : text;
}

/** Deep-scrub surrogates from any nested string in a value. Returns a new value. */
export function sanitizeSurrogatesDeep(value: unknown): unknown {
  if (typeof value === "string") return sanitizeSurrogates(value);
  if (Array.isArray(value)) return value.map(sanitizeSurrogatesDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeSurrogatesDeep(v);
    return out;
  }
  return value;
}

/**
 * Escape unescaped control chars (< 0x20) inside JSON string values. Walks the
 * raw text tracking in-string state so only chars inside `"…"` are escaped.
 * Complements `repairToolCallArguments` for backends that emit literal tabs /
 * newlines inside string values.
 */
export function escapeInvalidCharsInJsonStrings(raw: string): string {
  const out: string[] = [];
  let inString = false;
  let i = 0;
  const n = raw.length;
  while (i < n) {
    const ch = raw[i];
    if (inString) {
      if (ch === "\\" && i + 1 < n) {
        out.push(ch, raw[i + 1]);
        i += 2;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out.push(ch);
      } else if (ch.charCodeAt(0) < 0x20) {
        out.push("\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"));
      } else {
        out.push(ch);
      }
    } else {
      if (ch === '"') inString = true;
      out.push(ch);
    }
    i += 1;
  }
  return out.join("");
}

/**
 * Attempt to repair malformed tool-call argument JSON. Models like GLM/Kimi via
 * some backends produce truncated JSON, trailing commas, literal control chars,
 * or Python `None`. Returns wire-valid JSON; falls back to `"{}"` so the request
 * succeeds rather than crashing the session. Returns `{ repaired, changed }`.
 */
export function repairToolCallArguments(
  rawArgs: string,
  toolName = "?"
): { repaired: string; changed: boolean; note?: string } {
  const rawStripped = typeof rawArgs === "string" ? rawArgs.trim() : "";

  if (!rawStripped) return { repaired: "{}", changed: true, note: `empty args for ${toolName}` };
  if (rawStripped === "None") return { repaired: "{}", changed: true, note: `python-None args for ${toolName}` };

  // Pass 0 — parse + re-serialize. Handles literal control chars that
  // JSON.parse tolerates, normalizing to compact wire-valid JSON.
  try {
    const parsed = JSON.parse(rawStripped);
    const reserialized = JSON.stringify(parsed);
    return { repaired: reserialized, changed: reserialized !== rawStripped };
  } catch {
    /* fall through to repairs */
  }

  let fixed = rawStripped;
  // 1. Strip trailing commas before } or ].
  fixed = fixed.replace(/,\s*([}\]])/g, "$1");
  // 2. Close unclosed structures.
  const openCurly = (fixed.match(/\{/g)?.length ?? 0) - (fixed.match(/\}/g)?.length ?? 0);
  const openBracket = (fixed.match(/\[/g)?.length ?? 0) - (fixed.match(/\]/g)?.length ?? 0);
  if (openCurly > 0) fixed += "}".repeat(openCurly);
  if (openBracket > 0) fixed += "]".repeat(openBracket);
  // 3. Trim excess closing braces/brackets (bounded).
  for (let k = 0; k < 50; k += 1) {
    try {
      JSON.parse(fixed);
      break;
    } catch {
      if (fixed.endsWith("}") && (fixed.match(/\}/g)?.length ?? 0) > (fixed.match(/\{/g)?.length ?? 0)) {
        fixed = fixed.slice(0, -1);
      } else if (fixed.endsWith("]") && (fixed.match(/\]/g)?.length ?? 0) > (fixed.match(/\[/g)?.length ?? 0)) {
        fixed = fixed.slice(0, -1);
      } else {
        break;
      }
    }
  }
  try {
    JSON.parse(fixed);
    return { repaired: fixed, changed: true, note: `repaired malformed args for ${toolName}` };
  } catch {
    /* try control-char escape */
  }

  // Pass 4 — escape control chars inside strings, retry.
  try {
    const escaped = escapeInvalidCharsInJsonStrings(fixed);
    if (escaped !== fixed) {
      JSON.parse(escaped);
      return { repaired: escaped, changed: true, note: `repaired control-char args for ${toolName}` };
    }
  } catch {
    /* fall through */
  }

  return { repaired: "{}", changed: true, note: `unrepairable args for ${toolName} — emptied` };
}

/**
 * Scrub surrogates from a full OpenAI-format message list. Returns a new array
 * plus whether anything changed. Covers content (string or parts), name,
 * tool_calls (id/name/arguments), and any extra string fields (reasoning etc.).
 */
export function sanitizeMessagesSurrogates(messages: any[]): { messages: any[]; changed: boolean } {
  let changed = false;
  const out = messages.map((msg) => {
    if (!msg || typeof msg !== "object") return msg;
    const next: any = { ...msg };

    if (typeof next.content === "string") {
      const s = sanitizeSurrogates(next.content);
      if (s !== next.content) { next.content = s; changed = true; }
    } else if (Array.isArray(next.content)) {
      next.content = next.content.map((part: any) => {
        if (part && typeof part === "object" && typeof part.text === "string") {
          const s = sanitizeSurrogates(part.text);
          if (s !== part.text) { changed = true; return { ...part, text: s }; }
        }
        return part;
      });
    }

    if (typeof next.name === "string") {
      const s = sanitizeSurrogates(next.name);
      if (s !== next.name) { next.name = s; changed = true; }
    }

    if (Array.isArray(next.tool_calls)) {
      next.tool_calls = next.tool_calls.map((tc: any) => {
        if (!tc || typeof tc !== "object") return tc;
        const ntc: any = { ...tc };
        if (typeof ntc.id === "string") {
          const s = sanitizeSurrogates(ntc.id);
          if (s !== ntc.id) { ntc.id = s; changed = true; }
        }
        if (ntc.function && typeof ntc.function === "object") {
          const fn = { ...ntc.function };
          if (typeof fn.name === "string") {
            const s = sanitizeSurrogates(fn.name);
            if (s !== fn.name) { fn.name = s; changed = true; }
          }
          if (typeof fn.arguments === "string") {
            const s = sanitizeSurrogates(fn.arguments);
            if (s !== fn.arguments) { fn.arguments = s; changed = true; }
          }
          ntc.function = fn;
        }
        return ntc;
      });
    }

    // Any other string / nested fields (reasoning, reasoning_content, …).
    for (const [key, value] of Object.entries(next)) {
      if (["content", "name", "tool_calls", "role"].includes(key)) continue;
      if (typeof value === "string") {
        const s = sanitizeSurrogates(value);
        if (s !== value) { next[key] = s; changed = true; }
      } else if (value && typeof value === "object") {
        const deep = sanitizeSurrogatesDeep(value);
        if (JSON.stringify(deep) !== JSON.stringify(value)) { next[key] = deep; changed = true; }
      }
    }

    return next;
  });
  return { messages: out, changed };
}
