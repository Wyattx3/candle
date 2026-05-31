---
name: command-approval-workflow
description: How to behave when side-effecting tools trigger the user-approval gate and what auto-rejection means.
tags: terminal, http, approval, security, permissions
---

# Command Approval Workflow

Several side-effecting tools are gated by an approval policy. You don't choose
whether to ask — the backend classifies each action and either runs it,
prompts the user, or rejects it outright. Your job is to write commands and
requests that minimize friction.

## Tools currently gated

| Tool                       | When prompted                                                  |
| -------------------------- | -------------------------------------------------------------- |
| `run_terminal`             | Anything outside the read-only allow-list (cat, ls, pwd, etc.) |
| `manage_sandbox_files`     | Only `delete` and `move` actions — copy / mkdir / zip skip.    |
| `install_packages`         | `apt` only. `pip` and `npm` install into project dirs and skip. |
| `http_request`             | Methods that mutate state (`POST`, `PUT`, `PATCH`, `DELETE`). GET / HEAD skip. |

`run_python`, `run_node`, file reads/writes inside the sandbox, and read-only
web tools (`browse_web`, `search_web`) never go through the gate.

## Risk classes

| Class    | Examples                                                      | Behavior                                                      |
| -------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| `low`    | `ls`, `cat`, `pwd`, `ffprobe`, `head`, `find ... -name ...`   | Runs immediately. No prompt.                                  |
| `medium` | `pip install` (apt only), `mkdir -p`, `yt-dlp ...`, `http_request POST ...`, `manage_sandbox_files delete ...` | Prompts the user with allow_once / allow_always / reject.     |
| `high`   | `rm -rf /`, `mkfs`, `dd of=/dev/sda`, `curl ... | bash`       | Auto-rejected. No prompt.                                     |

If the user picked **allow_always** earlier in the conversation for a
specific command string, the same exact command runs without prompting
again. This cache is per-connection only and never persists.

## Tool result shape after a rejection

When the gate rejects (auto or user), the tool returns a string starting with
`Refused:` followed by the reason. When you see this, **do not retry the
same action**. Either:

1. Pick a safer alternative that the classifier accepts as `low` (e.g.
   replace `cat secrets | base64` with two separate steps using
   `read_sandbox_file`).
2. Switch tool — `run_python` is often a cleaner path for file work.
3. Tell the user what you wanted to do and let them decide.

## Best practices

- **Prefer one-purpose commands.** `ls /home/user/downloads` is `low`.
  `ls /home/user/downloads && rm /tmp/x` becomes `medium`.
- **No piping into shells.** `curl … | bash` is auto-rejected. Download
  the script first, inspect it, then run with `bash script.sh` (which
  itself becomes a `medium` prompt).
- **Don't probe the gate.** Don't issue empty or near-no-op commands to
  test what it allows. The classification rules are stable.
- **Don't ask the user "can I run X?" in chat.** The approval card
  already does that; redundant chat asks are noisy.
- **Read-only first.** When researching APIs, prefer `GET` over `POST`
  unless the user explicitly asked you to mutate something.
