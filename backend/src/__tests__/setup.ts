/**
 * Vitest setup — runs before every test file.
 *
 * Stubs the env vars that production modules read at import time. We want
 * `import { agentLLM } from "../agent/llm"` to succeed inside a test even
 * though no real Cloudflare credentials are present, because the failing
 * import would mask the actual test signal.
 *
 * Tests that need a real provider should override these vars in their own
 * `beforeAll` and use the network-backed integration tier (skipped in CI
 * by default).
 */

const TEST_ENV: Record<string, string> = {
  NODE_ENV: "test",
  CLOUDFLARE_API_KEY: "test-cf-key",
  CLOUDFLARE_BASE_URL: "https://example.test/v1",
  MODEL_NAME: "test-model",
  E2B_API_KEY: "test-e2b-key",
  E2B_TEMPLATE_NAME: "test-template",
  // Disable failover by default so llm.ts logs the "not configured" path.
  FAILOVER_API_KEY: "",
  FAILOVER_BASE_URL: "",
  FAILOVER_MODEL_NAME: "",
  // Quiet down rate-limiter and trajectory logger.
  RATE_LIMIT_MAX_REQUESTS: "1000",
  RATE_LIMIT_MAX_CONCURRENT: "1000",
  CANDLE_TRAJECTORY_DIR: "",
};

for (const [key, value] of Object.entries(TEST_ENV)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}
