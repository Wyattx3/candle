---
name: svg-graphics
description: Author SVG vector graphics (icons, logos, simple diagrams) as markup, then rasterize to PNG via cairosvg or sandbox_browser screenshot, and deliver both files.
tags: svg, vector, icon, logo, graphics
---

# SVG Vector Graphics

## When to use
A user wants a scalable vector asset: an icon, a logo, a badge, a simple
illustration, or a hand-tuned diagram. SVG is resolution-independent and
text-editable. You write the markup directly, then provide a PNG raster so the
user can preview it anywhere.

## Setup
Two rasterization paths — install whichever you use.
```
install_packages: pip install cairosvg   # fast, no browser
# OR rely on sandbox_browser (Chromium) for full CSS/filter support
```

## Step 1 — Write the SVG
`write_sandbox_file` to `/home/user/art.svg`. Set an explicit `viewBox` so it
scales cleanly. Build from primitives: `rect`, `circle`, `ellipse`, `path`,
`line`, `polygon`, `text`, plus `linearGradient`/`radialGradient` for fills.
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff8a00"/>
      <stop offset="1" stop-color="#e52e71"/>
    </linearGradient>
  </defs>
  <rect width="200" height="200" rx="40" fill="url(#g)"/>
  <circle cx="100" cy="80" r="34" fill="#fff"/>
  <path d="M60 140 Q100 110 140 140" stroke="#fff" stroke-width="10"
        fill="none" stroke-linecap="round"/>
  <text x="100" y="180" text-anchor="middle" font-family="sans-serif"
        font-size="20" fill="#fff" font-weight="bold">CANDLE</text>
</svg>
```

## Step 2 — Rasterize to PNG
Path A (cairosvg, headless, fast):
```python
import cairosvg
cairosvg.svg2png(url="/home/user/art.svg", write_to="/home/user/art.png",
                 output_width=800, output_height=800)
```
Run with `run_python`. Scale up `output_width` for high-res.

Path B (sandbox_browser, full fidelity for filters/CSS): write an HTML page that
embeds or `<img>`s the SVG, `sandbox_browser` goto the `file://` URL, then
`screenshot` to PNG. Use this when the SVG uses advanced filters/effects that
cairosvg doesn't support.

## Design tips
- Use `viewBox` (not just width/height) so the art scales without distortion.
- Reuse colors via gradients/`defs`; keep a tight palette for logos.
- `stroke-linecap="round"` and `stroke-linejoin="round"` look more polished.
- For icons, design on a square viewBox (e.g. `0 0 24 24`) following common icon
  grid conventions.
- Center text with `text-anchor="middle"`; vertical centering needs
  `dominant-baseline="middle"`.

## Verify and deliver
1. `screenshot_analyze` the PNG to confirm shapes render and nothing is clipped
   by the viewBox.
2. `get_sandbox_file_url` on BOTH `/home/user/art.svg` (editable vector) and
   `/home/user/art.png` (preview raster).

## Gotchas
- cairosvg has limited support for SVG filters/blend modes and web fonts — use
  the browser path for those.
- Fonts: reference common families (`sans-serif`, `serif`, `monospace`) or
  convert text to paths if exact typography matters across machines.
- Always declare the `xmlns` attribute or some renderers refuse the file.
- Keep `viewBox` and content coordinates consistent — mismatches cause unexpected
  cropping or tiny graphics.
