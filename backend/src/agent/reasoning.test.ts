import { describe, expect, it } from "vitest";
import {
  containsInlineReasoning,
  extractInlineReasoning,
  stripInlineReasoning,
  extractStructuredReasoning,
  ThinkStreamFilter,
} from "./reasoning";


describe("containsInlineReasoning", () => {
  it("detects an opening think tag", () => {
    expect(containsInlineReasoning("hi <think>foo")).toBe(true);
  });

  it("detects a closing reasoning tag", () => {
    expect(containsInlineReasoning("foo</reasoning> done")).toBe(true);
  });

  it("is false for plain text", () => {
    expect(containsInlineReasoning("just a normal answer")).toBe(false);
  });

  it("is false for empty input", () => {
    expect(containsInlineReasoning("")).toBe(false);
  });
});


describe("extractInlineReasoning", () => {
  it("pulls a single <think> block out of content", () => {
    const input = "<think>Let me consider the options.</think>The answer is 42.";
    const { reasoning, cleaned } = extractInlineReasoning(input);
    expect(reasoning).toBe("Let me consider the options.");
    expect(cleaned).toBe("The answer is 42.");
  });

  it("handles REASONING_SCRATCHPAD blocks", () => {
    const input = "<REASONING_SCRATCHPAD>\nstep by step\n</REASONING_SCRATCHPAD>\n\nDone.";
    const { reasoning, cleaned } = extractInlineReasoning(input);
    expect(reasoning).toBe("step by step");
    expect(cleaned).toBe("Done.");
  });

  it("joins multiple reasoning blocks", () => {
    const input = "<think>first</think>middle<thinking>second</thinking>end";
    const { reasoning, cleaned } = extractInlineReasoning(input);
    expect(reasoning).toBe("first\n\nsecond");
    expect(cleaned).toBe("middleend");
  });

  it("treats an unterminated open tag as reasoning to end of string", () => {
    const input = "Here is the plan.<think>I never closed this";
    const { reasoning, cleaned } = extractInlineReasoning(input);
    expect(reasoning).toBe("I never closed this");
    expect(cleaned).toBe("Here is the plan.");
  });

  it("treats text before an orphan </think> as reasoning (GLM/DeepSeek-R1 leak)", () => {
    // Reasoning models stream their thinking via reasoning_content, then leak
    // `…draft</think>answer` into the content channel. Everything before the
    // orphan close tag is the draft/thinking; the real answer follows it.
    const input = "draft thoughts</think>the real answer";
    const { reasoning, cleaned } = extractInlineReasoning(input);
    expect(cleaned).not.toContain("</think>");
    expect(cleaned).toBe("the real answer");
    expect(reasoning).toBe("draft thoughts");
  });

  it("is case-insensitive on tag names", () => {
    const input = "<THINK>cap</THINK>visible";
    const { reasoning, cleaned } = extractInlineReasoning(input);
    expect(reasoning).toBe("cap");
    expect(cleaned).toBe("visible");
  });

  it("tolerates attributes on the opening tag", () => {
    const input = '<reasoning effort="high">deep</reasoning>out';
    const { reasoning, cleaned } = extractInlineReasoning(input);
    expect(reasoning).toBe("deep");
    expect(cleaned).toBe("out");
  });

  it("leaves plain content untouched", () => {
    const input = "No tags here at all.";
    const { reasoning, cleaned } = extractInlineReasoning(input);
    expect(reasoning).toBe("");
    expect(cleaned).toBe(input);
  });
});


describe("stripInlineReasoning", () => {
  it("discards reasoning and returns clean answer", () => {
    expect(stripInlineReasoning("<think>x</think>answer")).toBe("answer");
  });
});


describe("extractStructuredReasoning", () => {
  it("reads additional_kwargs.reasoning_content", () => {
    const msg = { additional_kwargs: { reasoning_content: "kimi thinking" } };
    expect(extractStructuredReasoning(msg)).toBe("kimi thinking");
  });

  it("reads additional_kwargs.reasoning", () => {
    const msg = { additional_kwargs: { reasoning: "deepseek thinking" } };
    expect(extractStructuredReasoning(msg)).toBe("deepseek thinking");
  });

  it("reads reasoning fields hoisted onto the message", () => {
    const msg = { reasoning_content: "hoisted" };
    expect(extractStructuredReasoning(msg)).toBe("hoisted");
  });

  it("reads reasoning_details array (OpenRouter unified)", () => {
    const msg = {
      additional_kwargs: {
        reasoning_details: [
          { type: "reasoning.summary", summary: "part one" },
          { type: "reasoning.text", text: "part two" },
        ],
      },
    };
    expect(extractStructuredReasoning(msg)).toBe("part one\n\npart two");
  });

  it("de-duplicates identical reasoning across fields", () => {
    const msg = {
      additional_kwargs: { reasoning_content: "same", reasoning: "same" },
    };
    expect(extractStructuredReasoning(msg)).toBe("same");
  });

  it("returns empty string when no reasoning present", () => {
    expect(extractStructuredReasoning({ additional_kwargs: {} })).toBe("");
    expect(extractStructuredReasoning(null)).toBe("");
    expect(extractStructuredReasoning({})).toBe("");
  });
});


describe("ThinkStreamFilter", () => {
  it("separates reasoning from answer in one chunk", () => {
    const f = new ThinkStreamFilter();
    const r = f.push("<think>thinking</think>visible");
    const tail = f.flush();
    expect(r.reasoning + tail.reasoning).toBe("thinking");
    expect(r.answer + tail.answer).toBe("visible");
  });

  it("handles a tag split across chunk boundaries", () => {
    const f = new ThinkStreamFilter();
    let answer = "";
    let reasoning = "";
    // "<thi" then "nk>secret</think>answer" splits the opening tag.
    for (const chunk of ["pre <thi", "nk>secret</thi", "nk>answer"]) {
      const r = f.push(chunk);
      answer += r.answer;
      reasoning += r.reasoning;
    }
    const tail = f.flush();
    answer += tail.answer;
    reasoning += tail.reasoning;
    expect(reasoning).toBe("secret");
    expect(answer).toBe("pre answer");
  });

  it("treats an unterminated reasoning block as reasoning on flush", () => {
    const f = new ThinkStreamFilter();
    const r = f.push("<think>dangling thought never closed");
    const tail = f.flush();
    expect((r.reasoning + tail.reasoning)).toContain("dangling thought never closed");
    expect(r.answer + tail.answer).toBe("");
  });

  it("passes plain text straight through as answer", () => {
    const f = new ThinkStreamFilter();
    const r = f.push("just an answer");
    const tail = f.flush();
    expect(r.answer + tail.answer).toBe("just an answer");
    expect(r.reasoning + tail.reasoning).toBe("");
  });

  it("streams answer text token by token without holding non-tag text", () => {
    const f = new ThinkStreamFilter();
    let answer = "";
    for (const ch of "hello world".split("")) {
      answer += f.push(ch).answer;
    }
    answer += f.flush().answer;
    expect(answer).toBe("hello world");
  });
});
