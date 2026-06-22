---
name: github-pr-workflow
description: Branch, commit, push, and open a GitHub PR with gh in the sandbox; write a clean title/body; confirm before push/open.
tags: github, git, pull-request, gh, collaboration
---

# GitHub Pull Request Workflow

Goal: take local changes in the sandbox, put them on a branch, push, and open
a pull request with a good title and description. Pushing and opening a PR are
**visible to other people** — always confirm with the user before those steps.

## When to use

- The user asks you to "open a PR", "raise a pull request", or "push these
  changes for review".
- You've made code changes in the sandbox and the next step is review/merge.

## Prerequisites — auth in the sandbox

Everything runs through `run_terminal`. Install tooling once:

1. `install_packages` for `git` and `gh` (apt) if not present.
2. The user must supply a token. Either:
   - export it: `run_terminal "export GITHUB_TOKEN=<token>"` and let `gh` pick
     it up, or
   - `run_terminal "echo <token> | gh auth login --with-token"` (non-interactive).
3. Verify: `run_terminal "gh auth status"`. If `gh` is unavailable, fall back
   to `http_request` against `https://api.github.com` with an
   `Authorization: Bearer <token>` header.

If no token is available, `clarify` to ask the user for one before proceeding.

## Steps

1. **Confirm working tree state.**
   `run_terminal "cd <repo> && git status --short && git branch --show-current"`.
   If changes belong to someone else's branch or main, stop and ask.

2. **Create a branch** off the base (usually `main`/`master`):
   `run_terminal "cd <repo> && git checkout -b <type>/<short-slug>"`
   (e.g. `fix/login-redirect`, `feat/csv-export`).

3. **Stage deliberately.** Prefer specific paths over `git add -A`:
   `run_terminal "cd <repo> && git add path/one path/two"`.
   Review with `git diff --staged` so you don't commit secrets or junk.

4. **Commit** with a clear message (imperative subject < 70 chars, blank line,
   why-focused body):
   ```
   git commit -m "Fix login redirect loop" -m "Guard against null next-url so SSO callbacks land on the dashboard."
   ```

5. **CONFIRM BEFORE PUSH.** Push makes the branch public on the remote.
   Use `clarify` to show the branch name and a one-line summary and get a yes.
   Never `--force` push without explicit approval. Then:
   `run_terminal "cd <repo> && git push -u origin <branch>"`.

6. **Draft the PR title/body.**
   - Title: concise, imperative, < 70 chars.
   - Body sections: **Summary** (what & why, bullets), **Changes** (key files),
     **Testing** (what you ran / what's untested), **Notes** (follow-ups, risks).

7. **CONFIRM BEFORE OPENING.** Opening a PR notifies reviewers. Show the
   drafted title + body via `clarify` and get a yes. Then create it:
   ```
   gh pr create --base main --head <branch> \
     --title "Fix login redirect loop" \
     --body-file /tmp/pr-body.md
   ```
   Write the body with `write_sandbox_file` to `/tmp/pr-body.md` first so
   multi-line markdown is preserved. `--draft` if the user wants a draft.

8. **Report back** the PR URL from the `gh pr create` output. Optionally
   `gh pr view --json number,url,state`.

## http_request fallback (no gh)

Create the PR via REST:
`POST https://api.github.com/repos/<owner>/<repo>/pulls` with body
`{"title","head","base","body"}` and the auth header. You still must `git push`
the branch first (steps 1-5).

## Gotchas

- Don't open a PR before the branch is pushed — `gh` will error.
- Don't merge — that's a separate explicit ask (see github-repo-management /
  github-code-review). Never merge without approval.
- If `git push` is rejected (non-fast-forward), do NOT force-push; pull/rebase
  and ask the user if history rewrite is involved.
- Verify the diff is what you think before committing: `git diff --staged`.
- Keep secrets out of commits — scan staged files for tokens/keys first.

## Deliver

Reply with the PR URL, its number, and a one-line summary of what it changes.
