/**
 * Tests for the no-commit guard (anti-dribble) in invokeOnceWithTimeout.
 *
 * The slow-dribble runaway is the GAIA `timeout_0_tools` failure that DEFEATS the
 * reasoning cap: the model emits occasional content tokens (which reset the
 * reasoning clock) yet never commits to a tool call or a substantial answer,
 * burning the full run. The no-commit guard tracks wall-clock since stream start
 * and is satisfied ONLY by a real commitment, so dribble can't keep it alive.
 */
import { describe, it, expect } from "vitest";
import { AIMessageChunk } from "@langchain/core/messages";
import { contentToText } from "./helpers";

function fakeLLM(chunks: AIMessageChunk[], gapMs: number) {
  return {
    invoke: async () => {
      throw new Error("invoke should not be called when stream is available");
    },
    stream: async (_msgs: any[], options?: { signal?: AbortSignal }) => {
      async function* gen() {
        for (const c of chunks) {
          if (options?.signal?.aborted) {
            const e = new Error("aborted");
            e.name = "AbortError";
            throw e;
          }
          yield c;
          await new Promise<void>((resolve, reject) => {
            const t = setTimeout(resolve, gapMs);
            options?.signal?.addEventListener("abort", () => {
              clearTimeout(t);
              const e = new Error("aborted");
              e.name = "AbortError";
              reject(e);
            });
          });
        }
      }
      return gen();
    },
  };
}

// A tiny content fragment — a "dribble" chunk. Far below COMMIT_CONTENT_FLOOR.
const dribble = () => new AIMessageChunk({ content: "uh" });

describe("invokeOnceWithTimeout — no-commit guard", () => {
  it("aborts a slow-dribble runaway with NoCommitError", async () => {
    const { invokeOnceWithTimeout } = await import("./loop");
    // Dribble 2-char chunks every 3s, forever — the reasoning cap would be reset
    // by this content, but the no-commit guard tracks wall-clock since start and
    // never sees a real commitment. With a 10s commit deadline and 60s wall it
    // must fire on the deadline.
    const llm = fakeLLM([dribble(), dribble(), dribble(), dribble(), dribble(), dribble()], 3_000);
    const start = Date.now();
    await expect(
      invokeOnceWithTimeout(llm as any, [], undefined, 60_000, 0, 10_000)
    ).rejects.toMatchObject({ name: "NoCommitError" });
    expect(Date.now() - start).toBeLessThan(25_000);
  }, 40_000);

  it("does NOT fire when the turn commits to a tool call", async () => {
    const { invokeOnceWithTimeout } = await import("./loop");
    // A tool-call chunk is a real commitment even with no answer text.
    const toolChunk = new AIMessageChunk({
      content: "",
      tool_call_chunks: [{ name: "search_web", args: '{"q":"x"}', id: "1", index: 0 }],
    });
    const llm = fakeLLM([dribble(), toolChunk, dribble()], 2_000);
    const res = await invokeOnceWithTimeout(llm as any, [], undefined, 60_000, 0, 5_000);
    expect(res.tool_call_chunks?.length ?? res.tool_calls?.length).toBeGreaterThan(0);
  }, 30_000);

  it("does NOT fire when the turn commits to a substantial answer", async () => {
    const { invokeOnceWithTimeout } = await import("./loop");
    // A single chunk past the content floor (400 chars) is a real commitment.
    const big = new AIMessageChunk({ content: "x".repeat(450) });
    const llm = fakeLLM([big], 1_000);
    const res = await invokeOnceWithTimeout(llm as any, [], undefined, 60_000, 0, 5_000);
    expect(contentToText(res.content).length).toBeGreaterThanOrEqual(400);
  }, 20_000);

  it("does NOT fire when commitDeadlineMs is 0 (disabled)", async () => {
    const { invokeOnceWithTimeout } = await import("./loop");
    const llm = fakeLLM([dribble(), dribble(), new AIMessageChunk({ content: "done" })], 1_000);
    const res = await invokeOnceWithTimeout(llm as any, [], undefined, 60_000, 0, 0);
    expect(contentToText(res.content)).toContain("done");
  }, 20_000);
});
