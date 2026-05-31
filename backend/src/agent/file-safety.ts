/**
 * ============================================================================
 * SANDBOX FILE-SAFETY GUARD
 * ============================================================================
 * Adapted from NousResearch/hermes-agent (`agent/file_safety.py`) for Candle's
 * E2B sandbox model (everything lives under `/home/user`).
 *
 * Two defense-in-depth checks the sandbox file tools consult:
 *
 *  1. READ guard — block reading secret-bearing files (`.env`, SSH keys,
 *     cloud-credential files). The model rarely needs raw credential contents;
 *     `.env.example` is the documented-shape substitute. This SURFACES a clear
 *     denial that most models respect, and leaves an audit trail.
 *
 *  2. WRITE guard — block overwriting credential / shell-init files that could
 *     enable persistence or credential theft (`.ssh/authorized_keys`,
 *     `.bashrc`, `.npmrc`, `.git-credentials`, etc.).
 *
 * NOT a hard security boundary: `run_terminal` runs as the same user and can
 * `cat` / `echo >` anything. This is a confusion-reducer + audit aid that
 * empirically stops well-behaved models from leaking or clobbering secrets,
 * matching Hermes' own framing.
 */

/** Project-local env-file basenames that routinely hold credentials. */
const BLOCKED_ENV_BASENAMES = new Set([
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.test",
  ".env.staging",
  ".envrc",
]);

/** Credential / key file basenames blocked for READ. */
const BLOCKED_READ_BASENAMES = new Set([
  "id_rsa",
  "id_ed25519",
  "id_ecdsa",
  ".netrc",
  ".pgpass",
  ".git-credentials",
  "credentials", // ~/.aws/credentials, gcloud, etc.
  ".anthropic_oauth.json",
  "auth.json",
]);

/** Path substrings (after normalization) whose files are credential stores. */
const BLOCKED_READ_DIR_SUBSTRINGS = [
  "/.ssh/",
  "/.aws/",
  "/.gnupg/",
  "/.config/gcloud/",
  "/.config/gh/",
  "/.kube/",
  "/.docker/",
  "/.azure/",
];

/** Exact files / shell-init files blocked for WRITE (persistence vectors). */
const BLOCKED_WRITE_BASENAMES = new Set([
  "authorized_keys",
  "id_rsa",
  "id_ed25519",
  "id_ecdsa",
  ".bashrc",
  ".zshrc",
  ".profile",
  ".bash_profile",
  ".zprofile",
  ".netrc",
  ".pgpass",
  ".npmrc",
  ".pypirc",
  ".git-credentials",
  ...BLOCKED_ENV_BASENAMES,
]);

/** Directory substrings whose files are write-protected. */
const BLOCKED_WRITE_DIR_SUBSTRINGS = [
  "/.ssh/",
  "/.aws/",
  "/.gnupg/",
  "/.kube/",
  "/.docker/",
  "/.azure/",
  "/.config/gh/",
  "/.config/gcloud/",
  "/etc/",
];

function normalize(p: string): { full: string; base: string } {
  const full = (p || "").replace(/\\/g, "/").replace(/\/+/g, "/");
  const base = full.split("/").filter(Boolean).pop() ?? "";
  return { full, base };
}

/**
 * Returns an error string if reading `path` should be blocked, else null.
 * `.env.example` and similar are explicitly allowed.
 */
export function getReadBlockError(path: string): string | null {
  const { full, base } = normalize(path);

  // .env.example / .env.sample are documented-shape substitutes — allow.
  if (/\.env\.(example|sample|template)$/i.test(base)) return null;

  if (BLOCKED_ENV_BASENAMES.has(base) || BLOCKED_READ_BASENAMES.has(base)) {
    return (
      `Access denied: "${path}" is a secret-bearing file and cannot be read directly to prevent ` +
      `credential leakage. If you only need the structure, read .env.example instead. ` +
      `(Defense-in-depth, not a hard boundary.)`
    );
  }
  for (const sub of BLOCKED_READ_DIR_SUBSTRINGS) {
    if (full.includes(sub)) {
      return (
        `Access denied: "${path}" lives in a credential directory (${sub.replace(/\//g, "")}) and ` +
        `cannot be read directly. (Defense-in-depth, not a hard boundary.)`
      );
    }
  }
  return null;
}

/** Returns an error string if writing `path` should be blocked, else null. */
export function getWriteBlockError(path: string): string | null {
  const { full, base } = normalize(path);

  if (/\.env\.(example|sample|template)$/i.test(base)) return null;

  if (BLOCKED_WRITE_BASENAMES.has(base)) {
    return (
      `Write denied: "${path}" is a credential or shell-init file. Overwriting it could leak ` +
      `secrets or enable persistence. Choose a different path. (Defense-in-depth, not a hard boundary.)`
    );
  }
  for (const sub of BLOCKED_WRITE_DIR_SUBSTRINGS) {
    if (full.includes(sub)) {
      return (
        `Write denied: "${path}" targets a protected system/credential directory (${sub.replace(/\//g, "")}). ` +
        `Choose a path under /home/user. (Defense-in-depth, not a hard boundary.)`
      );
    }
  }
  return null;
}
