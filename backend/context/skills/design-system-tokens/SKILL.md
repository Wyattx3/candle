---
name: design-system-tokens
description: Define and apply a reusable design-token system (color, spacing, type, radii, shadows) as CSS variables so every component stays consistent and theming is trivial.
tags: design, tokens, css, design-system, theming, consistency
---

# Design System Tokens

## Purpose
Stop hard-coding `#3b82f6` and `16px` in fifty places. A token system is a
single source of truth for design decisions, expressed as named variables.
Change a token once, the whole UI updates. Use this whenever a project has more
than one component/page, needs light+dark themes, or you want consistent output
across multiple files.

## When to use
- Building a multi-section page or multi-page site that must look cohesive.
- The user wants light/dark mode or brand re-theming.
- You're producing several components and want them to match automatically.
- Refactoring a page riddled with magic numbers and one-off colors.

## What a token system contains
Tokens are organized in two layers:
1. **Primitive tokens** — raw values: `--blue-500: #3b82f6`, `--space-4: 16px`.
2. **Semantic tokens** — intent-based aliases that reference primitives:
   `--color-primary: var(--blue-500)`, `--color-text: var(--gray-900)`.
Components reference ONLY semantic tokens. This is what makes theming a
one-line swap.

### Token categories to define
- **Color**: a neutral ramp (`--gray-50` … `--gray-900`), a brand/accent ramp,
  and semantic aliases: `--color-bg`, `--color-surface`, `--color-text`,
  `--color-text-muted`, `--color-border`, `--color-primary`,
  `--color-primary-hover`, `--color-success`, `--color-danger`.
- **Spacing**: a single scale on a 4px base — `--space-1: 4px` … `--space-16:
  64px`. Use these for padding, margin, and gap everywhere.
- **Typography**: `--font-sans`, a modular size scale (`--text-sm` … `--text-4xl`),
  weights (`--font-normal: 400`, `--font-semibold: 600`, `--font-bold: 700`),
  and line-heights (`--leading-tight`, `--leading-normal`).
- **Radii**: `--radius-sm: 6px`, `--radius-md: 12px`, `--radius-full: 9999px`.
- **Shadows**: `--shadow-sm`, `--shadow-md`, `--shadow-lg` (subtle elevation).
- **Motion** (optional): `--transition: 150ms ease`.

## Build steps
1. **Create a tokens file** with `write_sandbox_file`, e.g.
   `/home/user/tokens.css`, defining primitives and semantics under `:root`:
   ```css
   :root {
     /* primitives */
     --gray-50:#fafafa; --gray-100:#f4f4f5; --gray-500:#71717a;
     --gray-900:#18181b; --blue-500:#3b82f6; --blue-600:#2563eb;
     /* spacing (4px base) */
     --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
     --space-6:24px; --space-8:32px; --space-12:48px; --space-16:64px;
     /* type */
     --font-sans:'Inter',system-ui,sans-serif;
     --text-sm:14px; --text-base:16px; --text-lg:20px; --text-xl:25px;
     --text-2xl:31px; --text-4xl:49px;
     --font-normal:400; --font-semibold:600; --font-bold:700;
     --leading-tight:1.15; --leading-normal:1.55;
     /* radii + shadow + motion */
     --radius-sm:6px; --radius-md:12px; --radius-full:9999px;
     --shadow-sm:0 1px 2px rgba(0,0,0,.06);
     --shadow-md:0 4px 12px rgba(0,0,0,.10);
     --transition:150ms ease;
     /* semantic (light) */
     --color-bg:var(--gray-50); --color-surface:#fff;
     --color-text:var(--gray-900); --color-text-muted:var(--gray-500);
     --color-border:var(--gray-100);
     --color-primary:var(--blue-500); --color-primary-hover:var(--blue-600);
   }
   ```
2. **Add a theme override** for dark mode by re-pointing semantic tokens only:
   ```css
   [data-theme="dark"] {
     --color-bg:var(--gray-900); --color-surface:#1f1f23;
     --color-text:var(--gray-50); --color-text-muted:#a1a1aa;
     --color-border:#2a2a30;
   }
   ```
   Toggle with `document.documentElement.dataset.theme`. Primitives never change.
3. **Consume tokens in components** — every value references a token:
   ```css
   .btn{
     background:var(--color-primary); color:#fff;
     padding:var(--space-3) var(--space-6);
     border-radius:var(--radius-md); font-weight:var(--font-semibold);
     box-shadow:var(--shadow-sm); transition:var(--transition);
   }
   .btn:hover{ background:var(--color-primary-hover); }
   ```
4. **Link the tokens file** (`<link rel="stylesheet" href="tokens.css">`) or
   inline it at the top of a self-contained page. For multi-file projects keep
   `tokens.css` separate and import it everywhere.
5. **Verify consistency**: render the page with `sandbox_browser` screenshot,
   then flip `data-theme` and re-screenshot dark mode. Confirm nothing uses a
   raw hex/px that didn't update.
6. **Deliver** the token file and/or page via `get_sandbox_file_url`. Document
   the token names so the user can extend them.

## Principles & checklist
- [ ] Components reference semantic tokens, never primitives or raw values.
- [ ] One spacing scale, one type scale — no orphan magic numbers.
- [ ] Theme switches touch ONLY semantic tokens.
- [ ] Token names describe intent (`--color-danger`) not appearance
      (`--color-red`) for semantics; primitives can be appearance-named.
- [ ] Keep the set small. A bloated token list is as bad as none.

## Gotchas
- Don't create a semantic token for every one-off; reserve them for values used
  in 2+ places or that vary by theme.
- If you also use Tailwind/NativeWind, map tokens into the Tailwind config
  rather than maintaining two parallel systems.
- Remember Candle's app uses NativeWind 4 + Tailwind 3 — for the React Native
  client, express tokens in `tailwind.config.js` theme; CSS variables are for
  HTML artifacts rendered in the sandbox.

## Reusing across runs
Persist a token palette the user likes with `store_memory`
(category `user_preference`) so future pages start from their brand system
instead of re-deriving it.
