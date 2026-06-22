---
name: text-humanizer
description: Rewrite stiff, robotic, or AI-sounding text into natural human prose — cut hedging and filler, vary sentence length, kill cliches — with concrete before/after edits.
tags: writing, editing, copy, humanize, prose, tone
---

# Text Humanizer

## Purpose
Take text that reads as generated, corporate, or stiff and rewrite it so it
sounds like a real person wrote it on purpose. Use this when a user pastes copy
that "sounds like AI", asks to make writing warmer/punchier/more natural, or
when polishing your own drafted copy before delivery.

## Tells of robotic / AI-sounding text (hunt these down)
- **Hedging stacks**: "it's important to note that", "it's worth mentioning",
  "generally", "typically", "in many cases", "may potentially".
- **Filler openers**: "In today's fast-paced world", "When it comes to",
  "At the end of the day", "Needless to say".
- **Overused connective scaffolding**: "Moreover", "Furthermore",
  "Additionally", "In conclusion", every paragraph starting the same way.
- **Empty intensifiers**: "very", "really", "truly", "highly", "incredibly".
- **Cliche pairs**: "navigate the complexities", "unlock the potential",
  "delve into", "tapestry of", "in the realm of", "game-changing",
  "robust solution", "seamless experience".
- **Uniform rhythm**: every sentence the same medium length — a dead giveaway.
- **Vague abstraction**: claims with no concrete noun, number, or example.
- **List-itis**: turning everything into a bulleted list of parallel clauses.
- **Symmetry tic**: "It's not just X, it's Y" / "more than just" framing.

## Editing moves (apply in this order)
1. **Cut hedging and filler.** Delete qualifier phrases outright. "It's
   important to note that the API is fast" -> "The API is fast."
2. **Replace abstraction with specifics.** Swap vague nouns for concrete ones,
   add a real number or example. "improves performance significantly" ->
   "cuts load time from 4s to under 1s".
3. **Vary sentence length.** Put a short, punchy sentence next to a longer one.
   Read it aloud (mentally) — if every sentence has the same beat, break it up.
   A three-word sentence resets the rhythm.
4. **Use plain verbs.** "utilize" -> "use", "leverage" -> "use", "facilitate"
   -> "help", "in order to" -> "to".
5. **Prefer active voice.** "The form is submitted by the user" -> "The user
   submits the form."
6. **Kill cliches and stock metaphors.** Say the plain thing instead.
7. **Address the reader directly** where appropriate ("you"), and let a little
   personality through — contractions are fine, even good.
8. **Trim every sentence.** Remove words that carry no meaning. If a sentence
   survives deletion of a word, the word goes.
9. **Vary openers.** Don't start consecutive sentences/paragraphs the same way
   or with the same connective.

## Before / after examples
- Before: "It's important to note that our platform leverages cutting-edge
  technology to deliver a seamless and robust user experience."
  After: "Our platform is fast and it stays out of your way."
- Before: "In today's fast-paced digital landscape, businesses must navigate
  the complexities of customer engagement."
  After: "Keeping customers engaged is hard, and it's getting harder."
- Before: "We are committed to providing solutions that facilitate enhanced
  productivity for all stakeholders."
  After: "We build tools that help your team get more done."

## Workflow
1. **Read the source and the goal.** Note the target voice (casual / confident /
   warm / authoritative) and any constraints (length, audience, must-keep
   facts). If the desired tone is genuinely unclear, ask one `clarify` question;
   otherwise default to "clear, natural, confident".
2. **Mark the tells.** Mentally (or in a scratch list) flag every hedge, cliche,
   filler phrase, and uniform-rhythm run.
3. **Rewrite** applying the moves above. Preserve meaning and every factual
   claim — humanizing is not inventing. Keep technical accuracy intact.
4. **Read it back for rhythm.** Confirm sentence lengths vary and no paragraph
   opens like the one before.
5. **Deliver.** For a short snippet, return the rewrite inline plus a one-line
   note on what changed. For a long document, write it to a file with
   `write_sandbox_file` (e.g. `/home/user/rewrite.md`) and share via
   `get_sandbox_file_url`. Optionally show a short before/after diff of the
   worst offenders so the user sees the reasoning.

## Principles
- Match the register the user wants — "human" for a legal disclaimer is not the
  same as "human" for a startup landing page.
- Concision over cleverness. The goal is clear and natural, not quirky.
- Never sacrifice accuracy or add claims to sound livelier.
- One strong word beats two weak ones.

## Gotchas
- Don't over-correct into slangy or jokey if the context is formal.
- Don't strip ALL structure — some documents genuinely need lists and headings.
  Humanize the prose, keep the useful scaffolding.
- Preserve domain terms and proper nouns exactly; only the connective tissue
  around them should change.
