---
name: pdf-editing
description: Manipulate existing PDFs in the sandbox - split, merge subsets, rotate, extract pages/text/tables, watermark, and fill simple forms with pypdf and pdfplumber.
tags: pdf, document, pypdf, pdfplumber, python
---

# PDF Editing & Manipulation

Goal: take one or more existing PDFs and **transform** them — split, merge,
rotate, extract text/tables, watermark, or fill a simple AcroForm. Deliver the
result as a sandbox download URL.

> For creating a NEW PDF whose content is non-Latin (Burmese / CJK / Thai /
> Arabic / emoji), do NOT use this skill — run `skill_view` on
> **unicode-pdf-workflow** instead (Chromium HTML→PDF handles text shaping).
> This skill is about manipulating PDFs that already exist.

## Setup

Install the libraries first:
```
install_packages(manager="pip", packages=["pypdf", "pdfplumber", "reportlab"])
```
- `pypdf` — page-level ops (split / merge / rotate / watermark / forms).
- `pdfplumber` — text and table extraction.
- `reportlab` — generate an overlay (for watermarks) on the fly.

If the source PDF is on the web, fetch it first with
`http_request(url=..., method="GET")` or `browse_web`, then
`write_sandbox_file` the bytes to `/home/user/in.pdf`. Confirm with
`run_terminal("file /home/user/in.pdf")`.

## Common operations (all via run_python)

### Split into single pages
```python
from pypdf import PdfReader, PdfWriter
r = PdfReader("/home/user/in.pdf")
for i, page in enumerate(r.pages):
    w = PdfWriter(); w.add_page(page)
    with open(f"/home/user/page_{i+1}.pdf", "wb") as f: w.write(f)
print("pages:", len(r.pages))
```

### Extract a page subset (e.g. pages 3-7, 1-indexed inclusive)
```python
from pypdf import PdfReader, PdfWriter
r = PdfReader("/home/user/in.pdf"); w = PdfWriter()
for p in r.pages[2:7]:      # 0-indexed slice
    w.add_page(p)
with open("/home/user/subset.pdf", "wb") as f: w.write(f)
```

### Merge multiple PDFs
```python
from pypdf import PdfWriter
w = PdfWriter()
for path in ["/home/user/a.pdf", "/home/user/b.pdf", "/home/user/c.pdf"]:
    w.append(path)
with open("/home/user/merged.pdf", "wb") as f: w.write(f)
```

### Rotate pages
```python
from pypdf import PdfReader, PdfWriter
r = PdfReader("/home/user/in.pdf"); w = PdfWriter()
for p in r.pages:
    p.rotate(90)            # 90 / 180 / 270, clockwise
    w.add_page(p)
with open("/home/user/rotated.pdf", "wb") as f: w.write(f)
```

### Extract text
```python
import pdfplumber
out = []
with pdfplumber.open("/home/user/in.pdf") as pdf:
    for pg in pdf.pages:
        out.append(pg.extract_text() or "")
open("/home/user/extracted.txt", "w", encoding="utf-8").write("\n\n".join(out))
```
If `extract_text()` returns empty/None, the PDF is scanned (image-only) —
switch to the **ocr-documents** skill (`skill_view`).

### Extract tables to CSV
```python
import pdfplumber, csv
with pdfplumber.open("/home/user/in.pdf") as pdf:
    n = 0
    for pg in pdf.pages:
        for tbl in pg.extract_tables():
            n += 1
            with open(f"/home/user/table_{n}.csv", "w", newline="", encoding="utf-8") as f:
                csv.writer(f).writerows(tbl)
print("tables:", n)
```

### Add a watermark (overlay every page)
```python
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from pypdf import PdfReader, PdfWriter

# 1) build a one-page watermark
c = canvas.Canvas("/home/user/wm.pdf", pagesize=A4)
c.setFont("Helvetica-Bold", 60); c.setFillGray(0.5, 0.3)
c.saveState(); c.translate(300, 400); c.rotate(45)
c.drawCentredString(0, 0, "CONFIDENTIAL"); c.restoreState(); c.save()

# 2) merge it onto each page
wm = PdfReader("/home/user/wm.pdf").pages[0]
r = PdfReader("/home/user/in.pdf"); w = PdfWriter()
for p in r.pages:
    p.merge_page(wm); w.add_page(p)
with open("/home/user/watermarked.pdf", "wb") as f: w.write(f)
```

### Fill a simple AcroForm
```python
from pypdf import PdfReader, PdfWriter
r = PdfReader("/home/user/form.pdf"); w = PdfWriter()
w.append(r)
w.update_page_form_field_values(
    w.pages[0], {"full_name": "Jane Doe", "email": "jane@example.com"}
)
with open("/home/user/filled.pdf", "wb") as f: w.write(f)
```
Inspect field names first: `print([f for f in (r.get_fields() or {})])`.
If `get_fields()` is empty the PDF has no real form fields — overlay text with
reportlab at fixed coordinates instead.

## Gotchas
- pypdf slices are 0-indexed; humans speak 1-indexed. Convert carefully.
- Encrypted PDFs: `reader.decrypt("")` (empty pw) or the real password first.
- `merge_page` mutates the page in place — add it to the writer after merging.
- Large PDFs: process page-by-page, don't hold everything in memory.

## Deliver
Verify, then hand back the URL as the LAST line of the reply:
```
run_terminal("ls -lh /home/user/merged.pdf")
get_sandbox_file_url(path="/home/user/merged.pdf")
```
