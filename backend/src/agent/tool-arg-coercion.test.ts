import { describe, expect, it } from "vitest";
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { coerceToolArgs } from "./tool-arg-coercion";

const demoTool = tool(async (a: any) => JSON.stringify(a), {
  name: "demo",
  description: "demo tool",
  schema: z.object({
    query: z.string(),
    max_results: z.number().optional(),
    enabled: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    count: z.number().int().optional(),
  }),
});

describe("coerceToolArgs", () => {
  it("coerces a stringified number to a number", () => {
    const out = coerceToolArgs(demoTool, { query: "x", max_results: "10" });
    expect(out.max_results).toBe(10);
  });

  it("coerces a stringified boolean to a boolean", () => {
    const out = coerceToolArgs(demoTool, { query: "x", enabled: "true" });
    expect(out.enabled).toBe(true);
    expect(coerceToolArgs(demoTool, { query: "x", enabled: "false" }).enabled).toBe(false);
  });

  it("wraps a bare scalar when the schema expects an array", () => {
    const out = coerceToolArgs(demoTool, { query: "x", tags: "k_abc" });
    expect(out.tags).toEqual(["k_abc"]);
  });

  it("parses a JSON-array string into an array", () => {
    const out = coerceToolArgs(demoTool, { query: "x", tags: '["a","b"]' });
    expect(out.tags).toEqual(["a", "b"]);
  });

  it("passes already-correct args through unchanged (same reference)", () => {
    const good = { query: "y", max_results: 5, enabled: false };
    expect(coerceToolArgs(demoTool, good)).toBe(good);
  });

  it("leaves a real string field alone", () => {
    const out = coerceToolArgs(demoTool, { query: "hello world" });
    expect(out.query).toBe("hello world");
  });

  it("does not coerce a non-numeric string for a number field", () => {
    const out = coerceToolArgs(demoTool, { query: "x", max_results: "abc" });
    expect(out.max_results).toBe("abc");
  });

  it("returns non-object args unchanged", () => {
    expect(coerceToolArgs(demoTool, null)).toBeNull();
    expect(coerceToolArgs(demoTool, "raw")).toBe("raw");
  });
});
