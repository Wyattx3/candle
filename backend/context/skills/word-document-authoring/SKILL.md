---
name: word-document-authoring
description: Build .docx documents with python-docx - headings, paragraph/character styles, tables, inline images, page breaks, and a table-of-contents field.
tags: word, docx, python-docx, document, report
---

# Word Document Authoring

Goal: produce a structured `.docx` — headings, styled paragraphs, tables,
images, and a table of contents — then deliver a sandbox download URL.

## When to use
User wants an editable Word document (`.docx`), a report, a letter, or a
contract draft. For a fixed-layout, print-ready file prefer a PDF
(unicode-pdf-workflow).

## Setup
```
install_packages(manager="pip", packages=["python-docx", "Pillow"])
```
Fetch any images first (`http_request` → `write_sandbox_file` to
`/home/user/img/`).

## Build the document (run_python)
```python
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT

doc = Document()

# --- base style tweaks ---
normal = doc.styles["Normal"]
normal.font.name = "Calibri"; normal.font.size = Pt(11)

# --- title + headings (built-in styles drive the TOC) ---
doc.add_heading("Annual Report 2026", level=0)        # Title
p = doc.add_paragraph("Prepared by Candle - June 2026")
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
doc.add_page_break()

doc.add_heading("1. Overview", level=1)
para = doc.add_paragraph("Revenue grew ")
run = para.add_run("18% year over year"); run.bold = True
run.font.color.rgb = RGBColor(0x1A, 0x7F, 0x37)
para.add_run(", driven by the enterprise tier.")

doc.add_heading("1.1 Methodology", level=2)
doc.add_paragraph("Figures are unaudited.", style="Intense Quote")

# --- bulleted + numbered lists ---
for item in ["APAC launch", "LATAM launch", "New pricing"]:
    doc.add_paragraph(item, style="List Bullet")
for step in ["Collect", "Clean", "Report"]:
    doc.add_paragraph(step, style="List Number")

# --- table with header shading ---
doc.add_heading("2. Numbers", level=1)
data = [("Quarter", "Revenue", "Growth"),
        ("Q1", "$1.2M", "12%"),
        ("Q2", "$1.4M", "18%")]
table = doc.add_table(rows=1, cols=3)
table.style = "Light Grid Accent 1"
table.alignment = WD_TABLE_ALIGNMENT.CENTER
for j, h in enumerate(data[0]):
    cell = table.rows[0].cells[j]
    cell.text = h
    cell.paragraphs[0].runs[0].bold = True
for row in data[1:]:
    cells = table.add_row().cells
    for j, val in enumerate(row):
        cells[j].text = str(val)

# --- inline image ---
doc.add_heading("3. Chart", level=1)
doc.add_picture("/home/user/img/chart.png", width=Inches(5.5))

doc.save("/home/user/report.docx")
print("saved")
```

## Add a real Table of Contents field
python-docx has no high-level TOC API; inject the field XML. The TOC populates
when the user opens the doc and chooses "Update Field" (Word can't compute it
without rendering):
```python
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

def add_toc(doc):
    p = doc.add_paragraph(); r = p.add_run()
    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), r'TOC \o "1-3" \h \z \u')
    t = OxmlElement("w:t"); t.text = "Right-click to update Table of Contents."
    run_el = OxmlElement("w:r"); run_el.append(t); fld.append(run_el)
    p._p.addnext(fld)
```
Call `add_toc(doc)` right after the title, before saving. Heading levels 1-3
(`add_heading(..., level=1..3)`) feed the TOC.

## Gotchas
- TOC entries come from the built-in **Heading 1/2/3** styles — apply them via
  `add_heading(level=n)`, not manual bold text, or the TOC stays empty.
- `add_heading(level=0)` = the document Title style.
- `add_picture` with only `width` keeps aspect ratio (pass one dimension).
- Available table styles depend on the template; "Table Grid",
  "Light Grid Accent 1", "Light List Accent 1" are safe defaults.
- `cell.text = ...` replaces content but resets formatting — style the run
  afterward (as in the header loop).

## Deliver
```
run_terminal("ls -lh /home/user/report.docx")
get_sandbox_file_url(path="/home/user/report.docx")
```
Summarize the section structure, URL on the last line.
