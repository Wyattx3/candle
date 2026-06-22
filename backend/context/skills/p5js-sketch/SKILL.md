---
name: p5js-sketch
description: Write a generative-art p5.js sketch, run it in a headless HTML page, capture the canvas with sandbox_browser, and optionally stitch frames into a gif/mp4 with ffmpeg.
tags: generative, p5js, canvas, animation, art
---

# p5.js Generative Sketch

## When to use
A user wants generative/creative coding art: flow fields, particle systems,
noise landscapes, fractals, animated patterns, or any algorithmic visual. p5.js
is ideal because it runs in the browser and `sandbox_browser` can render and
screenshot it. Produce a still PNG, a multi-frame sequence, or a stitched
gif/mp4.

## Setup
ffmpeg is only needed if you stitch frames into a video/gif.
```
install_packages: apt install -y ffmpeg
```
p5.js loads from a CDN inside the HTML page — no install needed.

## Step 1 — Write the sketch HTML
`write_sandbox_file` to `/home/user/sketch.html`. Load p5 from CDN, draw to a
canvas, and expose a frame-capture hook. Use a fixed seed for reproducibility.
```html
<!doctype html><html><head><meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/p5@1.9.0/lib/p5.min.js"></script>
<style>html,body{margin:0;background:#0b0b12}</style></head><body>
<script>
let t = 0;
function setup(){ createCanvas(800, 800); noiseSeed(42); randomSeed(42); }
function draw(){
  background(11,11,18,18);
  stroke(180,200,255,60); noFill();
  for(let i=0;i<400;i++){
    let x = noise(i*0.01, t)*width;
    let y = noise(i*0.01, t+100)*height;
    ellipse(x, y, 3, 3);
  }
  t += 0.005;
  // signal frame number for capture loops
  window.__frame = (window.__frame||0) + 1;
}
</script></body></html>
```

## Step 2a — Single still
1. `sandbox_browser` goto `file:///home/user/sketch.html`.
2. Wait ~1-2s for the canvas to develop (animated sketches build up over frames).
3. `screenshot` the canvas to `/home/user/sketch.png`.

## Step 2b — Frame sequence -> gif/mp4
Capture N frames by repeatedly screenshotting, or have the sketch save frames
itself. Simplest robust approach: screenshot in a loop.
1. `sandbox_browser` goto the file URL.
2. Loop: wait ~100ms, `screenshot` to `/home/user/frames/f0001.png`,
   `f0002.png`, ... (zero-pad so ffmpeg orders them correctly). Create the dir
   first with `manage_sandbox_files` or `run_terminal: mkdir -p /home/user/frames`.
3. Stitch with `run_terminal`:
```
# mp4
ffmpeg -y -framerate 30 -i /home/user/frames/f%04d.png -c:v libx264 -pix_fmt yuv420p /home/user/sketch.mp4
# gif (palette for quality)
ffmpeg -y -i /home/user/frames/f%04d.png -vf "fps=20,scale=600:-1:flags=lanczos,palettegen" /home/user/pal.png
ffmpeg -y -i /home/user/frames/f%04d.png -i /home/user/pal.png -lavfi "fps=20,scale=600:-1:flags=lanczos[x];[x][1:v]paletteuse" /home/user/sketch.gif
```

## Step 3 — Verify and deliver
1. `screenshot_analyze` the PNG (or extract a frame from the mp4) to confirm the
   visual looks intentional, not blank.
2. `get_sandbox_file_url` on the PNG/gif/mp4. Offer the `.html` so the user can
   re-run or tweak parameters.

## Gotchas
- Always seed (`randomSeed`/`noiseSeed`) so reruns are reproducible.
- Translucent `background(...,alpha)` creates trails; opaque clears each frame.
- Give animated sketches a few frames to develop before the still screenshot.
- Keep canvas <= ~1000px and frame count modest (60-150) to control render time.
- Screenshot the canvas element specifically if the page has padding/margins.
