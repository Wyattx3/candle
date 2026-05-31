import { describe, expect, it } from "vitest";
import {
  sanitizeMoonshotToolParameters,
  sanitizeMoonshotTools,
  isMoonshotModel,
} from "./moonshot-schema";

describe("sanitizeMoonshotToolParameters", () => {
  it("infers a missing type on a property", () => {
    const out = sanitizeMoonshotToolParameters({
      type: "object",
      properties: { q: { description: "query" } },
    });
    expect(out.properties.q.type).toBe("string");
  });

  it("collapses anyOf with a null branch", () => {
    const out = sanitizeMoonshotToolParameters({
      type: "object",
      properties: { v: { anyOf: [{ type: "string" }, { type: "null" }] } },
    });
    expect(out.properties.v.type).toBe("string");
    expect(out.properties.v.anyOf).toBeUndefined();
  });

  it("cleans null/empty from enum arrays", () => {
    const out = sanitizeMoonshotToolParameters({
      type: "object",
      properties: { m: { type: "string", enum: ["a", "", null, "b"] } },
    });
    expect(out.properties.m.enum).toEqual(["a", "b"]);
  });

  it("strips $ref siblings", () => {
    const out = sanitizeMoonshotToolParameters({
      type: "object",
      properties: { r: { $ref: "#/$defs/X", description: "drop me" } },
    });
    expect(out.properties.r).toEqual({ $ref: "#/$defs/X" });
  });

  it("collapses tuple-style items to the first element", () => {
    const out = sanitizeMoonshotToolParameters({
      type: "object",
      properties: { arr: { type: "array", items: [{ type: "string" }, { type: "number" }] } },
    });
    expect(out.properties.arr.items).toEqual({ type: "string" });
  });

  it("forces a top-level object schema", () => {
    const out = sanitizeMoonshotToolParameters({ type: "string" });
    expect(out.type).toBe("object");
    expect(out.properties).toEqual({});
  });
});

describe("sanitizeMoonshotTools", () => {
  it("repairs parameters inside an OpenAI tool dict", () => {
    const tools = [
      { type: "function", function: { name: "t", parameters: { type: "object", properties: { q: {} } } } },
    ];
    const out = sanitizeMoonshotTools(tools);
    expect(out[0].function.parameters.properties.q.type).toBe("string");
  });
});

describe("isMoonshotModel", () => {
  it("matches CF-prefixed kimi", () => {
    expect(isMoonshotModel("@cf/moonshotai/kimi-k2.6")).toBe(true);
  });
  it("matches bare kimi", () => {
    expect(isMoonshotModel("kimi-k2")).toBe(true);
  });
  it("rejects non-kimi", () => {
    expect(isMoonshotModel("gpt-4o")).toBe(false);
  });
  it("handles null/undefined", () => {
    expect(isMoonshotModel(null)).toBe(false);
    expect(isMoonshotModel(undefined)).toBe(false);
  });
});
