---
name: programmatic-tools-workflow
description: Use run_python_with_tools to call Candle's own tools from a sandbox script, collapsing a multi-step pipeline into one zero-context-cost turn.
tags: rpc, programmatic, pipeline, batch, automation
---

# Programmatic Tool Calling Workflow

`run_python_with_tools` runs a Python script in the sandbox that can call your
OWN tools as plain functions. A multi-step pipeline (search many queries, fetch
many URLs, transform, write a combined output) runs as ONE turn — the
intermediate tool results stay inside the script and never flood the
conversation. Only what you `print()` comes back to you.

## Functions available inside the script

Call these directly — no import, no setup:

- `search_web(query, max_results=10)` → search results as a string
- `browse_web(url, max_text_chars=7000)` → page text/metadata as a string
- `read_file(path, max_bytes=8000)` → file contents from the sandbox
- `write_file(path, content, encoding='text')` → writes into the sandbox
- `list_files(path='/home/user')` → directory listing
- `http_request(url, method='GET', headers=None, body=None)` → HTTP response

Each returns the tool's raw string output. Parse it in Python (`json.loads`,
string ops) as you would any other data.

## When to use

- Looping over many items: "search these 8 topics and write one combined
  markdown report", "fetch these 5 API endpoints and extract a field from each".
- Any pipeline where calling tools one at a time would add many turns and bloat
  the conversation with intermediate output you don't need to see.

## When NOT to use

- A single search or fetch — just call the tool directly (`search_web`, etc.).
- Work that needs your judgement BETWEEN steps (decide A, then based on A decide
  B). Programmatic calling is for mechanical fan-out, not branching reasoning.
- Anything requiring tools NOT in the list above (e.g. terminal, subagents,
  browser automation, skill management) — those are intentionally unavailable
  inside the script.

## How to use

1. Write a Python script that loops/processes and calls the helper functions.
2. `print()` the final result you want returned (a summary, a path, a JSON blob).
3. Keep loops bounded — there are hard caps on RPC calls and wall-clock per
   script. If you hit the call limit, the helper raises and the script should
   finish with what it has.

## Example shape

```python
import json
topics = ["a", "b", "c"]
lines = []
for t in topics:
    raw = search_web(t, max_results=3)
    results = json.loads(raw)
    top = results[0] if results else {}
    lines.append(f"## {t}\n{top.get('title','')} — {top.get('url','')}")
report = "\n\n".join(lines)
write_file("/home/user/report.md", report)
print(f"Wrote report with {len(topics)} sections")
```

Then return the printed summary (and offer the written file) to the user.
