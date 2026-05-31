import { describe, expect, it } from "vitest";
import { extractJsonObject, validateReviewPlan, shouldReview, isPlanPreambleOnly } from "./background-review";

describe("background-review — extractJsonObject", () => {
  it("parses a bare JSON object", () => {
    const obj = extractJsonObject('{"memory": [], "skill": null}');
    expect(obj).toEqual({ memory: [], skill: null });
  });

  it("parses JSON inside ```json fences", () => {
    const obj = extractJsonObject('```json\n{"memory": [{"key":"k","value":"v"}], "skill": null}\n```');
    expect(obj.memory[0].key).toBe("k");
  });

  it("parses JSON embedded in prose", () => {
    const obj = extractJsonObject('Here is my decision: {"memory": [], "skill": null} — done.');
    expect(obj).toEqual({ memory: [], skill: null });
  });

  it("handles braces inside strings", () => {
    const obj = extractJsonObject('{"memory": [{"key":"k","value":"a {nested} brace"}], "skill": null}');
    expect(obj.memory[0].value).toBe("a {nested} brace");
  });

  it("returns null when no object present", () => {
    expect(extractJsonObject("no json here")).toBeNull();
  });
});

describe("background-review — validateReviewPlan", () => {
  it("keeps valid memory items and defaults bad category", () => {
    const plan = validateReviewPlan({
      memory: [{ key: "user_name", value: "Alex", category: "bogus" }],
      skill: null,
    });
    expect(plan.memory).toHaveLength(1);
    expect(plan.memory[0].category).toBe("project_fact");
  });

  it("drops secret-bearing memory items", () => {
    const plan = validateReviewPlan({
      memory: [
        { key: "api_key", value: "sk-abc123", category: "project_fact" },
        { key: "fav_color", value: "blue", category: "user_preference" },
      ],
      skill: null,
    });
    expect(plan.memory).toHaveLength(1);
    expect(plan.memory[0].key).toBe("fav_color");
  });

  it("accepts a valid kebab-case skill, rejects bad names", () => {
    const good = validateReviewPlan({
      memory: [],
      skill: { action: "create", name: "pdf-merge-workflow", description: "d", body: "b" },
    });
    expect(good.skill?.name).toBe("pdf-merge-workflow");

    const bad = validateReviewPlan({
      memory: [],
      skill: { action: "create", name: "Bad Name!", description: "d", body: "b" },
    });
    expect(bad.skill).toBeNull();
  });

  it("rejects an unknown skill action", () => {
    const plan = validateReviewPlan({
      memory: [],
      skill: { action: "frobnicate", name: "x-workflow" },
    });
    expect(plan.skill).toBeNull();
  });

  it("returns empty plan for garbage input", () => {
    expect(validateReviewPlan(null)).toEqual({ memory: [], skill: null });
    expect(validateReviewPlan("nope")).toEqual({ memory: [], skill: null });
  });
});

describe("background-review — shouldReview gating", () => {
  it("reviews when enough substantive tools ran", () => {
    expect(
      shouldReview({ prompt: "do a thing", response: "done", toolsUsed: ["run_python", "search_web", "write_sandbox_file"] })
    ).toBe(true);
  });

  it("skips a low-tool turn with no correction signal", () => {
    expect(
      shouldReview({ prompt: "what is 2+2?", response: "4", toolsUsed: [] })
    ).toBe(false);
  });

  it("reviews a low-tool turn when the user states a preference", () => {
    expect(
      shouldReview({ prompt: "from now on, always answer concisely", response: "ok", toolsUsed: [] })
    ).toBe(true);
  });

  it("does not count housekeeping tools toward the substantive threshold", () => {
    expect(
      shouldReview({ prompt: "hi", response: "hello", toolsUsed: ["search_memory", "skill_view", "todo"] })
    ).toBe(false);
  });

  it("skips when the response is empty", () => {
    expect(
      shouldReview({ prompt: "remember my name is Alex", response: "", toolsUsed: [] })
    ).toBe(false);
  });

  it("skips a plan-preamble-only answer even after many tools", () => {
    const planText = "Plan: 1) Search for archives. 2) Download a PDF. 3) Deliver the file.\n\nLet me search for available archives.";
    expect(
      shouldReview({ prompt: "download the pdf", response: planText, toolsUsed: ["search_web", "browse_web", "run_terminal", "sandbox_browser"] })
    ).toBe(false);
  });
});

describe("background-review — isPlanPreambleOnly", () => {
  it("flags a plan-only preamble ending in a promise", () => {
    expect(isPlanPreambleOnly("Plan: 1) do x 2) do y.\n\nLet me search for that now.")).toBe(true);
  });

  it("flags a short bare plan", () => {
    expect(isPlanPreambleOnly("Plan:\n1) Search\n2) Download\n3) Deliver")).toBe(true);
  });

  it("does NOT flag a real delivered answer with a link", () => {
    const real = "I downloaded the Maulmain Chronicle (1837) PDF — 3.1 MB, 4 pages. Here is your link: https://example.e2b.app/files?path=x";
    expect(isPlanPreambleOnly(real)).toBe(false);
  });

  it("does NOT flag a normal prose answer that happens to mention a plan", () => {
    const real = "The first newspaper was the Maulmain Chronicle, founded in 1836 by the British administration in Moulmein.";
    expect(isPlanPreambleOnly(real)).toBe(false);
  });
});
