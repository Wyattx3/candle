import { describe, expect, it } from "vitest";
import { RunContext } from "./run-context";

function sig(ctx: RunContext, toolName: string, code: string) {
  return ctx.getModelOutputSignature({ tool_calls: [{ name: toolName, args: { code } }] });
}

describe("RunContext.getModelOutputSignature", () => {
  it("produces DIFFERENT signatures for code that differs only deep in the string", () => {
    const ctx = new RunContext("make a pdf", 0);
    // Both scripts share the same first 80 chars; they differ only later.
    const head = "from fpdf import FPDF\n\nclass PDF(FPDF):\n    def header(self):\n        self.set_font('X')\n";
    const a = sig(ctx, "run_python", head + "pdf.add_font('DejaVu', uni=True)\n");
    const b = sig(ctx, "run_python", head + "pdf.add_font('Unifont')\n");
    expect(a).not.toBe(b);
  });

  it("produces the SAME signature for identical calls", () => {
    const ctx = new RunContext("make a pdf", 0);
    const code = "print('hello world this is a fairly long script body')";
    expect(sig(ctx, "run_python", code)).toBe(sig(ctx, "run_python", code));
  });
});

describe("RunContext.detectLoop", () => {
  it("does NOT flag two genuinely different code edits as a loop", () => {
    const ctx = new RunContext("make a pdf", 0);
    const head = "x".repeat(200);
    const s1 = sig(ctx, "run_python", head + "version A");
    const s2 = sig(ctx, "run_python", head + "version B totally different tail content here");
    expect(ctx.detectLoop(s1)).toBe("ok");
    expect(ctx.detectLoop(s2)).toBe("ok");
  });

  it("flags repeated identical calls", () => {
    const ctx = new RunContext("loop", 0);
    const s = sig(ctx, "search_web", "same query");
    expect(ctx.detectLoop(s)).toBe("ok");
    expect(ctx.detectLoop(s)).toBe("nudge");
    expect(ctx.detectLoop(s)).toBe("stop");
  });
});
