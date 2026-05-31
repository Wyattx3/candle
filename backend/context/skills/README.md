# Skills Directory

This directory stores **procedural memory** for the Candle agent — reusable
step-by-step workflows the model can load on demand instead of re-deriving
from scratch every time.

## Layout

Each skill is a single Markdown file with YAML front-matter, stored as either:

```
backend/context/skills/<skill-name>/SKILL.md     ← preferred (Hermes-style)
backend/context/skills/<skill-name>.md           ← also accepted
```

## Front-matter

```markdown
---
name: pdf-merge-workflow
description: Merge multiple PDFs into one and deliver a download URL.
tags: pdf, document, merge
---

# Body of the skill — the full step-by-step workflow

1. Install pypdf with install_packages(...)
2. Run python with the merge code shown below
3. Verify the output file exists with run_terminal "ls -la /tmp/merged.pdf"
4. Return the URL via get_sandbox_file_url
```

Field requirements:

| Field         | Required | Notes                                                                  |
| ------------- | -------- | ---------------------------------------------------------------------- |
| `name`        | yes      | Kebab-case, 2-63 chars. Falls back to the directory/file name if omitted. |
| `description` | yes      | One-line summary shown in the system prompt index. Max ~200 chars.     |
| `tags`        | no       | Comma-separated tags for searchability.                                |

## How the agent uses skills

1. The system prompt lists every skill as `- name — description [tags]`.
   Only the **index** is injected — bodies stay on disk.
2. When the model spots a matching skill it calls `skill_view(name="<name>")`
   to load the full body, then follows it.
3. After a successful, generalizable run the model can call
   `skill_manage(action="create", ...)` to persist a new skill for future runs
   (closed-loop learning).

## Conventions for skill bodies

- Open with a 1-line goal, then numbered steps.
- Reference exact tool names (`run_python`, `download_video`, etc.) so the
  model doesn't have to guess.
- Include verification steps (e.g. `run_terminal "ls -la <path>"`) so the
  agent confirms artifacts before delivering them.
- Keep the body under ~16 KB — longer bodies are truncated on load.

## Adding skills by hand

Drop a new `<name>/SKILL.md` file (with valid front-matter) into this
directory. The next time the backend boots — or the next time
`skill_manage(action="create")` runs — the registry refreshes from disk.
