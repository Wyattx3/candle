---
name: systematic-debugging
description: A disciplined method to fix bugs - reproduce, isolate, hypothesize, instrument, bisect, fix, verify. No shotgun edits.
tags: debugging, methodology, troubleshooting, root-cause
---

# Systematic Debugging

Use this whenever something is broken and the cause is not obvious. The goal
is to find the root cause with evidence, not to guess. Resist the urge to
change five things at once.

## The loop

1. **Reproduce reliably.** Get a single command that triggers the bug every
   time. Run it in the sandbox so you control the environment.
   ```
   run_terminal: "cd /home/user/proj && <the failing command>"
   ```
   If it only fails sometimes, find the conditions that make it deterministic
   (fixed seed, fixed input file, single-threaded) before going further.

2. **Read the actual error.** Capture the full stack trace / stderr. Don't
   paraphrase it from memory.
   ```
   run_terminal: "<cmd> 2>&1 | tail -n 60"
   ```
   Note the file, line, and exception type. That is your first clue, not a
   nuisance to skip past.

3. **Isolate.** Shrink the failing case to the smallest input/code path that
   still fails. Comment out unrelated code, hardcode inputs, or write a tiny
   reproducer with `write_sandbox_file` and run it with `run_python` /
   `run_node`. A 10-line reproducer beats a 1000-line app.

4. **Form ONE hypothesis.** State it explicitly: "I think X is null because Y
   runs before Z." A hypothesis you can test is worth more than a fix you
   can't explain.

5. **Instrument to test the hypothesis.** Add targeted prints/logging right
   around the suspected line — values, types, branch taken. Use `patch` to
   insert temporary logging without rewriting the file.
   ```
   patch: add `print(f"DEBUG x={x!r} type={type(x)}")` before the failing line
   run_python / run_terminal: re-run, read the DEBUG output
   ```
   The output either confirms or kills the hypothesis. If killed, form a new
   one — do not start randomly editing.

6. **Bisect when the cause is hidden.** If a regression, use
   `run_terminal: "git bisect start / good / bad"` to find the breaking
   commit. For data/logic, binary-search the pipeline: log at the midpoint,
   then narrow to the half that's wrong.

7. **Fix the root cause, minimally.** Change the one thing your evidence
   points at. Apply with `patch` (small) or `write_sandbox_file` (large).
   Don't bundle unrelated cleanups into the fix.

8. **Verify.** Re-run the original reproducer from step 1 — it must now pass.
   Then run the surrounding test suite (`run_terminal: "pytest -q"` or
   `npm test`) to confirm you didn't break anything else.

9. **Remove instrumentation.** Strip the DEBUG prints with `patch` once fixed.

## Gotchas

- "It works on my machine" — environment differences. Pin versions, check
  `run_terminal: "python --version"` / `node --version` and env vars.
- The error line is often a symptom, not the cause. Trace backward to where
  the bad value originated.
- If two fixes in a row fail, stop. Your model of the system is wrong —
  re-read the relevant source with `read_sandbox_file` and rebuild it.

## Deliver

Report the root cause in one sentence, the exact change made, and the
verification output that proves it's fixed. If you produced a patched file the
user needs, return a `get_sandbox_file_url` link.
