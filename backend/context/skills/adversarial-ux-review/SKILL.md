---
name: adversarial-ux-review
description: Stress-test a UI or flow by role-playing hostile, confused, and impaired users — enumerate failure modes, edge cases, and accessibility gaps, then deliver a prioritized findings list. Exercise the page with sandbox_browser.
tags: ux, review, testing, accessibility, qa, edge-cases
---

# Adversarial UX Review

## Purpose
Find where a UI breaks before real users do. Instead of confirming the happy
path, you actively try to break the interface by behaving like difficult users.
Use this to audit a webpage, form, signup flow, checkout, or any interactive UI
the user has built or pointed you at.

## When to use
- "Review / critique / find problems with this page or flow."
- Before shipping a form, onboarding, checkout, or auth flow.
- After building a UI with another skill — run this as the final gate.
- The user reports "users are dropping off / confused / complaining" and wants
  the cause found.

## Adversarial personas (role-play each)
Walk the UI as each of these and log what fails:
1. **The impatient user** — clicks fast, double-clicks submit, hits back mid-flow,
   reloads, abandons and returns. Does state survive? Double submission? Lost data?
2. **The wrong-input user** — empty fields, absurdly long strings, emoji, leading/
   trailing spaces, wrong format (letters in a phone field), pasted rich text,
   `<script>` and SQL-ish strings. Are inputs validated and sanitized? Are error
   messages clear and specific (not "invalid input")?
3. **The confused first-timer** — no prior context. Is it obvious what to do
   next? Are labels/CTAs self-explanatory? Is jargon unexplained? Where would
   they hesitate or guess wrong?
4. **The keyboard-only / screen-reader user** — no mouse. Can every control be
   reached and operated via Tab/Enter/Space? Is focus visible and ordered
   logically? Do inputs have labels; images have alt; is there a focus trap?
5. **The small-screen / zoomed user** — 320px width, 200% browser zoom. Does
   content reflow, or overflow/clip/overlap? Are tap targets big enough (~44px)?
6. **The poor-connection / error-state user** — slow load, failed request,
   timeout. Are there loading and error states, or does it hang silently? Is
   there a way to recover/retry?
7. **The malicious user** — tries to bypass client-side validation, manipulate
   hidden fields, access without auth. (Flag security gaps; for deep security
   work, hand off — but note anything obvious.)

## Workflow
1. **Get the target.** A sandbox file, a URL, or code you can render. If it's
   code, write it to the sandbox with `write_sandbox_file`.
2. **Exercise it for real with `sandbox_browser`** — don't review from imagination:
   - `goto` the page; `screenshot` the initial state.
   - Drive each persona: fill fields with bad input and submit, click the primary
     action twice, navigate the flow, trigger validation. Screenshot the
     resulting states (errors, empty, success).
   - `screenshot` at desktop (1440) AND small (320/390) widths and check zoom.
   - Use `screenshot_analyze` to inspect rendered states for overlap, clipping,
     missing feedback, illegible contrast.
3. **Probe accessibility concretely.** Inspect the DOM/HTML for: form controls
   without `<label>`/`aria-label`, images without `alt`, buttons that are
   non-semantic `<div>`s, missing focus styles, and color-only signaling. Check
   text contrast against WCAG AA (>= 4.5:1 body). Use `run_python`/`run_node` to
   parse the HTML and flag missing labels/alt at scale if the page is large.
4. **Log every failure mode** as you go (use `todo` to track personas covered so
   none is skipped).
5. **Prioritize and deliver** (see below).

## Findings format (prioritized)
Group findings by severity so the user fixes the right things first:
- **Blocker** — users cannot complete the task or data is lost (broken submit,
  silent failure, inaccessible required control).
- **Major** — significant friction or exclusion (no error messaging, fails on
  mobile, keyboard trap, AA contrast failure on body text).
- **Minor** — polish (unclear label, weak hover state, inconsistent spacing).

For each finding give: the persona/action that exposed it, what happened vs.
what should happen, and a concrete fix. Order within each tier by impact.
Deliver inline for a short review; for a thorough audit write a Markdown report
to the sandbox and share via `get_sandbox_file_url`. Attach or reference the
screenshots that show the broken states.

## Checklist (did you actually test...)
- [ ] Empty / oversized / malformed input on every field.
- [ ] Double-click / rapid submit and back-button mid-flow.
- [ ] Keyboard-only traversal with visible focus.
- [ ] Labels, alt text, semantic controls present.
- [ ] AA contrast on text and interactive elements.
- [ ] 320px width and 200% zoom reflow.
- [ ] Loading, error, empty, and success states all exist.
- [ ] A clear recovery path when something fails.

## Gotchas
- Don't review from imagination — render and interact with the page. Claims
  about behavior you didn't observe are guesses; mark them as such.
- A page that "looks fine" on a 1440 screenshot can be fully broken at 320px or
  for keyboard users. Always test the hostile cases, not just the pretty one.
- Distinguish must-fix blockers from nitpicks; an undifferentiated wall of 40
  issues is as unhelpful as missing them.
- Flag obvious security gaps, but say plainly that this is a UX review, not a
  full security audit.
