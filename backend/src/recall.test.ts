import { describe, expect, it } from "vitest";
import { rankRecallMatches } from "./tools_extra";

function rec(partial: { runId: string; sessionId?: string; prompt?: string; partialAnswer?: string; status?: string; startedAt?: number; tools?: string[] }) {
  return {
    runId: partial.runId,
    sessionId: partial.sessionId ?? "other",
    prompt: partial.prompt ?? "",
    partialAnswer: partial.partialAnswer ?? "",
    status: partial.status ?? "completed",
    startedAt: partial.startedAt ?? 1_000,
    toolEvents: (partial.tools ?? []).map((name) => ({ name })),
  };
}

describe("recall — rankRecallMatches", () => {
  it("matches on keyword overlap in prompt or answer", () => {
    const records = [
      rec({ runId: "a", prompt: "merge pdf invoices for Q3" }),
      rec({ runId: "b", prompt: "download a youtube video" }),
    ];
    const matches = rankRecallMatches(records, "merge pdf", "current");
    expect(matches).toHaveLength(1);
    expect(matches[0].runId).toBe("a");
  });

  it("excludes the current session", () => {
    const records = [
      rec({ runId: "self", sessionId: "current", prompt: "merge pdf files" }),
      rec({ runId: "past", sessionId: "other", prompt: "merge pdf files" }),
    ];
    const matches = rankRecallMatches(records, "merge pdf", "current");
    expect(matches.map((m) => m.runId)).toEqual(["past"]);
  });

  it("ranks higher keyword overlap first, newest-first on ties", () => {
    const records = [
      rec({ runId: "one-term", prompt: "merge documents", startedAt: 5_000 }),
      rec({ runId: "two-term-old", prompt: "merge pdf reports", startedAt: 1_000 }),
      rec({ runId: "two-term-new", prompt: "merge pdf invoices", startedAt: 9_000 }),
    ];
    const matches = rankRecallMatches(records, "merge pdf", "current");
    expect(matches.map((m) => m.runId)).toEqual(["two-term-new", "two-term-old", "one-term"]);
  });

  it("ignores terms shorter than 3 chars and returns [] when none qualify", () => {
    const records = [rec({ runId: "a", prompt: "do it" })];
    expect(rankRecallMatches(records, "do it", "current")).toEqual([]);
  });

  it("respects the limit (default 5, capped at 10)", () => {
    const records = Array.from({ length: 12 }, (_, i) => rec({ runId: `r${i}`, prompt: "merge pdf" }));
    expect(rankRecallMatches(records, "merge pdf", "current")).toHaveLength(5);
    expect(rankRecallMatches(records, "merge pdf", "current", 3)).toHaveLength(3);
    expect(rankRecallMatches(records, "merge pdf", "current", 50)).toHaveLength(10);
  });

  it("redacts secrets and dedupes tool names in the output", () => {
    const records = [
      rec({
        runId: "a",
        prompt: "deploy with key sk-abcdefghijklmnopqrstuvwxyz1234567890",
        tools: ["search_web", "search_web", "run_python"],
      }),
    ];
    const matches = rankRecallMatches(records, "deploy", "current");
    expect(matches[0].prompt).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    expect(matches[0].tools).toEqual(["search_web", "run_python"]);
  });
});
