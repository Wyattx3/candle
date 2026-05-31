import { describe, expect, it } from "vitest";
import {
  compactValue,
  contentToText,
  extractCodeOutput,
  extractMainContent,
  extractSearchResults,
  normalizeHistory,
  normalizeToolInput,
  normalizeToolOutput,
  stripPlanPreamble,
} from "./helpers";


describe("stripPlanPreamble", () => {
  it("removes a multi-line Plan block", () => {
    const input = "Plan:\n1) Search\n2) Compile\n3) Deliver\n\nHere is the real answer.";
    expect(stripPlanPreamble(input)).toBe("Here is the real answer.");
  });

  it("removes a single-line Plan", () => {
    const input = "Plan: 1) search 2) build 3) deliver\nThe data is ready.";
    expect(stripPlanPreamble(input)).toBe("The data is ready.");
  });

  it("removes a leading 'Let me ...' promise", () => {
    const input = "Let me search for that now.\nFound it: the capital is Paris.";
    expect(stripPlanPreamble(input)).toBe("Found it: the capital is Paris.");
  });

  it("returns empty string when the whole text is just a plan", () => {
    const input = "Plan:\n1) Search for data\n2) Build the file\n3) Deliver";
    expect(stripPlanPreamble(input)).toBe("");
  });

  it("leaves a normal answer untouched", () => {
    const input = "The first newspaper was the Maulmain Chronicle, founded in 1836.";
    expect(stripPlanPreamble(input)).toBe(input);
  });
});

describe("contentToText", () => {
  it("returns plain strings as-is", () => {
    expect(contentToText("hello")).toBe("hello");
  });

  it("concatenates array parts", () => {
    expect(contentToText(["a", "b", "c"])).toBe("abc");
  });

  it("extracts text from object parts", () => {
    expect(contentToText([{ text: "x" }, { text: "y" }])).toBe("xy");
  });

  it("returns empty string for unknown shapes", () => {
    expect(contentToText(null)).toBe("");
    expect(contentToText(42)).toBe("");
    expect(contentToText({})).toBe("");
  });
});

describe("normalizeToolInput", () => {
  it("parses JSON strings", () => {
    expect(normalizeToolInput('{"a":1}')).toEqual({ a: 1 });
  });

  it("unwraps {input:...} envelopes", () => {
    expect(normalizeToolInput({ input: { a: 1 } })).toEqual({ a: 1 });
  });

  it("unwraps nested {input:{input:...}} envelopes up to 3 levels", () => {
    expect(normalizeToolInput({ input: { input: { a: 1 } } })).toEqual({ a: 1 });
  });

  it("returns plain object unchanged", () => {
    expect(normalizeToolInput({ a: 1 })).toEqual({ a: 1 });
  });

  it("falls back to raw string when JSON parse fails", () => {
    expect(normalizeToolInput("not-json")).toBe("not-json");
  });
});

describe("normalizeToolOutput", () => {
  it("redacts secrets", () => {
    const out = normalizeToolOutput("Authorization: Bearer abc123def456ghi789");
    expect(out).not.toContain("abc123def456ghi789");
  });

  it("returns 'Tool completed.' for empty output", () => {
    expect(normalizeToolOutput("")).toBe("Tool completed.");
    expect(normalizeToolOutput(null)).toBe("Tool completed.");
  });

  it("unwraps content envelopes", () => {
    const out = normalizeToolOutput({ content: "actual text" });
    expect(out).toBe("actual text");
  });

  it("truncates oversized output", () => {
    const huge = "x".repeat(50_000);
    const out = normalizeToolOutput(huge);
    expect(out.length).toBeLessThan(huge.length);
    expect(out).toContain("[truncated");
  });
});

describe("compactValue", () => {
  it("collapses whitespace", () => {
    expect(compactValue("a\n\nb   c")).toBe("a b c");
  });

  it("stringifies objects", () => {
    expect(compactValue({ a: 1 })).toBe('{"a":1}');
  });

  it("redacts secrets", () => {
    expect(compactValue("Authorization: Bearer abc123def456ghi789")).toContain("[REDACTED]");
  });
});

describe("normalizeHistory", () => {
  it("filters empty content", () => {
    const result = normalizeHistory([
      { role: "user", content: "hi" },
      { role: "assistant", content: "" },
      { role: "user", content: "   " },
    ]);
    expect(result.length).toBe(1);
    expect(result[0].content).toBe("hi");
  });

  it("truncates long messages", () => {
    const long = "x".repeat(20_000);
    const result = normalizeHistory([{ role: "user", content: long }]);
    expect(result[0].content.length).toBeLessThanOrEqual(12_000);
  });
});

describe("extractSearchResults", () => {
  it("keeps URL-bearing lines", () => {
    const input = "Random preamble.\nhttps://example.com/page\n#header\nAnother long line of meaningful content here.";
    const out = extractSearchResults(input);
    expect(out).toContain("https://example.com/page");
  });

  it("caps the output below 3 KB", () => {
    const input = ("https://example.com/" + "a".repeat(100) + "\n").repeat(200);
    expect(extractSearchResults(input).length).toBeLessThanOrEqual(3100);
  });
});

describe("extractMainContent", () => {
  it("strips common nav/footer/cookie chrome", () => {
    const input = [
      "Skip to main content",
      "Cookie banner agreement",
      "© 2024 All rights reserved",
      "Real article content here.",
    ].join("\n");
    const out = extractMainContent(input);
    expect(out).toContain("Real article content here");
    expect(out).not.toContain("Skip to main content");
    expect(out).not.toContain("Cookie banner");
    expect(out).not.toContain("All rights reserved");
  });
});

describe("extractCodeOutput", () => {
  it("preserves stdout label", () => {
    const input = "stdout:\nhello world\nstderr:\n";
    const out = extractCodeOutput(input);
    expect(out).toContain("hello world");
    expect(out).toContain("OUTPUT");
  });

  it("preserves stderr when present", () => {
    const input = "stdout:\nstuff\nstderr:\nfailure detail";
    const out = extractCodeOutput(input);
    expect(out).toContain("ERRORS");
    expect(out).toContain("failure detail");
  });
});
