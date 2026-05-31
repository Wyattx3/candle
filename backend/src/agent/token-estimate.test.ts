import { describe, expect, it } from "vitest";
import { estimateStringTokens, estimateMessagesTokens, contextUsageRatio } from "./token-estimate";

describe("estimateStringTokens", () => {
  it("uses ~4 chars per token", () => {
    expect(estimateStringTokens("a".repeat(40))).toBe(10);
  });
  it("returns 0 for empty", () => {
    expect(estimateStringTokens("")).toBe(0);
  });
});

describe("estimateMessagesTokens", () => {
  it("counts content plus per-message overhead", () => {
    const tokens = estimateMessagesTokens([
      { role: "user", content: "a".repeat(40) },
    ]);
    expect(tokens).toBeGreaterThanOrEqual(10);
  });
  it("counts tool-call arguments", () => {
    const withTool = estimateMessagesTokens([
      { role: "assistant", content: "", tool_calls: [{ function: { name: "f", arguments: '{"q":"' + "x".repeat(40) + '"}' } }] },
    ]);
    const without = estimateMessagesTokens([{ role: "assistant", content: "" }]);
    expect(withTool).toBeGreaterThan(without);
  });
  it("handles content parts arrays", () => {
    const tokens = estimateMessagesTokens([
      { role: "user", content: [{ type: "text", text: "hello" }] },
    ]);
    expect(tokens).toBeGreaterThan(0);
  });
});

describe("contextUsageRatio", () => {
  it("returns a fraction of the context window", () => {
    const ratio = contextUsageRatio([{ role: "user", content: "a".repeat(400) }], 1000);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(1);
  });
  it("returns 0 for an invalid window", () => {
    expect(contextUsageRatio([{ role: "user", content: "x" }], 0)).toBe(0);
  });
});
