import { describe, expect, it } from "vitest";
import {
  summarizeToolResult,
  compressToolResults,
  shouldCompress,
  compressionSavings,
} from "./context-compressor";

describe("summarizeToolResult", () => {
  it("summarizes terminal output with exit code", () => {
    const s = summarizeToolResult("run_terminal", '{"exit_code": 0, "stdout": "ok\\nline2"}');
    expect(s).toContain("[run_terminal]");
    expect(s).toContain("exit 0");
  });
  it("summarizes search results by rank count", () => {
    const s = summarizeToolResult("search_web", '[{"rank":1},{"rank":2},{"rank":3}]');
    expect(s).toContain("[search_web]");
    expect(s).toContain("3 results");
  });
  it("falls back to a generic summary for unknown tools", () => {
    const s = summarizeToolResult("mystery_tool", "x".repeat(100));
    expect(s).toContain("[mystery_tool]");
  });
});

function bigTool(name: string, chars: number) {
  return { role: "tool", name, tool_call_id: name + "_1", content: "x".repeat(chars) };
}

describe("compressToolResults", () => {
  it("does nothing below the threshold", () => {
    const msgs = [{ role: "user", content: "hi" }, bigTool("search_web", 100)];
    const r = compressToolResults(msgs, { thresholdTokens: 1_000_000 });
    expect(r.changed).toBe(false);
    expect(r.messages).toBe(msgs);
  });

  it("prunes old large tool results but protects the recent tail", () => {
    const msgs = [
      { role: "user", content: "task" },
      bigTool("search_web", 5000),   // old — should be pruned
      { role: "assistant", content: "thinking" },
      bigTool("browse_web", 5000),   // old — should be pruned
      bigTool("run_python", 5000),   // recent (within tail) — protected
      bigTool("run_terminal", 5000), // recent — protected
      bigTool("read_sandbox_file", 5000), // recent — protected
      bigTool("http_request", 5000), // recent — protected
    ];
    const r = compressToolResults(msgs, { thresholdTokens: 100, protectTail: 4, minToolChars: 600 });
    expect(r.changed).toBe(true);
    expect(r.prunedCount).toBe(2);
    expect(r.tokensAfter).toBeLessThan(r.tokensBefore);
    // The protected tail still has full content.
    const lastTool = r.messages[r.messages.length - 1];
    expect(String(lastTool.content).length).toBeGreaterThan(600);
  });

  it("leaves small tool outputs alone", () => {
    const msgs = [
      { role: "user", content: "task" },
      bigTool("search_web", 100),    // old but small → untouched
      bigTool("browse_web", 5000),   // within tail (4) → protected
      bigTool("run_python", 5000),   // protected
      bigTool("run_terminal", 5000), // protected
      bigTool("read_sandbox_file", 5000), // protected
    ];
    const r = compressToolResults(msgs, { thresholdTokens: 100, protectTail: 4, minToolChars: 600 });
    // The only "old" tool (outside the 4-tail) is the 100-char search_web,
    // which is under minToolChars → nothing pruned.
    expect(r.prunedCount).toBe(0);
  });
});

describe("shouldCompress", () => {
  it("is false below threshold", () => {
    expect(shouldCompress([{ role: "user", content: "hi" }], 1_000_000)).toBe(false);
  });
  it("backs off after repeated ineffective passes", () => {
    const huge = [{ role: "user", content: "x".repeat(400_000) }];
    expect(shouldCompress(huge, 100, 2)).toBe(false);
    expect(shouldCompress(huge, 100, 0)).toBe(true);
  });
});

describe("compressionSavings", () => {
  it("computes the savings fraction", () => {
    const savings = compressionSavings({ messages: [], changed: true, prunedCount: 1, tokensBefore: 1000, tokensAfter: 600 });
    expect(savings).toBeCloseTo(0.4, 2);
  });
});
