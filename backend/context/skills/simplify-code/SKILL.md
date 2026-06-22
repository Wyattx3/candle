---
name: simplify-code
description: Review code for needless complexity - dead code, premature abstraction, duplication - and simplify it with patch/write_sandbox_file.
tags: refactoring, simplify, cleanup, code-quality, duplication
---

# Simplify Code

Use when code works but is harder to read or maintain than it needs to be.
Simplification means removing complexity that earns nothing — not changing
behavior. Keep a test or run as a safety net so you can prove behavior is
unchanged.

## What to hunt for

1. **Dead code** — unused functions, variables, imports, unreachable branches,
   commented-out blocks. Find candidates:
   ```
   run_terminal: "cd /home/user/proj && rg -n 'def \\w+|function \\w+' src/"
   run_terminal: "rg -n 'TODO|FIXME|XXX' src/"
   install_packages: "vulture" (pip) then run_terminal: "vulture src/"   # python dead code
   ```
   For JS, run the project's linter (`run_terminal: "npx eslint ."`) — it flags
   unused vars/imports.

2. **Duplication** — the same logic copy-pasted. Extract a single function only
   when the duplicates are truly the same concept (not coincidentally similar).
   ```
   run_terminal: "rg -n '<repeated snippet>' src/"
   ```

3. **Premature abstraction** — a one-implementation interface, a factory that
   builds one type, config options nobody sets, deep inheritance for two cases.
   Inline it back to the concrete code. The simplest design that fits the
   current need beats a flexible one for needs that don't exist.

4. **Over-nesting** — deep if/else pyramids. Use early returns / guard clauses
   to flatten.

5. **Needless cleverness** — a dense one-liner that takes a minute to parse.
   Prefer the obvious version.

## Steps

1. **Establish the safety net.** Make sure tests pass first
   (`run_terminal: "pytest -q"` / `npm test`). If none exist, write a quick
   characterization test for the code you'll touch (see test-driven-development).
2. **Read the target** with `read_sandbox_file` to understand intent before
   cutting.
3. **Make ONE simplification at a time.** Apply small edits with `patch`,
   larger rewrites with `write_sandbox_file`.
4. **Re-run tests after each change.** Green = behavior preserved. Red = revert
   that change.
5. **Repeat** until the code is as simple as it can be without losing behavior.

## Gotchas

- Don't "simplify" by deleting code whose purpose you don't understand — first
  find its callers (`rg`). Apparent dead code may be a public API or
  dynamically referenced.
- Don't bundle behavior changes into a simplification PR. Keep it pure cleanup.
- Resist the opposite trap: don't add a new abstraction to "clean up"
  duplication that appears only twice and may diverge.
- Stop when it's simple enough. Endless gold-plating is its own complexity.

## Deliver

Report what you removed/collapsed and confirm tests still pass. If the user
wants the result, return a `get_sandbox_file_url` link to the simplified files.
