import { describe, expect, it } from "vitest";
import { isDegenerateText } from "./degeneration";

describe("isDegenerateText", () => {
  it("ignores short text", () => {
    expect(isDegenerateText("The answer is 3.")).toBe(false);
  });

  it("ignores normal long prose", () => {
    const prose =
      "The marathon world record pace is about 5.8 meters per second. " +
      "Covering the Earth-Moon distance at that speed takes roughly seventeen " +
      "thousand hours. The calculation uses the minimum perigee distance from " +
      "the Wikipedia Moon page and Kipchoge's official record time. After " +
      "converting units and rounding to the nearest thousand hours, the result " +
      "is seventeen. This involves several intermediate steps but each is " +
      "straightforward arithmetic over well-documented physical constants.";
    expect(isDegenerateText(prose)).toBe(false);
  });

  it("detects a short repeated phrase collapse", () => {
    // The "Let me research...Let me need" GLM collapse (GAIA 3f57289b).
    const garbage = "Let me research the user's need to look up the ".repeat(40);
    expect(isDegenerateText(garbage)).toBe(true);
  });

  it("detects a character-cycle collapse", () => {
    // The "0:0|0>0|0)2)" GLM collapse (GAIA 8e867cd7).
    const garbage = "0:0|0>0|0)2) | ".repeat(60);
    expect(isDegenerateText(garbage)).toBe(true);
  });

  it("detects a repeated URL fragment collapse", () => {
    const garbage = 'search for web: "https://www.en.wikipedia: '.repeat(40);
    expect(isDegenerateText(garbage)).toBe(true);
  });

  it("does not flag a legitimately repetitive but diverse list", () => {
    const list = Array.from({ length: 50 }, (_, i) => `Item ${i}: value-${i * 7} description ${i}`).join("\n");
    expect(isDegenerateText(list)).toBe(false);
  });
});
