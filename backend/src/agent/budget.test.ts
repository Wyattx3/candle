import { describe, expect, it } from "vitest";
import {
  classifyQueryComplexity,
  COST_CEILINGS,
  isResearchQuery,
  TOOL_BUDGETS,
  TOOL_COST_WEIGHTS,
  toolCostWeight,
} from "./budget";

describe("classifyQueryComplexity — simple bucket", () => {
  const SIMPLE_PROMPTS = [
    "ok",
    "Thanks!",
    "thank you",
    "got it",
    "hi",
    "hello there",
    "What is the capital of France?",
    "Who is the president of Brazil?",
    "Define quantum computing",
    "What does HTTP stand for?",
  ];

  for (const prompt of SIMPLE_PROMPTS) {
    it(`treats "${prompt}" as simple`, () => {
      expect(classifyQueryComplexity(prompt, 0)).toBe("simple");
    });
  }
});

describe("classifyQueryComplexity — complex bucket", () => {
  const COMPLEX_PROMPTS = [
    "Download this video https://youtube.com/watch?v=xxx and convert it to mp3 for me",
    "Build a Python script to scrape hacker news and save to CSV, then run it.",
    "Compare the top 5 Python web frameworks step by step with code examples for me",
    "Find me every restaurant in Tokyo that serves vegetarian food and rank them by reviews",
    "Generate a detailed weekly report from the sales data and email it to the team",
    "Build a dashboard for the sales metrics and deploy it to staging step by step",
  ];

  for (const prompt of COMPLEX_PROMPTS) {
    it(`treats "${prompt.slice(0, 60)}..." as complex`, () => {
      expect(classifyQueryComplexity(prompt, 0)).toBe("complex");
    });
  }
});

describe("classifyQueryComplexity — moderate fallback", () => {
  it("treats medium-length non-imperative questions as moderate", () => {
    const prompt = "Why does Node.js use an event loop and what are the alternatives in modern runtimes";
    expect(classifyQueryComplexity(prompt, 0)).toBe("moderate");
  });

  it("treats follow-up nudges in an active conversation as complex", () => {
    expect(classifyQueryComplexity("try again", 4)).toBe("complex");
    expect(classifyQueryComplexity("more please", 4)).toBe("complex");
    expect(classifyQueryComplexity("keep going", 4)).toBe("complex");
  });

  it("treats short follow-ups in a conversation as moderate when no continuation keyword", () => {
    expect(classifyQueryComplexity("That approach seems reasonable.", 4)).toBe("moderate");
  });
});

describe("classifyQueryComplexity — language-agnostic action detection", () => {
  it("classifies an English action word embedded in another language as complex", () => {
    // 'download' wrapped in Burmese — an Execute task, not a cheap lookup.
    expect(classifyQueryComplexity("manga chapter 1 ကို download လုပ်ပေး", 2)).toBe("complex");
  });

  it("classifies a bare URL request as complex", () => {
    expect(classifyQueryComplexity("https://example.com/file.pdf ဒါ ကို သိမ်းပေး", 0)).toBe("complex");
  });

  it("classifies 'send me' + media noun as complex", () => {
    expect(classifyQueryComplexity("send me the pdf of that report", 2)).toBe("complex");
  });

  it("does not over-escalate a plain factual question that mentions a media word", () => {
    expect(classifyQueryComplexity("what is a manga?", 0)).toBe("simple");
  });
});

describe("TOOL_BUDGETS", () => {
  it("defines all three buckets", () => {
    expect(TOOL_BUDGETS.simple.maxToolCalls).toBeGreaterThan(0);
    expect(TOOL_BUDGETS.moderate.maxToolCalls).toBeGreaterThan(TOOL_BUDGETS.simple.maxToolCalls);
    expect(TOOL_BUDGETS.complex.maxToolCalls).toBeGreaterThan(TOOL_BUDGETS.moderate.maxToolCalls);
  });

  it("warningAt is below maxToolCalls in every bucket", () => {
    for (const bucket of ["simple", "moderate", "complex"] as const) {
      expect(TOOL_BUDGETS[bucket].warningAt).toBeLessThan(TOOL_BUDGETS[bucket].maxToolCalls);
    }
  });

  it("cost ceilings scale with complexity", () => {
    expect(COST_CEILINGS.simple).toBeLessThan(COST_CEILINGS.moderate);
    expect(COST_CEILINGS.moderate).toBeLessThan(COST_CEILINGS.complex);
  });
});

describe("toolCostWeight", () => {
  it("returns the configured weight for known tools", () => {
    expect(toolCostWeight("search_web")).toBe(TOOL_COST_WEIGHTS.search_web);
    expect(toolCostWeight("spawn_subagent")).toBe(TOOL_COST_WEIGHTS.spawn_subagent);
  });

  it("defaults to 1 for unknown tools", () => {
    expect(toolCostWeight("some_random_tool")).toBe(1);
  });
});

describe("isResearchQuery", () => {
  it("marks find/identify queries as research", () => {
    expect(
      isResearchQuery([
        { role: "user", content: "Find me the title of this song from these lyrics" },
      ])
    ).toBe(true);
  });

  it("marks 'identify the artist' queries as research", () => {
    expect(
      isResearchQuery([{ role: "user", content: "Identify the artist behind this album cover" }])
    ).toBe(true);
  });

  it("does NOT mark code execution requests as research", () => {
    expect(
      isResearchQuery([
        { role: "user", content: "Run this script and tell me what it prints" },
      ])
    ).toBe(false);
  });

  it("returns false on empty history", () => {
    expect(isResearchQuery([])).toBe(false);
  });
});
