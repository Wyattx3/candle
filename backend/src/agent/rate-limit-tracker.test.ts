import { describe, expect, it } from "vitest";
import {
  parseRateLimitHeaders,
  formatRateLimitCompact,
  rateLimitWarnings,
  bucketUsagePct,
} from "./rate-limit-tracker";

const HEADERS = {
  "x-ratelimit-limit-requests": "100",
  "x-ratelimit-remaining-requests": "15",
  "x-ratelimit-reset-requests": "42",
  "x-ratelimit-limit-tokens": "100000",
  "x-ratelimit-remaining-tokens": "90000",
  "x-ratelimit-reset-tokens": "30",
};

describe("parseRateLimitHeaders", () => {
  it("parses Cloudflare/Kimi-style headers", () => {
    const state = parseRateLimitHeaders(HEADERS, "cloudflare");
    expect(state).not.toBeNull();
    expect(state!.requestsMin.limit).toBe(100);
    expect(state!.requestsMin.remaining).toBe(15);
    expect(state!.tokensMin.limit).toBe(100000);
    expect(state!.provider).toBe("cloudflare");
  });

  it("returns null when no rate-limit headers present", () => {
    expect(parseRateLimitHeaders({ "content-type": "application/json" })).toBeNull();
  });

  it("is case-insensitive", () => {
    const state = parseRateLimitHeaders({ "X-RateLimit-Limit-Requests": "50", "X-RateLimit-Remaining-Requests": "50" });
    expect(state!.requestsMin.limit).toBe(50);
  });
});

describe("bucketUsagePct", () => {
  it("computes usage percentage", () => {
    const state = parseRateLimitHeaders(HEADERS)!;
    expect(Math.round(bucketUsagePct(state.requestsMin))).toBe(85);
  });
});

describe("formatRateLimitCompact", () => {
  it("renders a compact summary", () => {
    const state = parseRateLimitHeaders(HEADERS)!;
    const s = formatRateLimitCompact(state);
    expect(s).toContain("RPM: 15/100");
    expect(s).toContain("TPM:");
  });
});

describe("rateLimitWarnings", () => {
  it("warns when a bucket exceeds the threshold", () => {
    const state = parseRateLimitHeaders(HEADERS)!;
    const warnings = rateLimitWarnings(state, 80);
    expect(warnings.some((w) => w.includes("requests/min"))).toBe(true);
  });
  it("is quiet below the threshold", () => {
    const state = parseRateLimitHeaders({
      "x-ratelimit-limit-requests": "100",
      "x-ratelimit-remaining-requests": "95",
      "x-ratelimit-reset-requests": "10",
    })!;
    expect(rateLimitWarnings(state, 80)).toHaveLength(0);
  });
});
