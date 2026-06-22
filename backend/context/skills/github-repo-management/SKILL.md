---
name: github-repo-management
description: Clone, inspect, and manage a repo's branches/releases/settings via gh; read-only by default, confirm before destructive or visible changes.
tags: github, repo, branches, releases, gh
---

# GitHub Repository Management

Goal: clone and explore a repository, and manage its branches, releases, and
settings when asked. **Default to read-only.** Anything that changes the remote
(delete branch, publish release, change settings, change visibility) is
**visible and often hard to undo** — confirm with the user first.

## When to use

- "Clone repo X and look around", "what branches exist", "cut a release",
  "what's the default branch", "set up / inspect repo settings".

## Auth (sandbox)

`run_terminal` + `install_packages` for `git`/`gh`, then
`echo <token> | gh auth login --with-token`; verify `gh auth status`.
Clone over HTTPS with the token if `gh` isn't set up:
`git clone https://<token>@github.com/<owner>/<repo>.git`. Fallback to
`http_request` against `api.github.com`.

## Clone & inspect (safe)

1. `run_terminal "gh repo clone <owner>/<repo> /home/user/<repo>"` (or `git clone`).
2. Overview: `gh repo view <owner>/<repo> --json name,description,defaultBranchRef,visibility,licenseInfo,stargazerCount`.
3. Structure: `list_sandbox_files` on the clone; read key files
   (`README`, `package.json`, CI config) with `read_sandbox_file`.
4. Branches: `run_terminal "cd <repo> && git branch -a"` or
   `gh api repos/<o>/<r>/branches --jq '.[].name'`.
5. History: `git log --oneline -20`, `git shortlog -sn` for top contributors.
6. Releases/tags: `gh release list --repo <o>/<r>`, `git tag --sort=-creatordate`.

## Branch operations

- **Create** (local): `git checkout -b <name>`. Pushing is visible — confirm.
- **Delete remote branch** (visible, hard to undo): CONFIRM via `clarify`, then
  `git push origin --delete <name>` or `gh api -X DELETE repos/<o>/<r>/git/refs/heads/<name>`.
  Never delete `main`/`master`/`default`.

## Releases (visible — CONFIRM)

1. Decide the tag (semver) and target commit/branch.
2. Draft notes; write to `/tmp/notes.md` with `write_sandbox_file`.
3. Confirm via `clarify`, then:
   `gh release create v1.2.0 --repo <o>/<r> --title "v1.2.0" --notes-file /tmp/notes.md`.
   Add `--draft` for a draft, `--prerelease` for RC. Attach assets with
   trailing file paths if needed.

## Settings (visible/sensitive — CONFIRM, treat as high-risk)

- View: `gh repo view --json ...` or `gh api repos/<o>/<r>`.
- Changing description/topics: `gh repo edit <o>/<r> --description "..." --add-topic x`.
- **Visibility, branch protection, collaborator access, deletion** are
  high-impact. Explain the risk, confirm explicitly, and never change
  visibility or delete a repo without a clear yes. `gh repo delete` is
  effectively irreversible — refuse unless the user is unambiguous.

## http_request fallback

`GET /repos/<o>/<r>`, `GET /repos/<o>/<r>/branches`, `GET /repos/<o>/<r>/releases`,
`POST /repos/<o>/<r>/releases`, `PATCH /repos/<o>/<r>` for settings,
`DELETE /repos/<o>/<r>/git/refs/heads/<branch>`.

## Gotchas

- Clone into a writable path like `/home/user/<repo>`; verify with
  `run_terminal "ls -la /home/user/<repo>"`.
- A token without the right scopes will silently fail writes — check
  `gh auth status` scopes.
- Don't run destructive git (`reset --hard`, `clean -f`, force-push) on a repo
  without approval.

## Deliver

For inspection: a structured summary (purpose, structure, branches, latest
release, contributors). For changes: confirmation the action ran plus the
resulting tag/URL.
