---
name: document-format-conversion
description: Convert documents between formats (md, docx, html, pdf, odt, rtf, epub) using pandoc and LibreOffice headless in the sandbox.
tags: conversion, pandoc, libreoffice, docx, pdf, markdown
---

# Document Format Conversion

Goal: convert a document from one format to another — Markdown ↔ DOCX ↔ HTML ↔
PDF, plus ODT/RTF/EPUB — using `pandoc` and LibreOffice headless. Deliver the
converted file via a sandbox URL.

## Pick the right engine
- **pandoc** — text-centric formats: md, html, docx, rst, epub, latex, odt.
  Fast, scriptable, great for md↔docx↔html.
- **LibreOffice headless (`soffice`)** — Office formats and anything→PDF that
  must preserve Office layout (docx→pdf, pptx→pdf, xlsx→pdf, odt→docx).

## Setup
```
install_packages(manager="apt", packages=["pandoc", "libreoffice"])
```
For PDF output **from pandoc** you also need a LaTeX engine OR route through
HTML; LibreOffice avoids LaTeX entirely (preferred for docx→pdf). Verify:
```
run_terminal("pandoc --version | head -1 && soffice --version")
```
Fetch the source file if remote (`http_request` → `write_sandbox_file`).

## pandoc conversions (run_terminal)
```
# Markdown -> DOCX
run_terminal("pandoc /home/user/in.md -o /home/user/out.docx")

# Markdown -> standalone HTML (self-contained, inlines CSS/images)
run_terminal("pandoc /home/user/in.md -s --embed-resources -o /home/user/out.html")

# DOCX -> Markdown (extract embedded images to a folder)
run_terminal("pandoc /home/user/in.docx --extract-media=/home/user/media -t gfm -o /home/user/out.md")

# HTML -> DOCX
run_terminal("pandoc /home/user/in.html -o /home/user/out.docx")
```
Useful flags: `--toc` (table of contents), `-s` (standalone, full document),
`--reference-doc=template.docx` (style the DOCX from a template),
`--metadata title="..."`.

## LibreOffice conversions (run_terminal)
`soffice --headless --convert-to <fmt> --outdir <dir> <input>`:
```
# DOCX -> PDF (layout-faithful, no LaTeX needed)
run_terminal("soffice --headless --convert-to pdf --outdir /home/user /home/user/in.docx")

# PPTX -> PDF
run_terminal("soffice --headless --convert-to pdf --outdir /home/user /home/user/deck.pptx")

# XLSX -> PDF / ODT -> DOCX
run_terminal("soffice --headless --convert-to docx --outdir /home/user /home/user/in.odt")
```
Output filename = input basename with the new extension, written to `--outdir`.

## Markdown -> PDF (two good paths)
1. **Via LibreOffice** (simplest): `pandoc in.md -o tmp.docx` then
   `soffice --headless --convert-to pdf --outdir /home/user tmp.docx`.
2. **Via Chromium** (best for CSS-styled or non-Latin text): convert md→html
   with pandoc, then use the **unicode-pdf-workflow** skill to print the HTML
   to PDF (correct text shaping for Burmese/CJK/Thai/Arabic).

## Gotchas
- **Non-Latin text in PDF**: pandoc's default LaTeX PDF route drops/garbles
  Burmese/CJK glyphs. Use the LibreOffice or Chromium route instead and defer
  to unicode-pdf-workflow when scripts are complex.
- LibreOffice may exit 0 but write nothing if a **headless lock** lingers; if
  output is missing, add `-env:UserInstallation=file:///tmp/lo` to isolate the
  profile and retry.
- `soffice` can be slow on first run (profile init) — allow a longer timeout.
- pandoc won't embed remote images into HTML unless you pass
  `--embed-resources --standalone`.
- Converting to Markdown loses complex layout (multi-column, text boxes) — that
  is expected, not a bug.

## Deliver
```
run_terminal("ls -lh /home/user/out.pdf && file /home/user/out.pdf")
get_sandbox_file_url(path="/home/user/out.pdf")
```
State the source→target formats and any fidelity caveats, URL on the last line.
