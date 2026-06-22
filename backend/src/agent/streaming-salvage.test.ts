/**
 * Tests for the streaming + partial-output-salvage path ported from
 * OpenCode/Hermes. The point of the port: a per-call TIMEOUT must SALVAGE
 * whatever the model already streamed instead of discarding it (the root cause
 * of the GAIA "0 tools, 300s, empty answer" rumination spiral).
 *
 * We exercise the exported helpers + invokeOnceWithTimeout with fake LLMs whose
 * `stream()` yields chunks then hangs, so no real network/model is touched.
 */
import { describe, it, expect } from "vitest";
import { AIMessageChunk } from "@langchain/core/messages";
import {
  hasUsableContent,
  dropIncompleteToolCall,
  invokeOnceWithTimeout,
} from "./loop";

/** A fake LLM that yields the given chunks then (optionally) hangs forever. */
function fakeStreamingLLM(chunks: AIMessageChunk[], hangAfter: boolean) {
  return {
    invoke: async () => {
      throw new Error("invoke should not be called when stream is available");
    },
    stream: async (_msgs: any[], options?: { signal?: AbortSignal }) => {
      async function* gen() {
        for (const c of chunks) {
          yield c;
        }
        if (hangAfter) {
          // Block until the per-call AbortController fires, then throw an
          // abort-style error like the real SDK does. Handle the
          // already-aborted case too (a run-level abort may fire BEFORE the
          // generator reaches this point — addEventListener won't fire for an
          // already-aborted signal, so check synchronously first).
          await new Promise<void>((_resolve, reject) => {
            const onAbort = () => {
              const e = new Error("aborted");
              e.name = "AbortError";
              reject(e);
            };
            if (options?.signal?.aborted) {
              onAbort();
              return;
            }
            options?.signal?.addEventListener("abort", onAbort);
          });
        }
      }
      return gen();
    },
  };
}

describe("hasUsableContent", () => {
  it("is true for visible text", () => {
    expect(hasUsableContent(new AIMessageChunk({ content: "hello" }))).toBe(true);
  });
  it("is true for a completed tool call with no text", () => {
    const msg: any = new AIMessageChunk({ content: "" });
    msg.tool_calls = [{ name: "run_python", args: { code: "1+1" }, id: "a" }];
    expect(hasUsableContent(msg)).toBe(true);
  });
  it("is false for empty content and no tool calls", () => {
    expect(hasUsableContent(new AIMessageChunk({ content: "   " }))).toBe(false);
  });
  it("is false for nullish input", () => {
    expect(hasUsableContent(undefined)).toBe(false);
  });
});

describe("dropIncompleteToolCall", () => {
  it("keeps complete calls and drops a dangling one", () => {
    const msg: any = new AIMessageChunk({ content: "" });
    msg.tool_calls = [
      { name: "run_python", args: { code: "1" }, id: "a" },
      { name: "", args: undefined, id: "b" }, // incomplete
    ];
    const out = dropIncompleteToolCall(msg);
    expect(out.tool_calls).toHaveLength(1);
    expect(out.tool_calls[0].name).toBe("run_python");
  });
  it("returns the message unchanged when all calls are complete", () => {
    const msg: any = new AIMessageChunk({ content: "" });
    msg.tool_calls = [{ name: "search_web", args: { query: "x" }, id: "a" }];
    expect(dropIncompleteToolCall(msg)).toBe(msg);
  });
  it("is a no-op when there are no tool calls", () => {
    const msg: any = new AIMessageChunk({ content: "hi" });
    expect(dropIncompleteToolCall(msg)).toBe(msg);
  });
});

describe("invokeOnceWithTimeout — streaming salvage", () => {
  it("returns the full message when the stream completes in time", async () => {
    const llm = fakeStreamingLLM(
      [new AIMessageChunk({ content: "the answer is " }), new AIMessageChunk({ content: "42" })],
      false
    );
    const res = await invokeOnceWithTimeout(llm as any, [], undefined, 1000);
    expect(res.content).toBe("the answer is 42");
  });

  it("salvages partial text when the generation times out", async () => {
    const llm = fakeStreamingLLM(
      [new AIMessageChunk({ content: "partial reasoning so far" })],
      true // hang after the first chunk
    );
    const res = await invokeOnceWithTimeout(llm as any, [], undefined, 80);
    expect(res.content).toBe("partial reasoning so far");
  });

  it("throws a retryable TimeoutError when nothing usable was produced", async () => {
    const llm = fakeStreamingLLM([], true); // hang immediately, no chunks
    await expect(invokeOnceWithTimeout(llm as any, [], undefined, 80)).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });

  it("propagates a run-level abort as a real cancel (not a salvage)", async () => {
    const runController = new AbortController();
    const llm = fakeStreamingLLM([new AIMessageChunk({ content: "x" })], true);
    const p = invokeOnceWithTimeout(llm as any, [], runController.signal, 5000);
    runController.abort();
    // A run-level abort surfaces as the abort error, never a salvaged value.
    await expect(p).rejects.toThrow();
  });
});
