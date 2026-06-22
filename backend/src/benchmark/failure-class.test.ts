/**
 * Tests for the GAIA failure-class triage. These lock in the bucketing that the
 * benchmark harness relies on to tell INFRASTRUCTURE failures (timeout/empty)
 * apart from QUALITY failures (precision/depth) — the distinction that drove the
 * deadline-aware retry work.
 */
import { describe, it, expect } from "vitest";
import { classifyFailure } from "./failure-class";

const base = { correct: false, modelAnswer: "Paris", toolCallCount: 1, durationMs: 1000 };

describe("classifyFailure", () => {
  it("returns pass for a correct result regardless of other fields", () => {
    expect(classifyFailure({ ...base, correct: true, modelAnswer: "" })).toBe("pass");
  });

  it("returns error when the run threw", () => {
    expect(classifyFailure({ ...base, error: "boom" })).toBe("error");
  });

  it("flags the rumination-timeout spiral as timeout_0_tools", () => {
    expect(
      classifyFailure({
        ...base,
        modelAnswer: "⏱️ The agent run timed out. Here's what was completed so far:",
        toolCallCount: 0,
        durationMs: 300_000,
      })
    ).toBe("timeout_0_tools");
  });

  it("distinguishes a timeout that DID use tools from the 0-tool spiral", () => {
    expect(
      classifyFailure({
        ...base,
        modelAnswer: "the run timed out",
        toolCallCount: 5,
      })
    ).toBe("timeout");
  });

  it("flags the turn-explainer's friendly timeout text as timeout_0_tools", () => {
    // Regression: replacing the mojibake placeholder with this explainer text
    // made 7 L1 timeouts silently re-bucket as `precision`. The scorer must
    // recognise the explainer phrasing as a timeout.
    expect(
      classifyFailure({
        ...base,
        modelAnswer:
          "I ran out of time on this task before fully finishing. Above is my best answer from what I had — ask me to continue if you need more.",
        toolCallCount: 0,
        durationMs: 250_000,
      })
    ).toBe("timeout_0_tools");
  });

  it("flags an explainer-text timeout that used tools as timeout", () => {
    expect(
      classifyFailure({
        ...base,
        modelAnswer: "I ran out of time on this task before fully finishing.",
        toolCallCount: 4,
        durationMs: 250_000,
      })
    ).toBe("timeout");
  });

  it("returns empty for a blank answer with no timeout marker", () => {
    expect(classifyFailure({ ...base, modelAnswer: "   " })).toBe("empty");
  });

  it("buckets a wrong answer with little tool use as precision", () => {
    expect(classifyFailure({ ...base, modelAnswer: "12000", toolCallCount: 1 })).toBe("precision");
  });

  it("buckets a wrong answer after heavy research as depth", () => {
    expect(classifyFailure({ ...base, modelAnswer: "Yamasaki", toolCallCount: 6 })).toBe("depth");
  });

  it("prioritizes error over a timeout-looking answer", () => {
    expect(
      classifyFailure({ ...base, error: "network", modelAnswer: "timed out" })
    ).toBe("error");
  });
});
