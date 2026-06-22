import { describe, expect, it } from "vitest";
import {
  containsToolCallTokens,
  extractToolCallsFromText,
  stripToolCallTokens,
  ToolCallStreamFilter,
} from "./tool-call-recovery";

const KIMI =
  '<|tool_calls_section_begin|><|tool_call_begin|>functions.search_web:0<|tool_call_argument_begin|>{"query": "tbhlabs owner"}<|tool_call_end|><|tool_calls_section_end|>';
const GLM_XML =
  "<tool_call>search_web\n<arg_key>query</arg_key>\n<arg_value>Mercedes Sosa albums</arg_value>\n</tool_call>";
const GLM_PAREN = '<tool_call>search_web(query="Word of the Day June 27 2022")';
const JSON_IN_TAG = '<tool_call>{"name":"browse_web","arguments":{"url":"https://x.com"}}</tool_call>';
const BARE_JSON =
  '{"id":"call_1","type":"function","function":{"name":"search_web","arguments":"{\\"query\\":\\"q\\"}"}}';

describe("containsToolCallTokens", () => {
  it("detects every leaked format", () => {
    expect(containsToolCallTokens(KIMI)).toBe(true);
    expect(containsToolCallTokens(GLM_XML)).toBe(true);
    expect(containsToolCallTokens(GLM_PAREN)).toBe(true);
    expect(containsToolCallTokens("...entries:0\n</arg_value></tool_call>")).toBe(true);
  });
  it("ignores clean prose", () => {
    expect(containsToolCallTokens("The answer is 3.")).toBe(false);
  });
});

describe("extractToolCallsFromText", () => {
  it("recovers a Kimi/Moonshot native tuple", () => {
    const { toolCalls, cleanedText } = extractToolCallsFromText(KIMI);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe("search_web");
    expect(toolCalls[0].args).toEqual({ query: "tbhlabs owner" });
    expect(cleanedText).toBe("");
  });

  it("recovers a GLM key/value XML call", () => {
    const { toolCalls, cleanedText } = extractToolCallsFromText(GLM_XML);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe("search_web");
    expect(toolCalls[0].args).toEqual({ query: "Mercedes Sosa albums" });
    expect(cleanedText).toBe("");
  });

  it("coerces GLM numeric/boolean arg values", () => {
    const text =
      "<tool_call>search_web<arg_key>query</arg_key><arg_value>x</arg_value>" +
      "<arg_key>limit</arg_key><arg_value>5</arg_value>" +
      "<arg_key>fetch_content</arg_key><arg_value>true</arg_value></tool_call>";
    const { toolCalls } = extractToolCallsFromText(text);
    expect(toolCalls[0].args).toEqual({ query: "x", limit: 5, fetch_content: true });
  });

  it("recovers the GLM parenthesized leak", () => {
    const { toolCalls } = extractToolCallsFromText(GLM_PAREN);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe("search_web");
    expect(toolCalls[0].args).toEqual({ query: "Word of the Day June 27 2022" });
  });

  it("recovers a JSON-in-tag call", () => {
    const { toolCalls } = extractToolCallsFromText(JSON_IN_TAG);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe("browse_web");
    expect(toolCalls[0].args).toEqual({ url: "https://x.com" });
  });

  it("recovers a bare function-call JSON blob", () => {
    const { toolCalls } = extractToolCallsFromText("Here you go: " + BARE_JSON);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe("search_web");
    expect(toolCalls[0].args).toEqual({ query: "q" });
  });

  it("recovers an unterminated GLM call (no closing tag)", () => {
    const text = "<tool_call>browse_web\n<arg_key>url</arg_key>\n<arg_value>https://example.com</arg_value>";
    const { toolCalls } = extractToolCallsFromText(text);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe("browse_web");
    expect(toolCalls[0].args).toEqual({ url: "https://example.com" });
  });

  it("repairs malformed Kimi argument JSON", () => {
    const dirty =
      '<|tool_call_begin|>functions.search_web:0<|tool_call_argument_begin|>{"query": "x",}<|tool_call_end|>';
    const { toolCalls } = extractToolCallsFromText(dirty);
    expect(toolCalls[0].args).toEqual({ query: "x" });
  });

  it("strips functions. namespace and :index suffix uniformly", () => {
    expect(extractToolCallsFromText(KIMI).toolCalls[0].name).toBe("search_web");
    const glm = "<tool_call>functions.search_web:0<arg_key>q</arg_key><arg_value>v</arg_value></tool_call>";
    expect(extractToolCallsFromText(glm).toolCalls[0].name).toBe("search_web");
  });

  it("preserves surrounding prose in cleanedText", () => {
    const mixed = "Let me search.\n" + GLM_XML + "\nDone.";
    const { toolCalls, cleanedText } = extractToolCallsFromText(mixed);
    expect(toolCalls).toHaveLength(1);
    expect(cleanedText).toContain("Let me search.");
    expect(cleanedText).toContain("Done.");
    expect(cleanedText).not.toContain("tool_call");
    expect(cleanedText).not.toContain("arg_value");
  });

  it("returns nothing for clean prose", () => {
    const { toolCalls, cleanedText } = extractToolCallsFromText("Just a normal answer.");
    expect(toolCalls).toHaveLength(0);
    expect(cleanedText).toBe("Just a normal answer.");
  });
});

describe("stripToolCallTokens", () => {
  it("removes a full Kimi section", () => {
    expect(stripToolCallTokens(KIMI)).toBe("");
  });
  it("removes a full GLM block", () => {
    expect(stripToolCallTokens(GLM_XML)).toBe("");
  });
  it("removes a truncated/stray arg leak", () => {
    expect(stripToolCallTokens("answer text</arg_value></tool_call>")).toBe("answer text");
  });
  it("drops everything from a dangling open marker", () => {
    expect(stripToolCallTokens("real answer<tool_call>search_web<arg_key>q")).toBe("real answer");
  });
});

describe("ToolCallStreamFilter", () => {
  it("suppresses Kimi markup fed char-by-char", () => {
    const f = new ToolCallStreamFilter();
    let visible = "";
    for (const ch of KIMI) visible += f.push(ch);
    visible += f.flush();
    expect(visible).toBe("");
  });

  it("suppresses GLM markup fed char-by-char", () => {
    const f = new ToolCallStreamFilter();
    let visible = "";
    for (const ch of GLM_XML) visible += f.push(ch);
    visible += f.flush();
    expect(visible).toBe("");
  });

  it("passes plain prose through unchanged", () => {
    const f = new ToolCallStreamFilter();
    let visible = "";
    for (const ch of "The final answer is 42.") visible += f.push(ch);
    visible += f.flush();
    expect(visible).toBe("The final answer is 42.");
  });

  it("emits prose before a tool call and suppresses the call", () => {
    const f = new ToolCallStreamFilter();
    let visible = "";
    for (const ch of "Searching now. " + GLM_XML) visible += f.push(ch);
    visible += f.flush();
    expect(visible.trim()).toBe("Searching now.");
  });
});
