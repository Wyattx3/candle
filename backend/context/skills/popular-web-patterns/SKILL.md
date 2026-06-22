---
name: popular-web-patterns
description: Implement proven web UI patterns (hero, pricing table, feature grid, testimonial, FAQ, footer) as clean, responsive, accessible HTML/CSS sections.
tags: web, patterns, html, css, responsive, sections
---

# Popular Web Patterns

## Purpose
Most pages are assembled from the same handful of well-understood sections.
Reach for these battle-tested patterns instead of reinventing layout each time.
Use this when building a landing page, marketing site, or any page that needs
recognizable, conversion-friendly sections.

## When to use
- "Build me a landing page / homepage / product page."
- The user names a section: hero, pricing, features, testimonials, FAQ, footer.
- You want a fast, correct starting point that you then theme with tokens.

## Shared foundations
- Wrap each section in `<section>` with a centered container
  (`max-width: 1120px; margin-inline: auto; padding: 64px 24px`).
- Use the spacing/type/color tokens from the design-system-tokens skill.
- Mobile-first: default styles for narrow screens, then a single
  `@media (min-width: 768px)` to expand grids. Use CSS Grid/Flex with `gap`.
- Every section needs a clear heading; one primary CTA per page gets the accent.

## The patterns

### Hero
Above-the-fold pitch. Structure: eyebrow/tag (optional) -> H1 headline ->
1-2 sentence subhead -> primary CTA (+ optional secondary ghost button) ->
supporting visual or screenshot.
- Headline is the largest text on the page. Keep it under ~10 words.
- One primary action. A second action, if any, is visually secondary.
- Split layout (text left, image right) on desktop; stacked on mobile.

### Feature grid
3 (or 2/4) equal cards, each: icon -> short title -> 1-2 line description.
```css
.features{display:grid;gap:24px;grid-template-columns:1fr;}
@media(min-width:768px){.features{grid-template-columns:repeat(3,1fr);}}
```
- Keep copy parallel in length and structure across cards.
- Icons: inline SVG or an emoji placeholder; keep them uniform in size/weight.

### Pricing table
2-4 plan columns, each: plan name -> price (large) -> billing period ->
feature list (checkmarks) -> CTA. Highlight the recommended plan with a border
+ "Most popular" badge + the accent color.
- Align CTAs to the bottom of each card (flex column + `margin-top:auto`) so
  uneven feature lists still line up.
- Make the price the visual anchor; period text small and muted.

### Testimonial
Quote-led social proof: large quote -> avatar + name + role/company. Single
centered quote, or a 2-3 card grid.
- Real-feeling specifics beat generic praise. Keep quotes short.
- Avatar circular; name bold, role muted.

### FAQ (accordion)
Vertical list of question rows that expand. Use native `<details>/<summary>`
for zero-JS accessibility:
```html
<details><summary>Question text</summary><p>Answer text.</p></details>
```
- Style `summary` with `cursor:pointer`, remove the default marker, add a
  rotating chevron. Generous padding for tap targets.
- 5-8 questions max; lead with the most common objection.

### Footer
Multi-column links + brand + legal row. Structure: brand/logo + tagline,
2-4 link columns (Product / Company / Resources / Legal), then a bottom bar
with copyright and social icons.
- Reflows to stacked columns on mobile.
- Muted background (`--color-surface` darker, or dark footer) to signal page end.

## Build steps
1. Decide which sections the page needs and their order (hero almost always
   first; footer last; FAQ near the bottom).
2. Lay down tokens (see design-system-tokens), then build each section from the
   patterns above into one self-contained HTML file with `write_sandbox_file`.
3. Fill with the user's real content if provided; otherwise use clearly
   plausible placeholder copy (not lorem ipsum that hides layout problems).
4. **Render and QA** with `sandbox_browser`: screenshot at 1440 and 390 widths.
   Confirm grids reflow, the accent CTA stands out, FAQ expands, footer stacks,
   and nothing overflows. Iterate until clean.
5. **Deliver** via `get_sandbox_file_url` and list the sections you included.

## Quality checklist
- [ ] One primary CTA carries the accent; everything else is calmer.
- [ ] Each grid section reflows to one column on mobile.
- [ ] Headings establish a clear hierarchy down the page.
- [ ] Interactive elements have visible hover + focus states.
- [ ] Images have `alt`; the FAQ is keyboard-operable (`<details>` gives this free).
- [ ] Consistent vertical rhythm between sections.

## Gotchas
- Don't stack five CTAs with equal weight — pick one primary action per page.
- Avoid fixed pixel heights on sections; let content size them so mobile doesn't
  clip.
- Pricing/feature cards drift out of alignment when content differs — use
  flexbox `margin-top:auto` on the CTA to bottom-align.
- Test the smallest breakpoint; that's where these patterns break first.
