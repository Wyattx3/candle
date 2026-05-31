import { describe, expect, it } from "vitest";
import {
  sanitizeSurrogates,
  sanitizeSurrogatesDeep,
  sanitizeMessagesSurrogates,
  repairToolCallArguments,
  escapeInvalidCharsInJsonStrings,
} from "./message-sanitization";

describe("sanitizeSurrogates", () => {
  it("replaces a lone high surrogate with U+FFFD", () => {
    expect(sanitizeSurrogates("a\uD800b")).toBe("a\uFFFDb");
  });
  it("is a no-op on clean text", () => {
    expect(sanitizeSurrogates("hello world")).toBe("hello world");
  });
  it("preserves valid surrogate pairs (emoji)", () => {
    // 😀 is a valid pair; it must survive untouched.
    expect(sanitizeSurrogates("😀")).toBe("😀");
  });
});

describe("sanitizeSurrogatesDeep", () => {
  it("scrubs nested strings", () => {
    const result = sanitizeSurrogatesDeep({ a: ["x\uD800", { b: "y\uDC00" }] });
    expect(JSON.stringify(result)).not.toMatch(/[\uD800-\uDFFF]/);
  });
});

describe("sanitizeMessagesSurrogates", () => {
  it("flags and cleans surrogates in content and tool args", () => {
    const { messages, changed } = sanitizeMessagesSurrogates([
      { role: "user", content: "ok\uD83D" },
      { role: "assistant", tool_calls: [{ id: "x\uDC00", function: { name: "f", arguments: '{"a":1}' } }] },
    ]);
    expect(changed).toBe(true);
    expect(JSON.stringify(messages)).not.toMatch(/[\uD800-\uDFFF]/);
  });
  it("does not flag clean messages", () => {
    const { changed } = sanitizeMessagesSurrogates([{ role: "user", content: "hi" }]);
    expect(changed).toBe(false);
  });
});

describe("repairToolCallArguments", () => {
  it("strips trailing commas", () => {
    expect(repairToolCallArguments('{"a":1,}').repaired).toBe('{"a":1}');
  });
  it("closes unclosed braces", () => {
    expect(repairToolCallArguments('{"a":1').repaired).toBe('{"a":1}');
  });
  it("normalizes Python None to empty object", () => {
    expect(repairToolCallArguments("None").repaired).toBe("{}");
  });
  it("empties unrepairable junk", () => {
    expect(repairToolCallArguments("").repaired).toBe("{}");
  });
  it("passes valid JSON through (compacted)", () => {
    expect(repairToolCallArguments('{"q": "hi"}').repaired).toBe('{"q":"hi"}');
  });
});

describe("escapeInvalidCharsInJsonStrings", () => {
  it("escapes literal control chars inside strings", () => {
    expect(escapeInvalidCharsInJsonStrings('{"a":"x\ty"}')).toContain("\\u0009");
  });
  it("leaves chars outside strings alone", () => {
    expect(escapeInvalidCharsInJsonStrings('{"a":1}')).toBe('{"a":1}');
  });
});
