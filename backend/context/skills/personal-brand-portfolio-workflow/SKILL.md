---
name: personal-brand-portfolio-workflow
description: Research public web presence and compile a static HTML portfolio into the sandbox, supporting requested design aesthetics and bilingual content.
tags: web, portfolio, html, branding
updated: 2026-05-31T07:31:39.218Z
---

1. **Research**: Use `search_web` to gather current public metrics, bio, services, and social links for the target person or brand.
2. **Design Brief**: If the user requests a specific aesthetic (e.g., Apple-style minimalism, glassmorphism, dark mode), apply it. Otherwise default to clean, responsive, modern design.
3. **Structure**: Generate a single self-contained HTML file (inline CSS/JS) with sections: Hero/Intro, Key Statistics (animated counters), About/Bio, Services/Content Types, and Contact/Social Links.
4. **Localization**: Match the user's communication language; provide bilingual content when the user writes in a non-English language (e.g., Burmese + English).
5. **Build & Verify**: Write the file to sandbox with `write_sandbox_file`. Optionally use `sandbox_browser` to preview.
6. **Delivery**: Generate a temporary download URL with `get_sandbox_file_url`. Include guidance on free hosting (Netlify, GitHub Pages, Vercel) if the user wants to publish it.
