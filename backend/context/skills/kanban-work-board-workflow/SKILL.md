---
name: kanban-work-board-workflow
description: How to use the kanban tool to queue a durable, multi-stage goal that runs autonomously in the background, with task dependencies and crash recovery.
tags: kanban, autonomous, background, pipeline, multi-step, dependencies, planner
---

# Kanban Work Board Workflow

The `kanban` tool is a PERSISTENT work queue. You queue self-contained tasks
and walk away — background workers dispatch and run each one autonomously. The
board survives process restarts: a task interrupted mid-run is recovered and
re-tried automatically. This is the tool for long-running goals that should keep
making progress without you babysitting them.

## How it differs from the other delegation tools

- **kanban** — durable + autonomous + multi-stage. Survives restarts. You queue
  work and do NOT wait for results this turn. Best for goals with several stages.
- **spawn_subagent** — ephemeral. Runs now, you wait, you use the result in the
  CURRENT turn. Best for a single focused sub-task you need answered immediately.
- **todo** — a checklist YOU work through yourself in this conversation. No
  workers, no persistence.

## The task contract

Every task's `task` field is a SELF-CONTAINED prompt run by a worker with **no
chat history**. Put everything the worker needs inside it: exact URLs, file
paths, requirements, output format. A vague task ("finish the report") will fail;
a complete one ("Read /home/user/sales.csv, compute monthly totals, write a
markdown summary to /home/user/summary.md") will succeed.

## Building pipelines with dependencies

Use `dependsOn` to chain stages. A task only becomes runnable once ALL its
prerequisites are `done`, and each prerequisite's result is automatically
prepended to the task's prompt as context. Tasks with no shared dependencies run
concurrently (up to the dispatcher's concurrency limit).

Example — a 3-stage research-and-write goal:

1. `kanban(action="add", title="Research competitor A", task="Research Acme Corp's pricing and top 3 features. Output a concise bullet summary.")` → returns id `k_aaa`
2. `kanban(action="add", title="Research competitor B", task="Research Globex's pricing and top 3 features. Output a concise bullet summary.")` → returns id `k_bbb`
3. `kanban(action="add", title="Write comparison", task="Write a markdown comparison table of the two competitors from the research provided.", dependsOn=["k_aaa","k_bbb"])`

Tasks 1 and 2 run in parallel; task 3 starts only after both finish, with their
summaries fed into its prompt.

## Monitoring and recovery

- `kanban(action="list")` — see every task and its status
  (`pending` → `ready` → `running` → `done`, or `blocked` / `cancelled`).
- `kanban(action="status", id="k_xxx")` — one task's detail, including its
  result or error.
- A task that fails more than its retry budget becomes `blocked`. Fix the root
  cause, then `kanban(action="unblock", id="k_xxx")` to re-queue it.
- `kanban(action="cancel", id="k_xxx")` — stop a task you no longer want.

## After queuing

Tell the user the work is now running in the background and that they can check
back later (or that you'll report when it's done). Do NOT block your reply
waiting for kanban tasks — that is what `spawn_subagent` is for.

## When NOT to use kanban

- A single step — just do it inline or with one `spawn_subagent`.
- Work whose result you need THIS turn to continue reasoning — use
  `spawn_subagent`.
- A simple in-conversation checklist — use `todo`.
