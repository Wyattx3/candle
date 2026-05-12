const SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  /\b(api\s*key|api[_-]?key|authorization|cookie|set-cookie|access[_-]?token|refresh[_-]?token|secret)\b\s*[:=]\s*["']?[^"'\s,;}{]+/gi,
  /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
  /\b(?:pcsk|sk|pk|rk|cf|e2b|steel|kernel)_[A-Za-z0-9_-]{16,}\b/gi,
];

export function redactSecrets(value: unknown): string {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return SECRET_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, (match) => {
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
