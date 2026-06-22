---
name: pixel-art
description: Generate pixel art and sprites programmatically with PIL — palette, grid placement, and nearest-neighbor upscaling — in run_python, then deliver the PNG.
tags: pixel-art, sprite, pil, retro, game
---

# Pixel Art

## When to use
A user wants a sprite, icon, retro game asset, avatar, tile, or any low-res
"pixel" image. The technique: paint on a small grid (e.g. 16x16 or 32x32) at
1px-per-pixel, then upscale with nearest-neighbor so each logical pixel becomes a
crisp block. Fully programmatic — no image API.

## Setup
```
install_packages: pip install pillow
```

## Steps
1. Define a small palette (hex) and a grid. Either hand-author the grid as rows
   of palette indices, or draw shapes with code.
2. Build with `run_python`:
```python
from PIL import Image

PALETTE = {
    ".": (0, 0, 0, 0),       # transparent
    "K": (20, 20, 30, 255),  # outline
    "R": (220, 60, 60, 255), # red body
    "W": (240, 240, 240, 255),
    "Y": (250, 200, 60, 255),
}
# 16x16 sprite, each char = one pixel
grid = [
    "....KKKK....",
    "..KKRRRRKK..",
    ".KRRRRRRRRK.",
    ".KRWWRRWWRK.",
    ".KRWKR RKWRK".replace(" ",""),  # keep rows equal length!
    ".KRRRRRRRRK.",
    ".KRRYYYYRRK.",
    "..KRRRRRRK..",
    "...KKKKKK...",
]
h = len(grid); w = max(len(r) for r in grid)
img = Image.new("RGBA", (w, h), (0,0,0,0))
for y, row in enumerate(grid):
    for x, ch in enumerate(row):
        img.putpixel((x, y), PALETTE.get(ch, (0,0,0,0)))

# upscale 24x with NEAREST so pixels stay sharp
scale = 24
big = img.resize((w*scale, h*scale), Image.NEAREST)
big.save("/home/user/sprite.png")
print("size", big.size)
```
3. Procedural alternative — draw shapes onto the small grid then upscale:
```python
from PIL import Image, ImageDraw
img = Image.new("RGBA",(32,32),(0,0,0,0)); d = ImageDraw.Draw(img)
d.ellipse([6,6,25,25], fill=(80,160,255,255), outline=(20,40,90,255))
img.resize((32*16,32*16), Image.NEAREST).save("/home/user/sprite.png")
```

## Tips
- Keep palettes tight (4-16 colors) for a true retro feel; reuse the same colors
  across a sprite set for cohesion.
- Add a 1px dark outline around shapes — it reads as classic pixel art.
- For sprite sheets: lay multiple small grids side by side on one canvas before
  upscaling, or paste upscaled sprites into a larger sheet with `img.paste`.
- For animation, render each frame sprite then stitch with ffmpeg (see
  `p5js-sketch` for the ffmpeg gif recipe) using `-vf "fps=8"`.
- ALWAYS upscale with `Image.NEAREST` — `BILINEAR`/`LANCZOS` will blur the
  pixels and ruin the look.

## Verify and deliver
1. `screenshot_analyze` the PNG to confirm the sprite reads correctly and rows
   line up (mismatched row lengths shift columns).
2. `get_sandbox_file_url` on `/home/user/sprite.png`.

## Gotchas
- Every grid row MUST be the same length or pixels misalign — assert it in code.
- Use RGBA + a transparent palette entry for sprites meant to overlay scenes.
- Save the small (pre-upscale) PNG too if the user wants the raw asset for a
  game engine.
