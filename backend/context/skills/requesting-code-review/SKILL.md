---
name: requesting-code-review
description: Self-review a diff before declaring done - correctness, edge cases, security, tests - and produce a reviewer-style summary.
tags: code-review, quality, self-review, security, diff
---

# Requesting Code Review (Self-Review)

Before you tell the user a change is done, review it as a skeptical reviewer
would. Catching issues now is cheaper than after they ship. This produces a
reviewer-style summary you can hand back.

## Steps

### 1. Get the diff in front of you

```
run_terminal: "cd /home/user/proj && git diff"            # unstaged
run_terminal: "git diff --staged"                          # staged
run_terminal: "git diff main...HEAD"                       # whole branch
```
If not a git repo, re-read the changed files with `read_sandbox_file`. Review
the actual diff, not your memory of what you intended to write.

### 2. Walk the checklist

**Correctness**
- Does it do what was asked? Re-read the requirement, compare to the code.
- Off-by-one, wrong operator, inverted condition, wrong variable.
- Are returned/awaited values actually used? Any unhandled promise/async?

**Edge cases**
- Empty input, null/None, zero, negative, very large, unicode.
- Boundary conditions on loops and slices.
- Error paths: what happens when a call fails, a file is missing, the network
  is down?

**Security**
- User input flowing into SQL, shell, file paths, HTML → injection risk. Use
  parameterized queries / escaping. (`rg -n 'exec\\(|eval\\(|os.system|subprocess' src/`)
- Secrets hardcoded? (`rg -ni 'api_key|password|secret|token' src/`)
- Authn/authz on any new endpoint? Flag if a network-exposed route lacks it.

**Tests**
- Is the new behavior covered by a test? Run them:
  `run_terminal: "pytest -q"` / `npm test`.
- Do the tests actually assert behavior (not just "it ran")?

**Style/clarity**
- Consistent with the surrounding code? Clear names? Dead code left behind?
- Run the linter: `run_terminal: "npx eslint ." ` / `ruff check .` /
  `npm run lint`.

### 3. Fix what you find

Apply fixes with `patch` / `write_sandbox_file`, then re-run tests and linter.
Don't write up a review with known issues left unfixed unless they're out of
scope — and if so, call them out explicitly.

### 4. Write the reviewer summary

Produce a short structured summary:
- **What changed** (1-3 bullets).
- **Verified**: tests run + result, linter result, manual checks done.
- **Risks / out of scope**: anything not covered, follow-ups, assumptions.

## Gotchas

- Review the diff, not the whole file — but read enough surrounding context to
  judge correctness.
- Don't rubber-stamp your own work. Actively try to break it.
- A clean lint run is not proof of correctness; the tests and edge-case pass
  matter more.

## Deliver

Return the reviewer summary plus verification output. If files changed, offer a
`get_sandbox_file_url` link.
