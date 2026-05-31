import { beforeEach, describe, expect, it } from "vitest";
import { ArtifactRegistry, FailureTracker } from "./registry";

describe("ArtifactRegistry — extractFromToolOutput", () => {
  let registry: ArtifactRegistry;

  beforeEach(() => {
    registry = new ArtifactRegistry();
  });

  it("extracts JSON outputs with url + path + filename", () => {
    const output = JSON.stringify({
      url: "https://sandbox.test/files/abc",
      path: "/home/user/report.pdf",
      filename: "report.pdf",
    });
    registry.extractFromToolOutput("create_artifact", output);

    const recent = registry.getRecentUrls();
    expect(recent.length).toBe(1);
    expect(recent[0].url).toBe("https://sandbox.test/files/abc");
    expect(recent[0].path).toBe("/home/user/report.pdf");
    expect(recent[0].name).toBe("report.pdf");
  });

  it("falls back to regex extraction for non-JSON outputs", () => {
    const output =
      'Created file "url": "https://download.test/foo" with "path": "/home/user/foo.txt"';
    registry.extractFromToolOutput("write_sandbox_file", output);

    const recent = registry.getRecentUrls();
    expect(recent.length).toBe(1);
    expect(recent[0].url).toBe("https://download.test/foo");
  });

  it("ignores tool output with no url or path", () => {
    registry.extractFromToolOutput("run_python", "print output: 42");
    expect(registry.getRecentUrls().length).toBe(0);
  });

  it("caps the registry at 50 entries", () => {
    for (let i = 0; i < 60; i += 1) {
      registry.extractFromToolOutput(
        "tool",
        JSON.stringify({ path: `/home/user/file${i}.txt` })
      );
    }
    const recent = registry.getRecentUrls(100);
    expect(recent.length).toBeLessThanOrEqual(50);
    // The latest entry should still be present.
    expect(recent[recent.length - 1].path).toBe("/home/user/file59.txt");
  });
});

describe("ArtifactRegistry — getSummary", () => {
  it("returns empty when no artifacts", () => {
    expect(new ArtifactRegistry().getSummary()).toBe("");
  });

  it("returns a numbered list of recent files", () => {
    const registry = new ArtifactRegistry();
    registry.record({
      toolName: "create_artifact",
      filename: "report.pdf",
      timestamp: Date.now(),
    });
    const summary = registry.getSummary();
    expect(summary).toContain("PRIOR SESSION ARTIFACTS");
    expect(summary).toContain("report.pdf");
  });
});

describe("FailureTracker", () => {
  it("returns null until the threshold", () => {
    const tracker = new FailureTracker();
    expect(tracker.recordFailure("search_web", "Error: 503")).toBeNull();
    expect(tracker.recordFailure("search_web", "Error: 503")).toBeNull();
  });

  it("emits a hint on the third identical failure", () => {
    const tracker = new FailureTracker();
    tracker.recordFailure("search_web", "Error: 503");
    tracker.recordFailure("search_web", "Error: 503");
    const hint = tracker.recordFailure("search_web", "Error: 503");
    expect(hint).not.toBeNull();
    expect(hint).toContain("search_web");
  });

  it("resets the counter on success", () => {
    const tracker = new FailureTracker();
    tracker.recordFailure("search_web", "Error");
    tracker.recordFailure("search_web", "Error");
    tracker.recordSuccess("search_web");
    // After a success the counter should be back to 1, no hint yet.
    expect(tracker.recordFailure("search_web", "Error")).toBeNull();
    expect(tracker.recordFailure("search_web", "Error")).toBeNull();
  });
});
