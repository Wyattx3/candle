---
name: manim-animation
description: Create math and explainer animations with Manim in the E2B sandbox, render to MP4 via run_terminal, and deliver the video.
tags: animation, manim, math, video, explainer
---

# Manim Animation

## When to use
A user wants an animated explainer: a math concept (transforms, graphs,
equations morphing), an algorithm walkthrough, a physics demo, or any
scene-by-scene motion graphic. Manim renders deterministic, code-defined
animations to MP4. (For generative/creative motion use `p5js-sketch`; for
quick stitched frames use ffmpeg directly.)

## Setup
Manim needs system libs plus the Python package.
```
install_packages: apt install -y ffmpeg libcairo2-dev libpango1.0-dev pkg-config python3-dev
install_packages: pip install manim
```
Verify with `run_terminal: manim --version`.

## Steps
1. Write the scene to `/home/user/scene.py` with `write_sandbox_file`. One class
   per scene, subclassing `Scene`; put the animation in `construct`:
```python
from manim import *

class Intro(Scene):
    def construct(self):
        title = Text("Pythagoras", font_size=48)
        self.play(Write(title))
        self.wait(0.5)
        self.play(title.animate.to_edge(UP))
        eq = MathTex(r"a^2 + b^2 = c^2")
        self.play(FadeIn(eq, shift=UP))
        self.wait(1)
        tri = Polygon([-2,-1,0],[2,-1,0],[2,2,0], color=BLUE)
        self.play(Create(tri))
        self.wait(2)
```
2. Render with `run_terminal`. Quality flags: `-ql` (low/fast, 480p) for drafts,
   `-qh` (high, 1080p) for final:
```
run_terminal: cd /home/user && manim -qh -o final scene.py Intro
```
3. Manim writes to `/home/user/media/videos/scene/1080p60/final.mp4`. Find the
   exact path with `list_sandbox_files` on `/home/user/media/videos/`.
4. Optionally copy it to a clean path:
   `run_terminal: cp /home/user/media/videos/scene/1080p60/final.mp4 /home/user/animation.mp4`.

## Useful patterns
- **Graphs**: `ax = Axes(...)`, `ax.plot(lambda x: x**2)`, animate with
  `self.play(Create(graph))`.
- **Morph**: `self.play(Transform(obj_a, obj_b))`.
- **Highlight/move**: `self.play(obj.animate.shift(RIGHT).set_color(YELLOW))`.
- **Sequence pacing**: separate `self.play(...)` calls with `self.wait(t)`.
- Render a single frame as a still (`-s` flag) to debug layout fast before the
  full render.

## Verify and deliver
1. Extract a thumbnail to eyeball it without playing the whole clip:
   `run_terminal: ffmpeg -y -i /home/user/animation.mp4 -vframes 1 /home/user/thumb.png`,
   then `screenshot_analyze` the thumb.
2. `get_sandbox_file_url` on the MP4.

## Gotchas
- First-time render is slow (LaTeX + cairo init). Use `-ql` while iterating, then
  one final `-qh` pass.
- `MathTex`/`Tex` need a LaTeX install; if they fail, also
  `apt install -y texlive texlive-latex-extra dvisvgm` (large download — only if
  the scene uses LaTeX).
- Keep total scene under ~30s for reasonable render time and file size.
- Class name passed on the CLI must exactly match the `Scene` subclass.
