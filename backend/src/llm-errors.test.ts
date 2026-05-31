import { describe, expect, it } from "vitest";
import { backoffMs, classifyLlmError } from "./llm-errors";

/**
 * Each fixture is a `{ name, error, expected }` triple. We keep them table-
 * driven so adding a new error shape is a one-line change.
 */
const FIXTURES = [
  {
    name: "401 unauthorized",
    error: { status: 401, message: "Unauthorized" },
    expected: { class: "auth", retryable: false, failoverable: false },
  },
  {
    name: "403 forbidden",
    error: { status: 403, message: "Forbidden" },
    expected: { class: "auth", retryable: false, failoverable: false },
  },
  {
    name: "invalid api key text",
    error: { message: "Invalid api key supplied for request" },
    expected: { class: "auth", retryable: false, failoverable: false },
  },
  {
    name: "402 quota",
    error: { status: 402, message: "Payment required" },
    expected: { class: "quota", retryable: false, failoverable: true },
  },
  {
    name: "429 rate limit",
    error: { status: 429, message: "Rate limit exceeded" },
    expected: { class: "rate_limit", retryable: true, failoverable: true },
  },
  {
    name: "context length exceeded",
    error: { message: "This model's maximum context length is 8192 tokens" },
    expected: { class: "context_length", retryable: false, failoverable: false },
  },
  {
    name: "400 bad request",
    error: { status: 400, message: "Invalid tool schema" },
    expected: { class: "bad_request", retryable: false, failoverable: false },
  },
  {
    name: "model not found 404",
    error: { status: 404, message: "Model not found" },
    expected: { class: "model_unavailable", retryable: true, failoverable: true },
  },
  {
    name: "timeout error",
    error: { code: "ETIMEDOUT", message: "request timed out" },
    expected: { class: "timeout", retryable: true, failoverable: true },
  },
  {
    name: "504 gateway timeout",
    error: { status: 504, message: "Gateway timeout" },
    expected: { class: "timeout", retryable: true, failoverable: true },
  },
  {
    name: "DNS error",
    error: { code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND api.example" },
    expected: { class: "network", retryable: true, failoverable: true },
  },
  {
    name: "connection reset",
    error: { code: "ECONNRESET", message: "socket hang up" },
    expected: { class: "network", retryable: true, failoverable: true },
  },
  {
    name: "500 server error",
    error: { status: 500, message: "Internal Server Error" },
    expected: { class: "server", retryable: true, failoverable: true },
  },
  {
    name: "503 service unavailable",
    error: { status: 503, message: "Service unavailable" },
    expected: { class: "server", retryable: true, failoverable: true },
  },
  {
    name: "cloudflare 502",
    error: { status: 502, message: "Cloudflare edge error" },
    expected: { class: "server", retryable: true, failoverable: true },
  },
  {
    name: "unknown shape",
    error: { message: "something went sideways" },
    expected: { class: "unknown", retryable: true, failoverable: true },
  },
] as const;

describe("classifyLlmError", () => {
  for (const fixture of FIXTURES) {
    it(`classifies ${fixture.name} → ${fixture.expected.class}`, () => {
      const result = classifyLlmError(fixture.error);
      expect(result.class).toBe(fixture.expected.class);
      expect(result.retryable).toBe(fixture.expected.retryable);
      expect(result.failoverable).toBe(fixture.expected.failoverable);
    });
  }

  it("redacts api keys from the summary", () => {
    const error = { message: "auth failed: sk-abcdefghij1234567890 invalid" };
    const result = classifyLlmError(error);
    expect(result.summary).not.toContain("sk-abcdefghij1234567890");
    expect(result.summary).toContain("<redacted>");
  });

  it("redacts bearer tokens from the summary", () => {
    const error = { message: "token Bearer abc.def.ghi.jkl rejected" };
    const result = classifyLlmError(error);
    expect(result.summary).not.toContain("abc.def.ghi.jkl");
  });

  it("extracts status code from message body", () => {
    const result = classifyLlmError({ message: "Server returned 503 service unavailable" });
    expect(result.statusCode).toBe(503);
    expect(result.class).toBe("server");
  });

  it("handles AbortError shape", () => {
    const error = Object.assign(new Error("aborted"), { name: "TimeoutError" });
    const result = classifyLlmError(error);
    expect(result.class).toBe("timeout");
  });
});

describe("backoffMs", () => {
  it("doubles each attempt up to the cap", () => {
    const a0 = backoffMs(0, 1000, 8000);
    const a1 = backoffMs(1, 1000, 8000);
    const a2 = backoffMs(2, 1000, 8000);
    // Allow for ±15% jitter built into backoffMs.
    expect(a0).toBeGreaterThanOrEqual(850);
    expect(a0).toBeLessThanOrEqual(1300);
    expect(a1).toBeGreaterThanOrEqual(1700);
    expect(a1).toBeLessThanOrEqual(2600);
    expect(a2).toBeGreaterThanOrEqual(3400);
    expect(a2).toBeLessThanOrEqual(5200);
  });

  it("respects the cap", () => {
    const big = backoffMs(20, 1000, 4000);
    expect(big).toBeLessThanOrEqual(4000 * 1.15 + 1);
  });
});
