import { beforeEach, describe, expect, it } from "vitest";
import { ToolCallGuardrailController } from "./guardrails";

describe("ToolCallGuardrailController — beforeCall", () => {
  let g: ToolCallGuardrailController;

  beforeEach(() => {
    g = new ToolCallGuardrailController({
      exactFailureWarnAfter: 2,
      exactFailureBlockAfter: 4,
      sameToolFailureWarnAfter: 3,
      sameToolFailureHaltAfter: 6,
      noProgressWarnAfter: 2,
      noProgressBlockAfter: 4,
    });
  });

  it("allows a fresh call", () => {
    expect(g.beforeCall("search_web", { query: "test" }).action).toBe("allow");
  });

  it("warns after repeated identical failures (>= warnAfter)", () => {
    g.afterCall("search_web", { query: "x" }, "err", true);
    g.afterCall("search_web", { query: "x" }, "err", true);
    const decision = g.beforeCall("search_web", { query: "x" });
    expect(decision.action).toBe("warn");
  });

  it("blocks after exactFailureBlockAfter identical failures", () => {
    for (let i = 0; i < 4; i += 1) {
      g.afterCall("search_web", { query: "x" }, "err", true);
    }
    const decision = g.beforeCall("search_web", { query: "x" });
    expect(decision.action).toBe("block");
  });

  it("halts after sameToolFailureHaltAfter ANY-args failures", () => {
    for (let i = 0; i < 6; i += 1) {
      g.afterCall("search_web", { query: `q${i}` }, "err", true);
    }
    const decision = g.beforeCall("search_web", { query: "fresh-args" });
    expect(decision.action).toBe("halt");
  });

  it("does not block after a success interrupts the streak", () => {
    g.afterCall("search_web", { query: "x" }, "err", true);
    g.afterCall("search_web", { query: "x" }, "err", true);
    g.afterCall("search_web", { query: "y" }, "good", false);
    const decision = g.beforeCall("search_web", { query: "x" });
    expect(decision.action).toBe("allow");
  });
});

describe("ToolCallGuardrailController — afterCall", () => {
  let g: ToolCallGuardrailController;

  beforeEach(() => {
    g = new ToolCallGuardrailController({
      exactFailureWarnAfter: 2,
      exactFailureBlockAfter: 4,
      sameToolFailureWarnAfter: 3,
      sameToolFailureHaltAfter: 6,
      noProgressWarnAfter: 2,
      noProgressBlockAfter: 4,
    });
  });

  it("warns when a tool returns the same output repeatedly", () => {
    g.afterCall("read_sandbox_file", { path: "/x" }, "same", false);
    g.afterCall("read_sandbox_file", { path: "/x" }, "same", false);
    const decision = g.afterCall("read_sandbox_file", { path: "/x" }, "same", false);
    expect(decision.action).toBe("warn");
  });

  it("blocks after noProgressBlockAfter identical successful outputs", () => {
    for (let i = 0; i < 4; i += 1) {
      g.afterCall("read_sandbox_file", { path: "/x" }, "same", false);
    }
    const decision = g.afterCall("read_sandbox_file", { path: "/x" }, "same", false);
    expect(decision.action).toBe("block");
  });

  it("does NOT flag no-progress for mutating tools repeating the same output", () => {
    // A write that returns the same confirmation repeatedly is not a stuck
    // loop — mutating tools are exempt from no-progress detection.
    for (let i = 0; i < 6; i += 1) {
      const d = g.afterCall("write_sandbox_file", { path: "/x" }, "ok", false);
      expect(d.action).toBe("allow");
    }
  });

  it("does NOT flag no-progress when a read-only tool's result changes", () => {
    g.afterCall("search_web", { query: "x" }, "result-A", false);
    const decision = g.afterCall("search_web", { query: "x" }, "result-B", false);
    expect(decision.action).toBe("allow");
  });
});
