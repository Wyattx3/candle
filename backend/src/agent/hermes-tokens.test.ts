import { describe, expect, it } from "vitest";
import {
  containsHermesToolTokens,
  parseHermesToolCalls,
  stripHermesToolTokens,
  HermesStreamFilter,
} from "./hermes-tokens";

const SAMPLE =
  '<|tool_calls_section_begin|><|tool_call_begin|>functions.search_web:0<|tool_call_argument_begin|>{"query": "tbhlabs owner"}<|tool_call_end|><|tool_calls_section_end|>';

describe("containsHermesToolTokens", () => {
  it("detects markers", () => {
    expect(containsHermesToolTokens(SAMPLE)).toBe(true);
  });
  it("ignores clean text", () => {
    expect(containsHermesToolTokens("just a normal answer")).toBe(false);
  });
});

describe("parseHermesToolCalls", () => {
  it("recovers a structured tool call and normalizes the name", () => {
    const { toolCalls, cleanedText } = parseHermesToolCalls(SAMPLE);
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0].name).toBe("search_web");
    expect(toolCalls[0].args).toEqual({ query: "tbhlabs owner" });
    expect(cleanedText).toBe("");
  });

  it("repairs malformed argument JSON instead of dropping it", () => {
    const dirty =
      '<|tool_call_begin|>functions.search_web:0<|tool_call_argument_begin|>{"query": "x",}<|tool_call_end|>';
    const { toolCalls } = parseHermesToolCalls(dirty);
    expect(toolCalls[0].args).toEqual({ query: "x" });
  });

  it("preserves surrounding prose in cleanedText", () => {
    const mixed = "Let me search.\n" + SAMPLE + "done";
    const { toolCalls, cleanedText } = parseHermesToolCalls(mixed);
    expect(toolCalls).toHaveLength(1);
    expect(cleanedText).toContain("Let me search.");
    expect(cleanedText).toContain("done");
    expect(cleanedText).not.toContain("tool_call");
  });
});

describe("stripHermesToolTokens", () => {
  it("removes a full section", () => {
    expect(stripHermesToolTokens(SAMPLE)).toBe("");
  });
});

describe("HermesStreamFilter", () => {
  it("suppresses markup fed char-by-char", () => {
    const f = new HermesStreamFilter();
    let visible = "";
    for (const ch of SAMPLE) visible += f.push(ch);
    visible += f.flush();
    expect(visible).toBe("");
  });

  it("keeps prose but hides the section in mixed streams", () => {
    const mixed = "Searching.\n" + SAMPLE + "Done.";
    const f = new HermesStreamFilter();
    let visible = "";
    for (const ch of mixed) visible += f.push(ch);
    visible += f.flush();
    expect(visible).toContain("Searching.");
    expect(visible).toContain("Done.");
    expect(visible).not.toContain("tool_call");
  });
});
