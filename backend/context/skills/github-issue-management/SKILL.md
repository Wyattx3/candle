---
name: github-issue-management
description: List, create, triage, label, and comment on GitHub issues via gh or the REST API; confirm before any visible write.
tags: github, issues, triage, gh, collaboration
---

# GitHub Issue Management

Goal: read and organize GitHub issues, and create/label/comment when asked.
**Reads are safe and free**; creating, labeling, commenting, and closing are
**visible to others** — confirm with the user before any write.

## When to use

- "What issues are open on repo X?", "triage the bug backlog", "file an issue
  for this", "label these", "comment on #123", "close the stale ones".

## Auth (sandbox)

Via `run_terminal`: install `gh` with `install_packages`, then
`echo <token> | gh auth login --with-token` and confirm `gh auth status`.
Fallback: `http_request` to `https://api.github.com` with
`Authorization: Bearer <token>`. `clarify` for a token if none is available.

## Read / triage (no confirmation needed)

1. **List**: `run_terminal "gh issue list --repo <owner>/<repo> --state open --limit 50 --json number,title,labels,author,updatedAt"`.
2. **Filter** by label/assignee: add `--label bug --assignee @me`.
3. **View one**: `gh issue view <number> --repo <owner>/<repo> --comments`.
4. **Search**: `gh search issues "is:open label:bug repo:<owner>/<repo>"`.
5. Summarize for the user: group by label/age, flag duplicates, suggest
   priorities. Use `todo` if you're triaging a long list.

## Writes (CONFIRM FIRST — visible to others)

Before each of these, use `clarify` to show exactly what you'll post and to
which issue/repo, and get a yes.

- **Create**: write the body to `/tmp/issue.md` with `write_sandbox_file`, then
  `gh issue create --repo <o>/<r> --title "<title>" --body-file /tmp/issue.md --label bug`.
  A good issue: clear title, repro steps, expected vs actual, environment,
  acceptance criteria.
- **Comment**: `gh issue comment <number> --repo <o>/<r> --body "<text>"`.
- **Label**: `gh issue edit <number> --repo <o>/<r> --add-label triaged --remove-label needs-info`.
- **Assign / milestone**: `gh issue edit <number> --add-assignee <user> --milestone "<name>"`.
- **Close / reopen**: `gh issue close <number> --comment "<reason>"` /
  `gh issue reopen <number>`. Closing is visible — confirm and give a reason.

## http_request fallback (no gh)

- List: `GET /repos/<o>/<r>/issues?state=open`.
- Create: `POST /repos/<o>/<r>/issues` `{"title","body","labels":[...]}`.
- Comment: `POST /repos/<o>/<r>/issues/<n>/comments` `{"body"}`.
- Label/assign: `PATCH /repos/<o>/<r>/issues/<n>` `{"labels":[...],"assignees":[...],"state":"closed"}`.

## Gotchas

- PRs are also "issues" in the REST API — when listing via REST, filter out
  items with a `pull_request` field if you only want true issues. `gh issue
  list` already excludes PRs.
- Don't bulk-close or mass-relabel without explicit approval — that's a
  high-visibility, hard-to-undo action.
- Don't create duplicate issues; search first.
- Labels must already exist on the repo, or the edit fails — list them with
  `gh label list` if unsure.

## Deliver

For reads: a tidy summary (counts, groupings, recommended actions). For writes:
the issue number/URL and what you posted, plus confirmation the action ran.
