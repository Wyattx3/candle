/**
 * Tests for the reasoning cap (anti-rumination) in invokeOnceWithTimeout.
 *
 * The GAIA `timeout_0_tools` failure was the model getting stuck in ONE long
 * reasoning-only generation that never committed to a tool call or answer, until
 * the run-level timeout fired and returned garbage. The reasoning cap aborts such
 * a turn with a `ReasoningCapError` so the loop can force a commit. A turn that
 * emits real output (content or tool-call args) — even after a long think — must
 * NOT be capped.
 */
import { describe, it, expect } from "vitest";
import { AIMessageChunk } from "@langchain/core/messages";
import { contentToText } from "./helpers";

/**
 * Fake LLM that emits a configurable sequence of chunks spaced `gapMs` apart.
 * Honors abort by throwing AbortError so the cap watchdog can stop it.
 */
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

const reasoning = () =>
  new AIMessageChunk({ content: "", additional_kwargs: { reasoning_content: "thinking..." } });

describe("invokeOnceWithTimeout — reasoning cap", () => {
  it("aborts a reasoning-only runaway with ReasoningCapError", async () => {
    const { invokeOnceWithTimeout } = await import("./loop");
    // Stream ONLY reasoning chunks, spaced 3s apart, forever — never any content
    // or tool-call args. With a 10s cap and a 60s wall-clock, the cap must fire.
    const llm = fakeLLM([reasoning(), reasoning(), reasoning(), reasoning(), reasoning(), reasoning()], 3_000);
    const start = Date.now();
    await expect(
      invokeOnceWithTimeout(llm as any, [], undefined, 60_000, 10_000)
    ).rejects.toMatchObject({ name: "ReasoningCapError" });
    const elapsed = Date.now() - start;
    // Fired on the ~10s cap, well before the 60s wall-clock.
    expect(elapsed).toBeLessThan(25_000);
  }, 40_000);

  it("does NOT cap a turn that commits to content after a long think", async () => {
    const { invokeOnceWithTimeout } = await import("./loop");
    // Reason for ~9s (3 chunks × 3s, under the 10s cap), THEN emit real content.
    // The real-output chunk resets the clock, so the turn must finish normally.
    const llm = fakeLLM(
      [reasoning(), reasoning(), reasoning(), new AIMessageChunk({ content: "the answer is 42" })],
      3_000
    );
    const res = await invokeOnceWithTimeout(llm as any, [], undefined, 60_000, 10_000);
    expect(contentToText(res.content)).toContain("the answer is 42");
  }, 40_000);

  it("does NOT cap when reasoningCapMs is 0 (cap disabled)", async () => {
    const { invokeOnceWithTimeout } = await import("./loop");
    // Reasoning-only but cap disabled — runs to completion (used by the forced
    // commit call itself, which must be allowed to finish).
    const llm = fakeLLM([reasoning(), reasoning(), new AIMessageChunk({ content: "done" })], 1_000);
    const res = await invokeOnceWithTimeout(llm as any, [], undefined, 60_000, 0);
    expect(contentToText(res.content)).toContain("done");
  }, 30_000);
});
