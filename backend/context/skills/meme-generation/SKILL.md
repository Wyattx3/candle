---
name: meme-generation
description: Create memes by overlaying top/bottom Impact-font captions on a base image with PIL; source the base via http_request/browse_web; deliver a PNG.
tags: meme, image, pil, text-overlay, humor
---

# Meme Generation

## When to use
A user wants a classic captioned meme: a base image with bold white
top/bottom text in the Impact look (black outline). Fully programmatic with
PIL — no image-generation API. You source a base image from the web (or the
user provides one) and overlay text.

## Setup
```
install_packages: pip install pillow
# Impact-style font: install a free clone, or use a bundled bold font
install_packages: apt install -y fonts-dejavu-core
```
For a true Impact look, fetch an Impact-style font file (e.g. "Anton" or an
Impact clone) with `http_request` to `/home/user/impact.ttf`. Otherwise fall
back to `DejaVuSans-Bold.ttf`.

## Step 1 — Get the base image
- User-provided: use their file path.
- From the web: `search_web` for the template, `browse_web` to find a direct
  image URL, then `http_request` (GET, save bytes) to `/home/user/base.jpg`.
  Verify it downloaded with `list_sandbox_files`.

## Step 2 — Overlay captions
`run_python`:
```python
from PIL import Image, ImageDraw, ImageFont

img = Image.open("/home/user/base.jpg").convert("RGB")
W, H = img.size
draw = ImageDraw.Draw(img)

def load_font(size):
    for p in ["/home/user/impact.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]:
        try: return ImageFont.truetype(p, size)
        except OSError: pass
    return ImageFont.load_default()

def draw_caption(text, y_anchor):  # y_anchor: "top" or "bottom"
    text = text.upper()
    size = max(20, W // 12)
    font = load_font(size)
    # shrink to fit width
    while draw.textlength(text, font=font) > W * 0.92 and size > 14:
        size -= 2; font = load_font(size)
    tw = draw.textlength(text, font=font)
    x = (W - tw) / 2
    y = 10 if y_anchor == "top" else H - size - 20
    # black outline + white fill
    draw.text((x, y), text, font=font, fill="white",
              stroke_width=max(2, size//12), stroke_fill="black")

draw_caption("ONE DOES NOT SIMPLY", "top")
draw_caption("WRITE A MEME WITHOUT PIL", "bottom")
img.save("/home/user/meme.png")
print(img.size)
```

## Tips
- Always UPPERCASE the caption text — it's the meme convention.
- Scale font to image width (`W // 12`) and shrink-to-fit so long captions don't
  overflow. Wrap to two lines for very long text by splitting on a space near the
  midpoint.
- The black `stroke_fill` outline is essential for legibility over busy images.
- Center horizontally; pin top text near the top edge and bottom text near the
  bottom edge.

## Verify and deliver
1. `screenshot_analyze` the PNG to confirm text is readable and positioned right.
2. `get_sandbox_file_url` on `/home/user/meme.png`.

## Gotchas
- If the web image is a webpage, not a direct file, the bytes won't be a valid
  image — find the real image URL (`.jpg`/`.png`) first.
- Respect content limits: decline requests to make harassing, hateful, or
  defamatory memes targeting real individuals.
- `ImageFont.load_default()` is tiny and not bold — always try a TTF first.
