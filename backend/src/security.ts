/**
 * ============================================================================
 * SECURITY MODULE
 * ============================================================================
 * Two responsibilities, both small enough to live in one file:
 *
 *  1. Secret redaction — `redactSecrets` / `redactSecretsDeep` scrub API keys,
 *     bearer tokens, JWT-like strings, and provider-prefixed keys before
 *     anything gets logged or echoed back over the WebSocket.
 *
 *  2. Threat scanning — `scanForThreats` looks for prompt-injection patterns
 *     in untrusted text. Two attack vectors are scoped:
 *       - Direct injection in user prompts ("ignore previous instructions...")
 *       - Indirect injection in tool outputs (a fetched web page that tells
 *         the agent to leak its system prompt). The latter is the bigger
 *         risk because tool output is normally trusted as raw data.
 *
 * Pattern philosophy:
 *  - Tight regexes only. We do NOT scan for generic encodings (base64) or
 *    legitimate role descriptions ("you are now logged in"); those produce
 *    false positives on benign technical text.
 *  - Each match has a severity tag so the caller can choose its response
 *    (warn-and-continue vs hard-block) — defense-in-depth, not a hard gate.
 */

const SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /\b(api\s*key|api[_-]?key|authorization|cookie|set-cookie|access[_-]?token|refresh[_-]?token|secret)\b\s*[:=]\s*["']?[^"'\s,;}{]+/gi,
  /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
  /\b(?:pcsk|sk|pk|rk|cf|e2b|steel|kernel)_[A-Za-z0-9_-]{16,}\b/gi,
  // ── Vendor key-prefix table (ported from Hermes agent/redact.py) ──────────
  // Each is anchored so a known prefix + contiguous token chars is masked even
  // when it appears bare (no surrounding "key:" label).
  /\bsk-[A-Za-z0-9_-]{10,}\b/g,            // OpenAI / OpenRouter / Anthropic (sk-ant-*)
  /\bgh[pousr]_[A-Za-z0-9]{10,}\b/g,       // GitHub PAT / OAuth / server / refresh tokens
  /\bgithub_pat_[A-Za-z0-9_]{10,}\b/g,     // GitHub fine-grained PAT
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,     // Slack tokens
  /\bAIza[A-Za-z0-9_-]{30,}\b/g,           // Google API keys
  /\bAKIA[A-Z0-9]{16}\b/g,                 // AWS Access Key ID
  /\bsk_(?:live|test)_[A-Za-z0-9]{10,}\b/g, // Stripe secret keys
  /\brk_live_[A-Za-z0-9]{10,}\b/g,         // Stripe restricted key
  /\bSG\.[A-Za-z0-9_-]{10,}\b/g,           // SendGrid
  /\bhf_[A-Za-z0-9]{10,}\b/g,              // HuggingFace
  /\br8_[A-Za-z0-9]{10,}\b/g,              // Replicate
  /\bnpm_[A-Za-z0-9]{10,}\b/g,             // npm token
  /\bpypi-[A-Za-z0-9_-]{10,}\b/g,          // PyPI token
  /\bxai-[A-Za-z0-9]{20,}\b/g,             // xAI (Grok)
  /\bgsk_[A-Za-z0-9]{10,}\b/g,             // Groq Cloud
  /\btvly-[A-Za-z0-9]{10,}\b/g,            // Tavily
  /\bpplx-[A-Za-z0-9]{10,}\b/g,            // Perplexity
  // ── Structured secrets ────────────────────────────────────────────────────
  /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g, // private key blocks
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^:@\s]+:[^@\s]+@/gi, // DB conn-string passwords
  // JSON secret fields in raw text, e.g. "apiKey": "value" / "token":"value".
  // (redactSecretsDeep handles structured objects; this catches stringified JSON.)
  /"(?:api[_-]?key|token|secret|password|access_token|refresh_token|auth_token|bearer|client_secret)"\s*:\s*"[^"]+"/gi,
];

export function redactSecrets(value: unknown): string {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return SECRET_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, (match) => {
      // JSON secret field: "key": "value" — keep the key, mask the value.
      const jsonMatch = match.match(/^("(?:[^"]+)"\s*:\s*)"[^"]+"$/);
      if (jsonMatch) return `${jsonMatch[1]}"[REDACTED]"`;
      // DB connection strings: keep scheme + user, mask only the password.
      const dbMatch = match.match(/^((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^:@\s]+:)[^@\s]+(@)$/i);
      if (dbMatch) return `${dbMatch[1]}[REDACTED]${dbMatch[2]}`;
      if (/^-----BEGIN/.test(match)) return "[REDACTED PRIVATE KEY]";
      const separatorIndex = Math.max(match.indexOf("="), match.indexOf(":"));
      if (separatorIndex > -1) return `${match.slice(0, separatorIndex + 1)} [REDACTED]`;
      if (/^bearer\s+/i.test(match)) return "Bearer [REDACTED]";
      return "[REDACTED]";
    }),
    raw
  );
}

