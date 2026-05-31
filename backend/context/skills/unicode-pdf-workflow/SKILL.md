---
name: unicode-pdf-workflow
description: Make a PDF containing Myanmar/CJK/Thai/Arabic/emoji text correctly via Chromium HTML-to-PDF.
tags: pdf, myanmar, unicode, cjk, document, report
---

# Unicode PDF Workflow (non-Latin text)

Goal: produce a correctly-rendered PDF when the content contains **non-Latin
script** — Burmese (မြန်မာ), Chinese/Japanese/Korean, Thai, Arabic, Devanagari,
emoji, etc. Deliver a sandbox download URL.

## Why NOT fpdf2 / reportlab

`fpdf2` and `reportlab` do NOT do complex-script text shaping. For Burmese and
other Indic/SEA scripts the glyphs render in the WRONG ORDER (stacked vowels and
medials misplaced), and they fail outright if the embedded TTF lacks the glyphs.
Do **not** loop trying different fonts with these libraries — switch approach.

## The reliable approach: Chromium print-to-PDF

The sandbox already has Chromium (via Playwright) and Noto fonts. A browser has
a real text-shaping engine (HarfBuzz), so it renders EVERY script correctly.
Build an HTML file, then print it to PDF headless.

## Steps

1. **Write the content as HTML** with `write_sandbox_file` to
   `/home/user/doc.html`. Put the real text in the body. Use a broad font
   stack so glyphs resolve no matter which Noto fonts the image has — and
   include `Unifont` as a universal last-resort fallback (it covers Myanmar +
   most of Unicode and is always present):
   ```html
   <!doctype html><html><head><meta charset="utf-8">
   <style>
     @page { size: A4; margin: 18mm; }
     body { font-family: "Noto Sans Myanmar", "Padauk", "Noto Sans",
            "Noto Sans CJK SC", "Noto Color Emoji", "Unifont", sans-serif;
            font-size: 14px; line-height: 1.8; color: #111; }
     h1 { color: #1a7f37; } h2 { color: #1a7f37; margin-top: 1.2em; }
     code, pre { font-family: monospace; background:#f4f4f4; padding:2px 4px; }
   </style></head><body>
   <!-- real content here, e.g. <h1>Minecraft ဆော့နည်း</h1><p>...</p> -->
   </body></html>
   ```
2. **Print to PDF with Playwright** via `run_python`:
   ```python
   from playwright.sync_api import sync_playwright
   with sync_playwright() as p:
       b = p.chromium.launch(args=["--no-sandbox"])
       pg = b.new_page()
       pg.goto("file:///home/user/doc.html", wait_until="networkidle")
       pg.pdf(path="/home/user/output.pdf", format="A4",
              print_background=True,
              margin={"top":"18mm","bottom":"18mm","left":"14mm","right":"14mm"})
       b.close()
   print("PDF created: /home/user/output.pdf")
   ```
   If Chromium complains about browser binaries, set
   `PLAYWRIGHT_BROWSERS_PATH=/usr/local/share/ms-playwright` in the env, or run
   `python3 -m playwright install chromium` once via `run_terminal`.
3. **Verify** with `run_terminal "ls -lh /home/user/output.pdf && file /home/user/output.pdf"` —
   confirm it exists and reports `PDF document`.
4. **Deliver** with `get_sandbox_file_url(path="/home/user/output.pdf")`. Put the
   link at the END of the reply.

## Notes

- This same HTML→Chromium path is the best way to make ANY styled PDF
  (reports, invoices, decks-as-pages), not just non-Latin ones.
- For long content, build the HTML string in Python and write it, rather than
  hand-typing a huge HTML literal.
- Reuse one Chromium launch for multiple PDFs if generating several.
