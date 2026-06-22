---
name: creative-ideation
description: A structured method for generating then ranking ideas — diverge widely (SCAMPER, constraints, analogies), converge with weighted criteria, deliver a ranked shortlist with rationale.
tags: ideation, brainstorming, creativity, scamper, prioritization
---

# Creative Ideation

## Purpose
Produce a strong, ranked set of ideas instead of the first three obvious ones.
Use this when a user asks to brainstorm names, features, campaigns, content
angles, product concepts, solutions to a problem, or "give me ideas for X".

## The core principle: separate diverge from converge
Never judge while generating, and never generate while judging. Run two distinct
phases. Mixing them kills both quantity (premature criticism) and quality (no
filtering). Diverge to ~15-30 raw ideas, THEN converge to a ranked shortlist.

## Phase 1 — Diverge (generate widely)
Goal: volume and variety. Aim for at least 15 ideas spanning multiple angles.
Use these prompts to break out of the obvious:

- **SCAMPER** — run the seed concept through each lens:
  - Substitute (swap a component/material/audience)
  - Combine (merge with another product/idea)
  - Adapt (borrow from another domain/industry)
  - Modify/Magnify (exaggerate, shrink, restyle)
  - Put to another use (new context or user)
  - Eliminate (strip a core feature — what remains?)
  - Reverse/Rearrange (flip the order, invert the assumption)
- **Forced constraints** — deliberately limit to spark creativity: "if budget
  were zero", "if it had to work offline", "for the opposite audience", "in 24
  hours".
- **Analogies** — "how would Netflix / a hospital / a kindergarten solve this?"
- **Extremes** — the most luxurious version, the most minimal, the most absurd.

Capture everything. Bad ideas often seed good ones. Use `todo` to track angles
you've covered if the space is large; use `search_web` to scan how others have
approached the problem and find adjacent inspiration (don't copy — diverge from).

## Phase 2 — Converge (rank and select)
1. **Define 2-4 evaluation criteria** fit to the goal. Common ones: Impact,
   Feasibility, Originality, Cost, Time-to-build, Strategic fit. Ask the user if
   their priorities are unclear; otherwise pick sensible defaults and state them.
2. **Cluster & dedupe** the raw list — merge near-duplicates, drop the truly
   weak, group variants.
3. **Score** each surviving idea 1-5 on each criterion. Optionally weight
   criteria (e.g. Impact x2). A simple weighted-sum table is enough; compute it
   with `run_python` if there are many ideas.
4. **Rank** by total score and pick the top 5-8 for the shortlist.
5. **Sanity check** the top ranks against gut feel — if a low-scorer feels
   exciting, note why (sometimes a criterion is missing).

## Deliver
Return a ranked shortlist, each entry with:
- A short name and one-line description.
- Its score / why it ranked where it did (1 sentence).
- For the top 1-3: a concrete next step to pursue it.

Format inline for a small set. For a large exercise, write a structured Markdown
doc (idea list + scoring table + ranked shortlist) with `write_sandbox_file` and
deliver via `get_sandbox_file_url`. Optionally render the scoring table.

## Checklist
- [ ] At least ~15 raw ideas before any filtering.
- [ ] Generation and judgment kept in separate phases.
- [ ] Used 2+ divergence techniques (not just free association).
- [ ] Explicit, stated criteria for ranking.
- [ ] Shortlist is ranked with a one-line rationale each.
- [ ] Top picks include a concrete next action.

## Gotchas
- Don't stop at the first good idea — the brief is to explore, not to settle.
- Don't present 30 unranked ideas; an unfiltered dump shifts all the work back
  to the user. Always converge.
- State your criteria and any assumptions so the ranking is transparent and
  the user can re-weight.
- Wild ideas earn their place in divergence; just be honest about feasibility in
  convergence.
