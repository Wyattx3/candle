---
name: planning-workflow
description: Decompose a multi-step coding task into a todo list, validate the plan, then execute step by step updating the todo tool.
tags: planning, todo, decomposition, workflow
---

# Planning Workflow

Use this for any task with more than ~3 distinct steps, multiple files, or an
ordering that matters. Planning first prevents half-done work and lets you (and
the user) see progress.

## Steps

### 1. Understand before planning

Skim the relevant code so the plan reflects reality, not assumptions. For an
unfamiliar repo, do a quick pass with `run_terminal` (`ls`, `rg`) and
`read_sandbox_file` on entry points. If the scope is ambiguous and a wrong
guess would waste real work, ask one focused question with `clarify`.

### 2. Decompose into a todo list

Break the work into concrete, verifiable steps and create the checklist with
the `todo` tool. Each item should be a single deliverable action, ordered by
dependency.
```
todo: create [
  "Add limit/offset params to query layer",
  "Update route handler to accept page/pageSize",
  "Return pagination metadata in response",
  "Add tests for pagination",
  "Run full test suite"
]
```
Good items are testable ("add X and a test for it"), not vague ("improve
pagination").

### 3. Validate the plan

Sanity-check before executing: Does the order respect dependencies? Is anything
missing (tests, migration, config)? Is any step actually two steps? Fix the
list now — re-planning mid-execution is cheaper than redoing code.

### 4. Execute one step at a time

Mark exactly one item `in_progress`, do it, verify it, then mark it
`completed` before starting the next. Keep only one item in progress so the
state always reflects reality.
```
todo: mark "Add limit/offset params to query layer" in_progress
... make the change with write_sandbox_file / patch, run_terminal to verify ...
todo: mark it completed
```
If you discover new work mid-stream, add it to the list rather than silently
doing it. If a step turns out unnecessary, remove it.

### 5. Close out

When every item is `completed`, do a final end-to-end verification (build +
tests). Summarize what changed. If files were produced, return
`get_sandbox_file_url` links.

## When to use the kanban tool instead

`todo` is for the current conversation. If the work is long-running, runs in
the background, or spans many independent tasks you want to track durably, use
`kanban` instead — it survives across turns and supports parallel task cards.

## Gotchas

- Don't let the plan rot. If reality diverges, update the todo list so it stays
  the source of truth.
- Don't batch completions — mark each done as you finish it, so an interruption
  leaves an accurate state.
- Plans are cheap; throw away a bad one and re-plan rather than forcing it.

## Deliver

End with the completed checklist reflected in `todo`, a short summary of the
outcome, and links to any produced artifacts.
