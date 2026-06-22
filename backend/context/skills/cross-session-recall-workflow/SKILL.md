---
name: cross-session-recall-workflow
description: Use recall_runs to search your own past runs when the user references earlier work or you want to reuse a prior solution.
tags: memory, recall, past-runs, continuity
---

# Cross-Session Recall Workflow

`recall_runs` searches your OWN past runs (previous conversations/tasks) by
keyword. It reads the run checkpoints on disk and returns, for each match, the
original prompt, a snippet of the answer you produced, the run status, and which
tools were used. It is a cheap, read-only keyword search — it does NOT replay or
resume a run, and the current conversation is excluded from results.

## When to use

- The user references earlier work without giving details: "like we did last
  time", "the script you wrote before", "remember that report from yesterday".
- You're partway through a task and recall solving something similar before —
  checking how you did it can save a full round of exploration.
- The user asks "have we done X already?" or "what did we decide about Y?".

## When NOT to use

- For durable facts/preferences about the user or project — use `search_memory`
  instead (that's curated long-term memory; this is raw run history).
- For loading a known workflow — use `skill_view` instead.
- Speculatively on every turn. Only reach for it when there's a real reference
  to past work or a concrete reason to look back.

## How to use

1. Call `recall_runs(query="<specific keywords>")`. Use distinct, content-ful
   terms (e.g. "merge pdf invoices", not "the thing"). Optionally pass
   `limit` (default 5, max 10).
2. Read the returned matches. Each has `runId`, `when`, `status`, `prompt`,
   `answerSnippet`, and `tools`.
3. Use the snippet/tools to reconstruct the approach, then proceed with the
   current task. If the user wants the actual earlier artifact, note that runs
   are summaries — you may need to redo the work, not fetch a stored file.

## Notes

- Results are ranked by keyword overlap, newest-first on ties.
- All returned text is secret-redacted, so credentials never resurface.
- Empty results just mean no past run matched — proceed normally.
