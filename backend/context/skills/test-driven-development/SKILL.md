---
name: test-driven-development
description: Red-green-refactor - write a failing test first, then write code to pass it, run tests in the sandbox each step.
tags: testing, tdd, pytest, jest, red-green-refactor
---

# Test-Driven Development

Use when adding a new function/feature or fixing a bug where you can express
the expected behavior as a test. Writing the test first forces you to define
"done" before you write code, and gives you a regression guard for free.

## The cycle

### 1. RED — write a failing test first

Decide the smallest unit of behavior. Write a test that asserts it, before any
implementation exists.

Python (pytest):
```
write_sandbox_file: /home/user/proj/test_slugify.py
---
from slugify import slugify
def test_lowercases_and_dashes():
    assert slugify("Hello World") == "hello-world"
def test_strips_punctuation():
    assert slugify("A, B & C!") == "a-b-c"
```
Node (jest/vitest):
```
write_sandbox_file: /home/user/proj/slugify.test.js
---
const { slugify } = require("./slugify");
test("lowercases and dashes", () => {
  expect(slugify("Hello World")).toBe("hello-world");
});
```

Run it and confirm it fails for the RIGHT reason (not an import error you
forgot — though a missing module failing is acceptable as the first red):
```
run_terminal: "cd /home/user/proj && pytest -q"      # or: npm test / npx vitest run
```
If the test passes immediately, the test is wrong or the behavior already
exists. Fix the test before proceeding.

### 2. GREEN — write the minimum code to pass

Implement just enough to make the test pass. No extra features, no
speculative options.
```
write_sandbox_file: /home/user/proj/slugify.py   (or slugify.js)
run_terminal: "cd /home/user/proj && pytest -q"   # must go green
```
If red, read the failure, adjust, re-run. Don't move on until green.

### 3. REFACTOR — clean up with the test as a safety net

Now improve names, remove duplication, simplify — re-running the test after
each change. Use `patch` for small edits. The test staying green is your proof
the refactor was safe.

### Repeat

Add the next behavior as a new failing test (edge cases: empty string, unicode,
None/null input) and loop again. Build the feature one green test at a time.

## Setup

- No framework installed? `install_packages: pytest` (pip) or
  `install_packages: vitest` / `jest` (npm). Init npm with
  `run_terminal: "npm init -y"` if needed.
- Run a single test while iterating: `pytest path::test_name -q` or
  `npx vitest run -t "name"`.

## Gotchas

- Test behavior, not implementation. Assert outputs and effects, not internal
  call order.
- One concept per test — a failure should point to one cause.
- For bug fixes: first write a test that reproduces the bug (RED), then fix
  (GREEN). That test now prevents regressions forever.

## Deliver

Report the final passing test run output and the implemented file. If the user
wants the code, return a `get_sandbox_file_url` link to the source and tests.
