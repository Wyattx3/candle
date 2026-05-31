import { describe, expect, it } from "vitest";
import { flattenExceptionChain, extractDiagHeaders, describeError } from "./error-diag";

describe("flattenExceptionChain", () => {
  it("flattens a nested cause chain", () => {
    const root = new Error("Connect Timeout Error");
    root.name = "ConnectTimeoutError";
    const wrapper = new Error("fetch failed");
    (wrapper as any).cause = root;
    const out = flattenExceptionChain(wrapper);
    expect(out).toContain("fetch failed");
    expect(out).toContain("Connect Timeout Error");
    expect(out).toContain("<-");
  });

  it("handles a plain string", () => {
    expect(flattenExceptionChain("boom")).toBe("boom");
  });

  it("handles object errors with code + message", () => {
    const out = flattenExceptionChain({ code: 503, message: "service unavailable" });
    expect(out).toContain("503");
    expect(out).toContain("service unavailable");
  });

  it("redacts secrets in the chain", () => {
    const out = flattenExceptionChain(new Error("auth failed for sk-abcdef1234567890XYZ"));
    expect(out).not.toContain("sk-abcdef1234567890XYZ");
    expect(out).toContain("[REDACTED]");
  });

  it("does not infinite-loop on a self-referential cause", () => {
    const e: any = new Error("loop");
    e.cause = e;
    expect(() => flattenExceptionChain(e)).not.toThrow();
  });
});

describe("extractDiagHeaders", () => {
  it("pulls cf-ray and request id from response headers (object)", () => {
    const err = { response: { headers: { "cf-ray": "89abc-SYD", "x-request-id": "req_123" } } };
    const h = extractDiagHeaders(err);
    expect(h["cf-ray"]).toBe("89abc-SYD");
    expect(h["x-request-id"]).toBe("req_123");
  });

  it("works with a Headers-like get()", () => {
    const err = { headers: { get: (k: string) => (k === "cf-ray" ? "ray-1" : undefined) } };
    expect(extractDiagHeaders(err)["cf-ray"]).toBe("ray-1");
  });

  it("returns empty object when no headers", () => {
    expect(extractDiagHeaders(new Error("x"))).toEqual({});
  });
});

describe("describeError", () => {
  it("combines chain and headers", () => {
    const err: any = new Error("server error");
    err.response = { headers: { "cf-ray": "ray-9" } };
    const out = describeError(err);
    expect(out).toContain("server error");
    expect(out).toContain("cf-ray=ray-9");
  });
});
