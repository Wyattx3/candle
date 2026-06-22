---
name: spike-investigation
description: Timeboxed throwaway exploration to answer one technical unknown before committing to an approach, then discard the spike.
tags: spike, research, prototype, investigation, timebox
---

# Spike Investigation

A spike is a short, disposable experiment whose only goal is to answer ONE
technical question: "Will this library do X?", "How slow is this approach?",
"Does this API return what I think?". The code is throwaway — you keep the
finding, not the implementation.

## When to use

- You're about to commit to an approach but a key assumption is unverified.
- Two approaches look viable and you need data to choose.
- An API/library is unfamiliar and docs are unclear.

Do NOT spike when the answer is already known or a quick doc read settles it.

## Steps

### 1. Write the question and the timebox

State exactly one question and a budget: "Can Playwright extract the price from
site X behind its JS rendering? Budget: ~15 minutes / a handful of tool calls."
A spike with no boundary becomes an accidental implementation.

### 2. Set up a scratch area

Keep spike code isolated so it's easy to throw away.
```
manage_sandbox_files: mkdir /home/user/spike
```

### 3. Build the smallest thing that answers the question

Write the minimum code — ignore error handling, tests, structure. Hardcode
inputs. Install whatever you need.
```
install_packages: <lib>
write_sandbox_file: /home/user/spike/try.py   (or try.js)
run_python / run_node / run_terminal: execute and observe
```
For an unknown web behavior, use `sandbox_browser` (goto/extract/screenshot) or
`http_request` to probe directly. For a "what does this API return" question,
`http_request` and read the raw body.

### 4. Record the finding immediately

The moment you have the answer, capture it in words: what works, what doesn't,
numbers observed, gotchas, and the recommended approach. This is the only
durable output of the spike.

If the finding is reusable knowledge for future runs, persist it:
```
store_memory: category=learned_pattern, "Playwright extracts site X price via selector .price after waitForSelector; raw fetch returns empty (JS-rendered)."
```

### 5. Discard the spike code

Delete the scratch dir so nobody mistakes throwaway code for production.
```
manage_sandbox_files: delete /home/user/spike
```
Then implement properly using TDD/planning, informed by what you learned. The
real implementation does NOT reuse the spike's hacky code.

## Gotchas

- The biggest failure mode is letting the spike become the implementation.
  Spike code skips error handling, tests, and structure — shipping it is a bug
  factory. Rewrite cleanly.
- Stay on the one question. If you discover a second unknown, note it and run a
  separate spike, don't blur them.
- Respect the timebox. If you blow it without an answer, that itself is a
  finding (the approach is harder than expected — reconsider).

## Deliver

Report the answer to the question, the evidence, and a clear recommendation.
Confirm the spike code was discarded.
