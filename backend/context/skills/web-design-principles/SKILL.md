---
name: web-design-principles
description: Apply modern web-design fundamentals (visual hierarchy, spacing, type scale, color, contrast) when building a page, then run a pre-delivery visual QA pass via sandbox_browser screenshot.
tags: design, web, ui, css, hierarchy, typography
---

# Web Design Principles

## Purpose
Turn a vague "make it look good" request into a page that reads cleanly and
looks intentional. Use this whenever you build or refine a landing page,
marketing section, dashboard, or any HTML/CSS surface and want it to feel
professionally designed rather than thrown together.

## When to use
- The user asks for a webpage, landing page, or UI and quality matters.
- An existing page "looks off" and you need a principled fix, not random tweaks.
- Before delivering ANY visual artifact — run the QA checklist below.

## The five fundamentals (apply every time)

### 1. Visual hierarchy
Guide the eye from most to least important. The single most important element
(headline, primary CTA) should be the largest / boldest / highest-contrast
thing on the screen. Everything else recedes.
- One clear focal point per view. If everything shouts, nothing does.
- Size, weight, color, and whitespace are your hierarchy levers — use them
  deliberately, not decoratively.

### 2. Spacing & rhythm
Use a consistent spacing scale based on a base unit (usually 4px or 8px):
`4, 8, 12, 16, 24, 32, 48, 64`. Never use arbitrary values like `13px` or
`27px`.
- Group related items with tight spacing; separate unrelated groups with
  generous gaps (proximity = relationship).
- Whitespace is not wasted space. Crowded pages read as cheap.
- Keep body text line-length to ~50-75 characters (`max-width: 65ch`).

### 3. Type scale
Pick a modular scale (e.g. ratio 1.25 or 1.333) instead of random font sizes:
`14, 16, 20, 25, 31, 39, 49`px. Use 2-3 sizes on a simple page.
- Set line-height ~1.5 for body, ~1.1-1.25 for large headings.
- One typeface family is usually enough; pair at most two (one display, one
  body). Default to a clean system or Google Font (Inter, Manrope, Source Sans).
- Establish weight contrast: e.g. body 400, headings 600-700.

### 4. Color
Build a small, disciplined palette: one brand/accent, a neutral ramp (near-white
→ near-black for backgrounds/text/borders), and 1-2 semantic colors (success,
error). Use the 60/30/10 rule: ~60% dominant/neutral, ~30% secondary, ~10%
accent.
- Apply the accent sparingly — to the primary CTA and key highlights only.
- Define everything as CSS variables so it stays consistent (see the
  design-system-tokens skill).

### 5. Contrast & legibility
- Body text vs background must meet WCAG AA: contrast ratio >= 4.5:1 (>= 3:1 for
  large text >= 24px or bold >= 19px).
- Never put light-gray text on white "because it looks minimal" — it fails AA.
- Buttons and interactive elements need an obvious affordance (fill, border, or
  shadow) and a visible hover/focus state.

## Build steps
1. **Clarify intent briefly**: purpose of the page, audience, brand vibe
   (corporate / playful / editorial / dark), and any must-have sections. If the
   request is concrete, just proceed and pick sensible defaults; use `clarify`
   only when a wrong guess would waste real work.
2. **Sketch structure first** (in your head or a comment): hierarchy of
   sections top-to-bottom before any styling. Content decisions before color.
3. **Set foundations**: define CSS variables for the spacing scale, type scale,
   and color palette at the top of the file. Reset margins, set `box-sizing:
   border-box`, base font, and `line-height`.
4. **Build sections** using a constrained `max-width` container (e.g. `1120px`,
   centered) with consistent horizontal padding. Apply the spacing scale for
   vertical rhythm between sections (`padding: 64px 0` or similar).
5. **Apply hierarchy and accent** last: make the focal element pop, mute the
   rest, place the accent color only where it counts.
6. **Write the file** as a single self-contained HTML file (inline `<style>`)
   with `write_sandbox_file` (e.g. `/home/user/index.html`).
7. **Visual QA** (mandatory — see checklist).
8. **Deliver** via `get_sandbox_file_url` and summarize the design decisions
   (hierarchy, palette, type scale) so the user understands the intent.

## Pre-delivery visual QA checklist (via sandbox_browser)
Render and actually LOOK before you ship.
1. `sandbox_browser` → `goto` the file (`file:///home/user/index.html`), then
   `screenshot` at desktop width (e.g. 1440).
2. `screenshot_analyze` (or inspect the screenshot) against this list:
   - [ ] One clear focal point; eye lands where intended.
   - [ ] Consistent spacing — no cramped or randomly-gapped areas.
   - [ ] Alignment is clean; elements share edges / a grid, nothing drifts.
   - [ ] Type scale is consistent; no more than ~3 sizes; headings vs body clear.
   - [ ] Text contrast passes AA (no faint gray-on-white body text).
   - [ ] Accent color used sparingly, mainly on the primary CTA.
   - [ ] Nothing overflows, overlaps, or gets clipped.
3. Re-screenshot at mobile width (e.g. 390) — confirm it reflows, text wraps,
   and tap targets stay usable. Fix and re-screenshot until both pass.

## Gotchas
- Don't decorate before structure works. Get hierarchy and spacing right first;
  gradients and shadows can't rescue a bad layout.
- Avoid pure black (`#000`) on pure white — soften to e.g. `#1a1a1a` on
  `#fafafa` for less eye strain.
- More fonts / more colors = less polish. Restraint reads as premium.
- Skipping the screenshot is the #1 cause of shipping a broken-looking page.
  Always render it.