export function redactSecretsDeep(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map((item) => redactSecretsDeep(item));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (/api\s*key|api[_-]?key|authorization|cookie|token|secret|password/i.test(key)) {
        return [key, "[REDACTED]"];
      }
      return [key, redactSecretsDeep(item)];
    })
  );
}

// ─── THREAT SCANNING (Prompt Injection & Malicious Intents) ───────────────

export type ThreatSeverity = "high" | "medium";

interface ThreatPattern {
  pattern: RegExp;
  severity: ThreatSeverity;
  label: string;
}

/**
 * Curated list of instruction-override + secret-leak patterns. Each entry is
 * tight enough that legitimate technical writing won't trigger it — the
 * cost of a false positive (logged warning, prefixed system note) is small
 * but still worth avoiding on benign tool output.
 */
const THREAT_PATTERNS: ThreatPattern[] = [
  // Direct override commands
  { pattern: /\bignore\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|rules?)\b/i, severity: "high", label: "ignore-previous" },
  { pattern: /\bdisregard\s+(?:all\s+)?(?:the\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|rules?)\b/i, severity: "high", label: "disregard-previous" },
  { pattern: /\b(?:forget|abandon|drop)\s+(?:all\s+)?(?:your\s+|the\s+)?(?:previous|prior|earlier|original)\s+(?:instructions?|rules?|guidelines?|context)\b/i, severity: "high", label: "forget-rules" },
  // System-prompt exfiltration
  { pattern: /\b(?:reveal|leak|print|output|show|dump|repeat)\s+(?:all\s+)?(?:your\s+|the\s+)?(?:initial|original|system|hidden|secret)\s+(?:prompt|instructions?|rules?|message)\b/i, severity: "high", label: "leak-system-prompt" },
  { pattern: /\bsystem\s+prompt\s+(?:override|leak|reveal|dump|exposure)\b/i, severity: "high", label: "system-prompt-override" },
  // Secret exfiltration
  { pattern: /\b(?:reveal|leak|expose|tell\s+me|share)\s+(?:all\s+)?(?:your\s+|the\s+)?(?:api[\s_-]?keys?|secrets?|tokens?|passwords?|credentials?|env\s+vars?|environment\s+variables?)\b/i, severity: "high", label: "leak-secrets" },
  // Role / jailbreak override (kept narrow — only the explicit jailbreak phrasings)
  { pattern: /\b(?:you\s+are|act\s+as|pretend\s+to\s+be|simulate\s+being)\s+(?:now\s+)?(?:a\s+|an\s+)?(?:different|new|jailbroken|unrestricted|uncensored|DAN|developer\s+mode|root\s+mode)\b/i, severity: "high", label: "role-override" },
  // Chat-template injection (model-specific tokens smuggled into untrusted text)
  { pattern: /<\s*\|\s*im_start\s*\|\s*>/i, severity: "medium", label: "chat-template-im-start" },
  { pattern: /<\s*\|\s*im_end\s*\|\s*>/i, severity: "medium", label: "chat-template-im-end" },
  { pattern: /\[\s*INST\s*\]|\[\s*\/\s*INST\s*\]/i, severity: "medium", label: "chat-template-inst" },
  { pattern: /\bBEGIN\s+SYSTEM\s+PROMPT\b|\bEND\s+SYSTEM\s+PROMPT\b/i, severity: "medium", label: "chat-template-system" },
];

export interface ThreatMatch {
  label: string;
  severity: ThreatSeverity;
}

export interface ThreatScanResult {
  /** True when nothing matched. */
  isClean: boolean;
  /** Worst severity observed. `none` when clean. */
  severity: "none" | ThreatSeverity;
  /** All distinct labels that matched (deduped). */
  detected: ThreatMatch[];
}

/**
 * Scan untrusted text for prompt-injection / data-exfiltration patterns.
 * Caps the input at 64 KB so a malicious 10 MB tool output can't pin the
 * regex engine.
 */
export function scanForThreats(content: string): ThreatScanResult {
  if (!content || typeof content !== "string") {
    return { isClean: true, severity: "none", detected: [] };
  }
  const sample = content.length > 64_000 ? content.slice(0, 64_000) : content;
  const seen = new Map<string, ThreatSeverity>();

  for (const entry of THREAT_PATTERNS) {
    if (entry.pattern.test(sample)) {
      // Keep the worst severity if the same label could ever be tagged twice.
      const prior = seen.get(entry.label);
      if (!prior || (prior === "medium" && entry.severity === "high")) {
        seen.set(entry.label, entry.severity);
      }
    }
  }

  if (seen.size === 0) {
    return { isClean: true, severity: "none", detected: [] };
  }

  const detected: ThreatMatch[] = [...seen.entries()].map(([label, severity]) => ({ label, severity }));
  const severity: ThreatSeverity = detected.some((d) => d.severity === "high") ? "high" : "medium";
  return { isClean: false, severity, detected };
}

/**
 * Render a short human-readable summary of a scan result. Used for log
 * lines and the `[SECURITY]` prefix injected ahead of suspicious tool
 * outputs.
 */
export function summarizeThreats(result: ThreatScanResult): string {
  if (result.isClean) return "clean";
  return `${result.severity}: ${result.detected.map((d) => d.label).join(", ")}`;
}
