import { describe, expect, it } from "vitest";
import { validateConsolidationPlan } from "./curator";

const eligible = new Set(["pdf-merge", "combine-pdfs", "pdf-stitch", "video-dl", "pinned-one"]);
const pinned = new Set(["pinned-one"]);

describe("curator — validateConsolidationPlan", () => {
  it("accepts a merge into an existing skill without requiring a body", () => {
    const plan = validateConsolidationPlan(
      { merges: [{ into: "pdf-merge", absorb: ["combine-pdfs", "pdf-stitch"] }] },
      eligible,
      pinned
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].into).toBe("pdf-merge");
    expect(plan[0].absorb.sort()).toEqual(["combine-pdfs", "pdf-stitch"]);
  });

  it("requires description+body when the umbrella is a NEW skill", () => {
    const noBody = validateConsolidationPlan(
      { merges: [{ into: "pdf-tools", absorb: ["pdf-merge", "combine-pdfs"] }] },
      eligible,
      pinned
    );
    expect(noBody).toHaveLength(0);

    const withBody = validateConsolidationPlan(
      { merges: [{ into: "pdf-tools", absorb: ["pdf-merge", "combine-pdfs"], description: "All PDF ops", body: "# steps" }] },
      eligible,
      pinned
    );
    expect(withBody).toHaveLength(1);
  });

  it("never merges INTO a pinned skill", () => {
    const plan = validateConsolidationPlan(
      { merges: [{ into: "pinned-one", absorb: ["pdf-merge"] }] },
      eligible,
      pinned
    );
    expect(plan).toHaveLength(0);
  });

  it("drops absorb entries that are pinned or non-existent", () => {
    const plan = validateConsolidationPlan(
      { merges: [{ into: "pdf-merge", absorb: ["combine-pdfs", "pinned-one", "does-not-exist"] }] },
      eligible,
      pinned
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].absorb).toEqual(["combine-pdfs"]);
  });

  it("drops a merge whose absorb list resolves to empty", () => {
    const plan = validateConsolidationPlan(
      { merges: [{ into: "pdf-merge", absorb: ["pinned-one", "ghost"] }] },
      eligible,
      pinned
    );
    expect(plan).toHaveLength(0);
  });

  it("never lets a skill be claimed by two merges", () => {
    const plan = validateConsolidationPlan(
      {
        merges: [
          { into: "pdf-merge", absorb: ["combine-pdfs"] },
          { into: "pdf-stitch", absorb: ["combine-pdfs"] },
        ],
      },
      eligible,
      pinned
    );
    // combine-pdfs is claimed by the first merge; the second loses it and,
    // with no other valid absorb, is dropped.
    expect(plan).toHaveLength(1);
    expect(plan[0].into).toBe("pdf-merge");
  });

  it("ignores absorb entries equal to the umbrella itself", () => {
    const plan = validateConsolidationPlan(
      { merges: [{ into: "pdf-merge", absorb: ["pdf-merge", "combine-pdfs"] }] },
      eligible,
      pinned
    );
    expect(plan[0].absorb).toEqual(["combine-pdfs"]);
  });

  it("returns [] for malformed or empty input", () => {
    expect(validateConsolidationPlan(null, eligible, pinned)).toEqual([]);
    expect(validateConsolidationPlan({}, eligible, pinned)).toEqual([]);
    expect(validateConsolidationPlan({ merges: [] }, eligible, pinned)).toEqual([]);
    expect(validateConsolidationPlan({ merges: "nope" }, eligible, pinned)).toEqual([]);
  });
});
