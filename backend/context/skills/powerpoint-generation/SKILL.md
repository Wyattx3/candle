---
name: powerpoint-generation
description: Build a .pptx slide deck programmatically with python-pptx - title, content, image, and section slides with layouts, formatting, and speaker notes.
tags: powerpoint, pptx, presentation, python-pptx, python
---

# PowerPoint Generation

Goal: produce a polished `.pptx` deck from an outline or supplied content, then
deliver a sandbox download URL.

## When to use
User asks for "a presentation", "slides", "a deck", or a `.pptx`. If they only
need a one-page styled document, prefer a PDF (see unicode-pdf-workflow).

## Setup
```
install_packages(manager="pip", packages=["python-pptx", "Pillow"])
```
If slides need images from the web, fetch them first with `http_request` and
`write_sandbox_file` to `/home/user/img/`.

## Build the deck (run_python)

Work from a content outline (a Python list of slide dicts). This keeps the code
readable and easy to extend.

```python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

ACCENT = RGBColor(0x1A, 0x7F, 0x37)
prs = Presentation()                 # 4:3; for 16:9 set slide size below
prs.slide_width  = Inches(13.333)
prs.slide_height = Inches(7.5)

# --- Title slide (layout 0) ---
s = prs.slides.add_slide(prs.slide_layouts[0])
s.shapes.title.text = "Quarterly Review"
s.placeholders[1].text = "Q2 2026 - Prepared by Candle"

# --- Bulleted content slide (layout 1) ---
def content_slide(title, bullets, notes=""):
    s = prs.slides.add_slide(prs.slide_layouts[1])
    s.shapes.title.text = title
    tf = s.placeholders[1].text_frame
    tf.clear()
    for i, (text, level) in enumerate(bullets):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.text = text; p.level = level
        p.font.size = Pt(20 if level == 0 else 16)
    if notes:
        s.notes_slide.notes_text_frame.text = notes   # speaker notes
    return s

content_slide("Highlights",
    [("Revenue up 18% YoY", 0),
     ("New markets: APAC, LATAM", 0),
     ("Driven by enterprise tier", 1)],
    notes="Lead with the revenue number, then geography.")

# --- Image slide (blank layout 6, full-bleed image + caption) ---
s = prs.slides.add_slide(prs.slide_layouts[6])
s.shapes.add_picture("/home/user/img/chart.png", Inches(1), Inches(1),
                     height=Inches(5))
tb = s.shapes.add_textbox(Inches(1), Inches(6.2), Inches(11), Inches(0.8))
tb.text_frame.text = "Figure 1: revenue by region"

# --- Section header slide (layout 2) ---
s = prs.slides.add_slide(prs.slide_layouts[2])
s.shapes.title.text = "Roadmap"

# --- Accent the title bar on every slide ---
for s in prs.slides:
    if s.shapes.title and s.shapes.title.has_text_frame:
        for p in s.shapes.title.text_frame.paragraphs:
            p.font.color.rgb = ACCENT; p.font.bold = True

prs.save("/home/user/deck.pptx")
print("slides:", len(prs.slides._sldIdLst))
```

### Standard layout indexes (default template)
- `0` Title, `1` Title+Content, `2` Section Header, `3` Two Content,
  `5` Title Only, `6` Blank. Use `6` when you want full manual control.

## Gotchas
- `text_frame.clear()` leaves one empty paragraph — reuse it for the first
  bullet (the `i == 0` branch above) instead of adding a stray blank line.
- Adding a picture with both width and height distorts aspect ratio; set ONE.
- Speaker notes: access `slide.notes_slide` lazily — it's created on first use.
- Bullet levels go 0-4; anything deeper is ignored.
- For many slides, build the outline list first, then loop — don't copy-paste
  per slide.

## Deliver
```
run_terminal("ls -lh /home/user/deck.pptx")
get_sandbox_file_url(path="/home/user/deck.pptx")
```
Summarize the deck (slide count + section titles) and put the URL on the last
line.
