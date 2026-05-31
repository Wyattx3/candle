---
name: subagent-delegation-workflow
description: When and how to call spawn_subagent to offload a self-contained sub-task with its own budget.
tags: planner, worker, subagent, delegation, planning
---

# Subagent Delegation Workflow

`spawn_subagent` runs an isolated worker agent for a focused sub-task.
The worker has its own ~14-call tool budget, a 2-minute timeout, no chat
history, and cannot spawn further subagents. It returns a concise summary
plus any new artifacts so you can fold the result into your final answer
without inheriting the worker's full context.

## When to spawn

- A research phase that would otherwise eat many tool calls (e.g.
  "find the top 5 lightweight Python web frameworks with stars and
  one-line descriptions").
- An independent build/render/conversion step whose intermediate steps
  you don't need to watch.
- A workflow that splits naturally into "research" + "produce", where
  keeping it all in one context would risk context overflow.

## When NOT to spawn

- Trivial tasks (1-3 tool calls). The overhead isn't worth it.
- Anything that needs to ask the user a clarifying question — the worker
  won't ask, it'll guess.
- Reasoning that depends on what you've already discovered this turn —
  keep that inline so you don't lose state.

## Contract

The worker has **no memory of your conversation**. Whatever it needs has
to be in the `task` string:

```json
{
  "task": "Research the top 5 most-starred MIT-licensed Python web frameworks on GitHub as of today. For each: name, stars (rounded to nearest 100), one-line description, and link. Return as a Markdown list. Do not produce a file — just the list."
}
```

The result you receive looks like:

```json
{
  "ok": true,
  "summary": "Here are 5 MIT-licensed Python web frameworks ...",
  "toolCallsUsed": 6,
  "toolCallBudget": 14,
  "artifacts": [{ "url": "https://...", "path": "/home/user/...", "filename": "..." }]
}
```

## How to use the result

1. Treat `summary` as the worker's final answer to its task. Quote or
   paraphrase it in your reply.
2. New artifacts already have `url` and `path` populated. You don't need
   `get_sandbox_file_url` again.
3. If `ok: false`, explain to the user that the sub-task didn't complete
   and either retry inline or move on. Don't immediately re-spawn.

## Anti-patterns

- Don't spawn a subagent just to "save tokens" on a trivial task.
- Don't pass references like "the article we discussed earlier" — paste
  the URL or content into the task string.
- Don't fan out 5 subagents in parallel for a problem that could be a
  single tool call.
- Don't spawn from inside another subagent. The tool isn't available
  there and you'll waste an attempt.
