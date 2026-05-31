import { describe, expect, it, beforeEach } from "vitest";
import { applyAutomaticTransitions } from "./curator";
import { _seedUsageForTests, getRecord, SkillUsageRecord } from "../skill-usage";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

function rec(partial: Partial<SkillUsageRecord> & { name: string }): SkillUsageRecord {
  return {
    name: partial.name,
    createdByAgent: partial.createdByAgent ?? true,
    createdAt: partial.createdAt ?? NOW,
    lastActivityAt: partial.lastActivityAt ?? NOW,
    viewCount: partial.viewCount ?? 0,
    state: partial.state ?? "active",
    pinned: partial.pinned ?? false,
  };
}

describe("curator — applyAutomaticTransitions", () => {
  it("marks an idle active skill stale after the stale window", () => {
    _seedUsageForTests([rec({ name: "old-skill", lastActivityAt: NOW - 20 * DAY })]);
    const counts = applyAutomaticTransitions(NOW);
    expect(counts.markedStale).toBe(1);
    expect(getRecord("old-skill")?.state).toBe("stale");
  });

  it("archives a long-idle skill past the archive window", () => {
    _seedUsageForTests([rec({ name: "ancient", state: "stale", lastActivityAt: NOW - 60 * DAY })]);
    const counts = applyAutomaticTransitions(NOW);
    expect(counts.archived).toBe(1);
    expect(getRecord("ancient")?.state).toBe("archived");
  });

  it("never touches a pinned skill", () => {
    _seedUsageForTests([rec({ name: "pinned-skill", pinned: true, lastActivityAt: NOW - 100 * DAY })]);
    const counts = applyAutomaticTransitions(NOW);
    expect(counts.markedStale).toBe(0);
    expect(counts.archived).toBe(0);
    expect(getRecord("pinned-skill")?.state).toBe("active");
  });

  it("leaves a recently-used skill active", () => {
    _seedUsageForTests([rec({ name: "fresh", lastActivityAt: NOW - 1 * DAY })]);
    const counts = applyAutomaticTransitions(NOW);
    expect(counts.markedStale).toBe(0);
    expect(getRecord("fresh")?.state).toBe("active");
  });

  it("ignores skills not created by the agent", () => {
    _seedUsageForTests([rec({ name: "bundled", createdByAgent: false, lastActivityAt: NOW - 100 * DAY })]);
    const counts = applyAutomaticTransitions(NOW);
    expect(counts.checked).toBe(0);
    expect(getRecord("bundled")?.state).toBe("active");
  });
});
