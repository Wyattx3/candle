/**
 * Tests for the turn-completion explainer ported from Hermes' turn_finalizer.py.
 * Pure functions, no network/model.
 */
import { describe, it, expect } from "vitest";
import {
  explainEmptyFinal,
  explanationForExitReason,
  isEmptyFinal,
  isTruncatedFragment,
} from "./turn-explainer";

describe("isEmptyFinal", () => {
  it("is true for blank and the (empty) sentinel", () => {
    expect(isEmptyFinal("")).toBe(true);
    expect(isEmptyFinal("   ")).toBe(true);
    expect(isEmptyFinal("(empty)")).toBe(true);
    expect(isEmptyFinal(null)).toBe(true);
  });
  it("is false for real content", () => {
    expect(isEmptyFinal("42")).toBe(false);
  });
});

describe("isTruncatedFragment", () => {
  it("flags a short fragment with no terminal punctuation", () => {
    expect(isTruncatedFragment("The")).toBe(true);
    expect(isTruncatedFragment("In order to")).toBe(true);
  });
  it("does not flag a short COMPLETE answer", () => {
    expect(isTruncatedFragment("42.")).toBe(false);
    expect(isTruncatedFragment("Paris!")).toBe(false);
    expect(isTruncatedFragment("50%")).toBe(false);
  });
  it("does not flag a long answer", () => {
    expect(isTruncatedFragment("x".repeat(50))).toBe(false);
  });
  it("does not flag empty", () => {
    expect(isTruncatedFragment("")).toBe(false);
  });
});

describe("explanationForExitReason", () => {
  it("maps budget reasons", () => {
    expect(explanationForExitReason("max_iterations_reached(90/90)").toLowerCase()).toContain("budget");
  });
  it("maps time/deadline reasons", () => {
    expect(explanationForExitReason("deadline reached").toLowerCase()).toContain("time");
    expect(explanationForExitReason("LLM call exceeded 75s timeout").toLowerCase()).toContain("time");
  });
  it("maps stall/stream reasons", () => {
    expect(explanationForExitReason("stall after 30s").toLowerCase()).toContain("stall");
  });
  it("has a generic fallback", () => {
    expect(explanationForExitReason("something weird").length).toBeGreaterThan(0);
  });
});

describe("explainEmptyFinal", () => {
  it("replaces an empty final with an explanation", () => {
    const out = explainEmptyFinal("", "time budget reached", true);
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toBe("");
  });
  it("replaces the (empty) sentinel", () => {
    const out = explainEmptyFinal("(empty)", "budget", true);
    expect(out).not.toBe("(empty)");
    expect(out.toLowerCase()).toContain("budget");
  });
  it("appends the reason to a truncated fragment, keeping the fragment", () => {
    const out = explainEmptyFinal("The", "deadline", true);
    expect(out.startsWith("The")).toBe(true);
    expect(out.length).toBeGreaterThan("The".length);
  });
  it("returns a real answer unchanged", () => {
    const answer = "The capital of France is Paris.";
    expect(explainEmptyFinal(answer, "text_response", true)).toBe(answer);
  });
  it("returns text unchanged when the exit is not abnormal", () => {
    expect(explainEmptyFinal("", "text_response", false)).toBe("");
  });
});
