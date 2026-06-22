---
name: songwriting
description: Craft song lyrics with deliberate structure (verse/chorus/bridge), rhyme scheme, meter, and a unifying theme; deliver cleanly formatted, singable lyrics.
tags: writing, lyrics, songwriting, creative, music
---

# Songwriting

## Purpose
Write lyrics that have a shape and a point — not just rhyming lines. Use this
when a user asks for a song, lyrics, a jingle, a rap verse, or a parody set to a
familiar form. This is a methodology skill; the deliverable is formatted text.

## When to use
- "Write me a song / lyrics / a chorus / a verse about X."
- A jingle, anthem, parody, or themed piece tied to an occasion.
- Reworking existing lyrics for tone, theme, or singability.

## Song structure (the common forms)
- **Verse** — advances the story/imagery; details change between verses. Same
  melody and meter across verses.
- **Chorus** — the emotional core and hook; repeats nearly verbatim each time.
  Contains the title/central line. Should be the most memorable, simplest part.
- **Pre-chorus** (optional) — a short lift that builds tension into the chorus.
- **Bridge** — appears once, ~2/3 through; a contrast in melody, perspective, or
  message. Provides relief from the verse/chorus pattern before the final chorus.
- **Common arrangement**: Verse 1 -> Chorus -> Verse 2 -> Chorus -> Bridge ->
  Chorus (-> outro). Pop-friendly and reliable. Adapt for the genre (e.g. rap:
  longer verses, hook instead of full chorus; folk: verse-heavy, refrain).

## Craft elements

### Theme
Decide the single core idea or feeling before writing a line. Every section
should serve it. A song about "leaving home" shouldn't wander into unrelated
images. Pick one central metaphor and stay loyal to it.

### Rhyme scheme
Choose and keep a scheme per section. Common patterns:
- AABB (couplets) — simple, sing-song, good for upbeat/comic.
- ABAB (alternating) — smoother, more lyrical.
- ABCB — only lines 2 and 4 rhyme; natural and unforced.
Use a mix of perfect rhymes (time/rhyme) and slant rhymes (time/line) to avoid
sounding forced. Don't twist grammar just to land a rhyme — natural phrasing
beats a perfect rhyme that reads backwards.

### Meter & singability
Keep a consistent syllable count / stress pattern across parallel lines (e.g.
all verse lines ~8 syllables). Lyrics are sung, so rhythm matters more than on
the page:
- Read every line aloud (mentally) for stress. Stressed syllables should fall
  where the beat would.
- Match line length between Verse 1 and Verse 2 so they fit the same melody.
- Favor open vowels and easy consonants on held/high notes.

### Imagery & language
Show concrete images over abstract statements ("your coffee's still warm on the
step" beats "I feel your absence"). Use sensory detail. Let the chorus be plain
and direct; let verses carry the specifics.

## Workflow
1. **Gather the brief**: theme/subject, mood, genre, perspective (1st/2nd/3rd),
   any title or hook the user already has, and explicit content limits. If genre
   or mood is unstated and it'd change the whole piece, ask one `clarify`
   question; otherwise pick a fitting default and note it.
2. **Lock the core**: write the central line / title and the chorus hook first —
   everything hangs off it.
3. **Draft the chorus**, then verses that feed into it, then the bridge for
   contrast. Keep rhyme scheme and syllable count consistent within each section.
4. **Read aloud and revise** for meter, forced rhymes, and theme drift. Tighten.
5. **Format** with clear section labels:
   ```
   [Verse 1]
   line
   line

   [Chorus]
   line
   line
   ```
6. **Deliver**: short song inline; longer piece written to
   `/home/user/lyrics.md` via `write_sandbox_file` and shared with
   `get_sandbox_file_url`. Optionally add a one-line note on intended tempo/feel
   and the rhyme scheme used.

## Checklist
- [ ] One clear theme carried through every section.
- [ ] Chorus contains the hook/title and repeats consistently.
- [ ] Consistent rhyme scheme per section; rhymes feel natural, not forced.
- [ ] Parallel lines share syllable count / meter (singable).
- [ ] A bridge or contrast section breaks the repetition.
- [ ] Concrete imagery in verses; plain, direct chorus.
- [ ] Clearly labeled sections in the output.

## Gotchas
- Candle has no audio generation — deliver lyrics as text only; don't promise a
  recorded melody.
- Don't sacrifice meaning or grammar for a rhyme; slant rhyme is your escape hatch.
- Avoid cliche rhyme pairs (fire/desire, heart/apart) unless used knowingly.
- Respect copyright: write original lyrics. For parody, write new words to the
  structure/feel of a song — don't reproduce the original's lyrics.
