---
name: multi-agent-orchestration
description: Coordinate a large goal across workers — choose parallel fan-out vs durable kanban pipeline vs sequential subagents, split work, merge results.
tags: orchestration, subagents, parallel, planning, kanban
---

# Multi-Agent Orchestration

Goal: break a large task into pieces and run it across worker agents, then
merge the results into one coherent deliverable. This is a meta-procedure for
choosing the right coordination shape and stitching the outputs together.

## Pick the coordination shape

Three shapes, by dependency structure:

1. **`spawn_subagents_parallel` — independent fan-out.**
   Use when 2-4 sub-tasks are fully independent and you want them at once
   (e.g. "research 3 competing libraries", "render 3 chart variants").
   Each worker gets ~90 s and its own budget, no shared state. Optional
   first-success race cancels siblings — use that when any one good answer
   suffices. Best when results just need concatenating/comparing.

2. **Sequential `spawn_subagent` — dependent, short chain.**
   Use when step B needs step A's output and the chain is short (research →
   produce). Run one, fold its `summary`/`artifacts` into the next worker's
   `task` string (workers have no memory — paste what they need). Keeps your
   own context lean.

3. **`todo` kanban board — durable, dependent pipeline.**
   Use when the goal is long, multi-stage, and you (the orchestrator) must
   track many steps over a long run that might span context compaction.
   Maintain the checklist with `todo`; do the work inline or delegate
   individual items to subagents. The board survives as your durable plan of
   record; parallel subagents do not persist a plan.

Rule of thumb: independent + short = parallel; dependent + short = sequential
subagents; long + stateful = todo board (optionally feeding subagents).

## Steps

1. **Decompose.** Write the goal as discrete sub-tasks. Mark each as
   independent or dependent. If decomposition needs a user decision (scope,
   priorities), `clarify` first — workers won't ask.
2. **Choose the shape** per the rules above. Don't fan out work that's
   actually a single tool call (see subagent-delegation-workflow).
3. **Write self-contained tasks.** Each worker `task` string must contain
   everything it needs: URLs, content, exact output format, and "produce a
   file" vs "just return text". Reference nothing from your conversation.
4. **Launch.**
   - Parallel: one `spawn_subagents_parallel` call with 2-4 tasks; set the
     race flag only if first-success is acceptable.
   - Sequential: `spawn_subagent`, read its result, then the next.
   - Pipeline: seed the `todo` list, then work/delegate item by item, marking
     each done.
5. **Merge.** Collect each worker's `summary` and `artifacts` (artifacts
   already carry `url` + `path` — no `get_sandbox_file_url` needed, and are
   deduped across workers). Reconcile contradictions, dedupe overlap, and
   synthesize one answer. If a worker returned `ok:false`, retry inline or note
   the gap — don't blindly re-spawn.

## Gotchas

- Workers cannot recurse — never instruct a subagent to spawn subagents.
- Don't over-parallelize: 5+ workers for a trivial problem wastes budget.
- Parallel workers can't coordinate mid-flight; if tasks must talk to each
  other, they aren't independent — use a pipeline.
- Keep orchestrator reasoning inline; only offload self-contained chunks.
- Persist a genuinely reusable end-to-end workflow with
  `skill_manage(action="create")` after a clean run.

## Deliver

One merged result that reads as a single coherent answer, plus any artifact
URLs. Briefly note how work was split if the user cares about provenance.
