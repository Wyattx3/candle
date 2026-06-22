/**
 * Tests for the GAIA scorer port. The expected results mirror the behaviour of
 * the upstream `question_scorer` so we know our exact-match grading matches the
 * official leaderboard's.
 */
import { describe, it, expect } from "vitest";
import {
  questionScorer,
  normalizeNumberStr,
  normalizeStr,
  splitString,
  extractFinalAnswer,
} from "./scorer";

describe("normalizeNumberStr", () => {
  it("strips currency, percent, and thousands separators", () => {
    expect(normalizeNumberStr("$1,234.50")).toBe(1234.5);
    expect(normalizeNumberStr("17%")).toBe(17);
    expect(normalizeNumberStr("1,000,000")).toBe(1000000);
  });
  it("returns Infinity for unparseable input", () => {
    expect(normalizeNumberStr("abc")).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("normalizeStr", () => {
  it("removes whitespace, lowercases, strips punctuation by default", () => {
    expect(normalizeStr("Hello, World!")).toBe("helloworld");
  });
  it("can preserve punctuation when asked", () => {
    expect(normalizeStr("a-b c", false)).toBe("a-bc");
  });
});

describe("splitString", () => {
  it("splits on commas and semicolons", () => {
    expect(splitString("a,b;c")).toEqual(["a", "b", "c"]);
  });
});

describe("questionScorer — numeric ground truth", () => {
  it("matches equal numbers regardless of formatting", () => {
    expect(questionScorer("1,234", "1234")).toBe(true);
    expect(questionScorer("$5.00", "5")).toBe(true);
    expect(questionScorer("17%", "17")).toBe(true);
  });
  it("rejects wrong numbers", () => {
    expect(questionScorer("42", "43")).toBe(false);
  });
});

describe("questionScorer — string ground truth", () => {
  it("is whitespace/case/punct insensitive", () => {
    expect(questionScorer("Paris.", "paris")).toBe(true);
    expect(questionScorer("  THE  Beatles ", "the beatles")).toBe(true);
  });
  it("rejects different strings", () => {
    expect(questionScorer("London", "Paris")).toBe(false);
  });
});

describe("questionScorer — list ground truth", () => {
  it("matches lists element-wise ignoring spacing", () => {
    expect(questionScorer("apple, banana, cherry", "apple,banana,cherry")).toBe(true);
  });
  it("matches numeric list elements numerically", () => {
    // NOTE: list elements must not contain their own thousands separators —
    // the upstream scorer splits on commas first, so "1,000" would become two
    // elements. This mirrors the official GAIA scorer's known limitation.
    expect(questionScorer("1000, 2000", "1000,2000")).toBe(true);
    expect(questionScorer("3.5; 4.0", "3.5;4")).toBe(true);
  });
  it("rejects lists of differing length", () => {
    expect(questionScorer("a,b", "a,b,c")).toBe(false);
  });
  it("rejects lists with a wrong element", () => {
    expect(questionScorer("a,b,c", "a,b,d")).toBe(false);
  });
});

describe("extractFinalAnswer", () => {
  it("pulls the payload after the FINAL ANSWER marker", () => {
    expect(extractFinalAnswer("Reasoning here.\nFINAL ANSWER: 42")).toBe("42");
  });
  it("is case-insensitive and tolerates markdown bold", () => {
    expect(extractFinalAnswer("**Final Answer:** Paris")).toBe("Paris");
  });
  it("prefers the last marker when several appear", () => {
    expect(extractFinalAnswer("FINAL ANSWER: wrong\nmore\nFINAL ANSWER: right")).toBe("right");
  });
  it("falls back to the last non-empty line when no marker", () => {
    expect(extractFinalAnswer("line one\nline two\n")).toBe("line two");
  });
  it("returns empty string for empty input", () => {
    expect(extractFinalAnswer("")).toBe("");
  });
});
