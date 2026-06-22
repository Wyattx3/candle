---
name: github-code-review
description: Review a PR's diff with gh, produce structured comments (correctness/tests/security/style), confirm before posting the review.
tags: github, code-review, pull-request, gh, security
---

# GitHub Code Review

Goal: read a pull request's diff, assess it across correctness, tests,
security, and style, and (only after confirmation) post a structured review.
Posting a review is **visible to the author and team** — confirm first.

## When to use

- "Review PR #123", "look at this pull request", "is this change safe to
  merge?".

## Auth (sandbox)

`run_terminal` + `install_packages` for `gh`, then
`echo <token> | gh auth login --with-token`; verify `gh auth status`.
Fallback: `http_request` against `api.github.com`.

## Steps

1. **Get context.**
   `run_terminal "gh pr view <n> --repo <o>/<r> --json title,body,author,additions,deletions,changedFiles,baseRefName,headRefName"`.
   Read the description to understand intent.

2. **Read the diff.**
   `run_terminal "gh pr diff <n> --repo <o>/<r>"`. For large diffs, save it to a
   file (`gh pr diff <n> > /tmp/pr.diff`) and read with `read_sandbox_file`, or
   check out the branch locally (`gh pr checkout <n>`) and inspect files
   directly to understand surrounding context — a diff alone hides callers.

3. **Optionally run checks.** If you checked out the branch, run the project's
   linters/tests via `run_terminal` (or `run_node`/`run_python`) to verify the
   change actually builds and passes. Note what you ran and the result.

4. **Assess across four axes.** For each finding, cite `file:line` and explain:
   - **Correctness**: logic bugs, off-by-one, null/undefined, edge cases,
     error handling, race conditions, broken API contracts.
   - **Tests**: are new paths covered? Do existing tests still hold? Missing
     cases?
   - **Security**: injection, unvalidated input, secrets in code, authz gaps,
     unsafe deserialization, dependency risks. Flag anything network-exposed
     without auth.
   - **Style/maintainability**: naming, duplication, dead code, adherence to
     project conventions. Keep these lowest-priority.

5. **Draft the review.** Structure it: a short **Summary** verdict
   (approve / comment / request changes + why), then **Blocking** issues, then
   **Non-blocking** suggestions, then **Nits**. Be specific and kind.

6. **CONFIRM BEFORE POSTING.** Use `clarify` to show the drafted review and the
   intended verdict, and get a yes. Then post:
   - Write the body to `/tmp/review.md` with `write_sandbox_file`.
   - General review:
     `gh pr review <n> --repo <o>/<r> --comment --body-file /tmp/review.md`
     (use `--approve` or `--request-changes` only with explicit user approval —
     these are strong, visible signals).

7. **Inline comments (optional).** Via REST:
   `POST /repos/<o>/<r>/pulls/<n>/comments`
   `{"body","commit_id","path","line","side":"RIGHT"}`.

## Merging

Do **not** merge as part of a review. Merging is a separate, explicit,
high-impact action — never merge without the user's clear approval, and never
override branch protection.

## Gotchas

- A diff without surrounding code is misleading; check callers before claiming
  a bug. State when you reviewed diff-only vs full-context.
- Don't dump the whole diff back to the user — synthesize findings.
- Distinguish blocking issues from nits so the author knows what matters.
- If you couldn't run tests, say so rather than implying you verified behavior.

## Deliver

Return the structured review text and, if posted, the review URL/verdict.
