---
name: clear-communication
description: Use the 1-3-1 structure (1 issue, 3 options, 1 recommendation) for crisp written updates, proposals, and decisions — when to use it and how to build each part.
tags: communication, writing, decisions, proposals, structure
---

# Clear Communication (1-3-1)

## Purpose
Give a decision-maker what they need to act in seconds, not paragraphs. The
1-3-1 structure forces clarity: state ONE issue, lay out THREE viable options,
and make ONE clear recommendation. Use this for status updates, proposals,
escalations, design decisions, or any message where you're asking someone to
decide or want them to understand a call you made.

## When to use
- Proposing a technical approach or architecture decision.
- Escalating a blocker that needs a choice from someone else.
- Summarizing options after research (pairs naturally with creative-ideation).
- Any update where rambling context would bury the actual ask.
- NOT for pure information dumps with no decision — use a plain summary instead.

## The structure

### 1 — The issue (one tight paragraph)
State the single problem or decision, the context needed to understand it, and
why it matters now. Be specific and neutral.
- Lead with the decision to be made, not the backstory.
- Include only context that changes the decision. Cut the rest.
- Quantify the stakes if you can (cost, time, risk, users affected).
- Good: "Our image uploads time out for files over 8MB; ~12% of users hit this
  weekly. We need to decide how to handle large uploads before launch."

### 3 — The options (exactly three)
Three genuinely distinct, viable paths. Not two strawmen and a winner — three
real choices spanning the trade-off space (e.g. fast/cheap vs. robust/slow vs.
balanced). For each option give:
- A short label.
- 1-2 sentences on what it involves.
- Key pros and cons (or cost / effort / risk).
Keep each option parallel in format so they're easy to compare. A small table
works well when the trade-offs are quantitative.
- Why three: one option isn't a choice, two feels binary/forced, four+ causes
  decision paralysis. Three is the sweet spot.

### 1 — The recommendation (one clear call)
Pick one option and say why in 1-2 sentences. Take a position — a recommendation
that hedges is just a fourth option. Note what you'd need to proceed (approval,
info, resources) and the immediate next step.
- Good: "Recommend Option B (chunked upload + S3). It fixes the failure for all
  file sizes with ~2 days of work and no new vendor. If you approve, I'll start
  on the client-side chunking today."

## Workflow
1. **Nail the issue.** Write the one-sentence decision first. If you can't state
   it in a sentence, you don't understand it yet — narrow further.
2. **Generate options.** If you have more than three, cluster/cut to the three
   that best span the trade-offs. (Use the creative-ideation skill if you need
   to generate candidates first.)
3. **Compare honestly.** Give each option a fair pro/con; don't sandbag the ones
   you dislike.
4. **Commit to a recommendation** with a clear reason tied to the stakes from
   the issue.
5. **Format for skim:** bold labels, short bullets, optional comparison table.
   Keep the whole thing as short as the decision allows.
6. **Deliver** inline for a quick update; for a formal proposal write a Markdown
   doc with `write_sandbox_file` and share via `get_sandbox_file_url`.

## Checklist
- [ ] Exactly one clearly-stated issue/decision up top.
- [ ] Exactly three distinct, viable options (not strawmen).
- [ ] Each option has parallel pros/cons or cost/risk.
- [ ] One unambiguous recommendation with a reason.
- [ ] A concrete next step / what's needed to proceed.
- [ ] Skimmable in under a minute.

## Gotchas
- Don't smuggle in a fourth option inside the recommendation.
- Don't pad the issue with backstory the reader doesn't need to decide.
- Don't present options you'd never actually pick — the reader can tell, and it
  wastes their time.
- If the honest answer is "only one viable path", say so plainly and explain
  why the alternatives fail — don't manufacture fake options to fit the format.
