---
name: skill-authoring
description: How to author a new Candle skill — SKILL.md frontmatter, a tight index description, body conventions, and persisting with skill_manage(create).
tags: skills, meta, learning, procedural-memory
---

# Skill Authoring

Goal: capture a reusable, generalizable workflow as a new Candle skill so the
agent can reload it later instead of re-deriving it. This is a meta-procedure
for extending the agent's own procedural memory.

## When to author a skill

- After you complete a multi-step task that is **repeatable** and
  **generalizable** (not a one-off), and the steps weren't obvious.
- When the user explicitly asks you to "remember how to do this" / "make a
  skill for it".
- Do NOT author skills for trivial one-tool tasks or one-time, highly specific
  jobs — they clutter the index.

## File format (exact)

A skill is a single `SKILL.md` with YAML front-matter:

```markdown
---
name: my-skill-name
description: One line, max ~200 chars — shown in the system-prompt index.
tags: tag1, tag2, tag3
---

# Title

Body: the full step-by-step workflow.
```

Rules:
- `name`: kebab-case, 2-63 chars, **must equal the directory name**
  (`backend/context/skills/<name>/SKILL.md`).
- `description`: required, one line, max ~200 chars. This is the ONLY part
  injected into every system prompt, so make it precise and trigger-rich —
  describe *when* to use the skill, not just what it does.
- `tags`: optional, comma-separated, aid searchability.

## Body conventions

- Open with a 1-line **Goal**.
- Add a **When to use** (and ideally **When NOT to use**) section so the model
  selects it correctly.
- Give **numbered steps that name exact Candle tools** (`run_terminal`,
  `run_python`, `write_sandbox_file`, `http_request`, `spawn_subagent`,
  `get_sandbox_file_url`, etc.). Never invent tool names.
- Include **verification** steps (e.g. `run_terminal "ls -la <path>"`) so the
  agent confirms artifacts before delivering.
- Add a **Gotchas** section for the non-obvious failure modes.
- End with a **Deliver** section: how to report results / return URLs.
- Keep the body under ~16 KB — longer is truncated on load.

## How to persist it

Two ways:

1. **`skill_manage(action="create", ...)`** — preferred at runtime. Pass the
   `name`, `description`, `tags`, and full markdown `body`. The registry
   refreshes and the new skill appears in the index on the next request. Other
   actions: `update`, `delete`, `list`.
2. **By hand**: `write_sandbox_file`/`Write` a `<name>/SKILL.md` into
   `backend/context/skills/`; it loads on next backend boot or registry
   refresh.

## Self-review before saving

- Does the `description` make the trigger conditions obvious in one line?
- Could a fresh agent with no memory follow the steps using only named tools?
- Are confirmation/safety steps present for any action visible to others or
  destructive?
- Did you avoid duplicating an existing skill? Check `skill_manage(action="list")`
  or the index first; prefer `update` over a near-duplicate.

## Gotchas

- `name` mismatch with the directory breaks loading — keep them identical.
- A vague description means the skill never gets selected. Be specific.
- Don't bake one-off specifics (a single repo name, a personal path) into a
  skill meant to be general — parameterize them in the steps.

## Deliver

Confirm the skill name, its one-line description, and that it was persisted
(via `skill_manage` or written to disk).
