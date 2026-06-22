---
name: ascii-art
description: Generate ASCII art, banners, and diagrams from text or images using pyfiglet and PIL luminance mapping in run_python, then deliver the result.
tags: ascii, art, text, banner, image
---

# ASCII Art Generation

## When to use
A user wants a text banner, a logo rendered as ASCII, an "ASCII-fied" photo, or
plain-text art for a README, terminal splash, comment block, or chat message.
No image-generation API is needed — everything is programmatic in the sandbox.

## Setup
Install the libraries first.
```
install_packages: pip install pyfiglet pillow
```
`pyfiglet` ships hundreds of fonts; `pillow` handles image-to-ASCII.

## Path A — Text banners (fast, most common)
1. Pick a font. Good ones: `standard`, `slant`, `big`, `block`, `banner3-D`,
   `doom`, `larry3d`, `ogre`. List them with `pyfiglet.FigletFont.getFonts()`.
2. Render with `run_python`:
```python
import pyfiglet
art = pyfiglet.figlet_format("CANDLE", font="slant")
print(art)
open("/home/user/banner.txt", "w").write(art)
```
3. For wide text, use `width=200` in `figlet_format` to avoid wrapping.
4. Write the chosen output to a file with `write_sandbox_file` (or the inline
   `open(...).write` above) so you can deliver it.

## Path B — Image to ASCII
Map pixel luminance to a ramp of characters (dark→light).
1. Acquire the source image (user upload, or fetch via `http_request` /
   `browse_web` and save bytes to `/home/user/src.png`).
2. Run:
```python
from PIL import Image
RAMP = "@%#*+=-:. "            # dense -> sparse
img = Image.open("/home/user/src.png").convert("L")
W = 100                          # output columns; keep <=120 for chat
# chars are ~2x taller than wide, so squash height
h = max(1, int(img.height / img.width * W * 0.5))
img = img.resize((W, h))
px = img.getdata()
n = len(RAMP)
rows = ["".join(RAMP[min(n-1, p * n // 256)] for p in px[i:i+W])
        for i in range(0, len(px), W)]
out = "\n".join(rows)
open("/home/user/ascii.txt", "w").write(out)
print(out[:2000])
```
3. Tune: invert the ramp (`RAMP[::-1]`) for dark-on-light terminals; raise `W`
   for more detail; pre-crop/contrast-stretch (`ImageOps.autocontrast`) for
   photos that look muddy.

## Path C — Box / banner diagrams
For labeled boxes or simple flow banners, build them with string padding rather
than a library — it gives precise control:
```python
def box(label):
    w = len(label) + 2
    return f"+{'-'*w}+\n| {label} |\n+{'-'*w}+"
print(box("START"))
```

## Render-as-image option
If the user wants a PNG of the ASCII (e.g. colored, for a slide), write the text
into an HTML `<pre>` with a monospace font and dark background, then screenshot:
write `/home/user/ascii.html`, `sandbox_browser` goto
`file:///home/user/ascii.html`, screenshot to PNG.

## Deliver
- Plain text: paste it directly into the reply inside a fenced code block AND
  save the `.txt`, then call `get_sandbox_file_url` on it.
- PNG render: `get_sandbox_file_url` on the screenshot.

## Gotchas
- Keep banner width <= the user's likely terminal (80–120 cols).
- Monospace is mandatory when rendering to image — pick `Courier`, `DejaVu Sans
  Mono`, or `monospace`.
- Very tall image→ASCII output floods chat; cap rows and offer the file link.
