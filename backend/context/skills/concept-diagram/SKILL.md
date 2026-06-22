---
name: concept-diagram
description: Build flowcharts, mind maps, sequence diagrams, and concept maps with Mermaid or graphviz, then render to PNG/SVG and deliver.
tags: diagram, flowchart, mindmap, sequence, mermaid
---

# Concept Diagram

## When to use
A user wants to visualize an idea or process: a flowchart of a decision, a mind
map of a topic, a sequence diagram of an interaction, an org/concept map, a
state machine, or an ER diagram. This covers explanatory diagrams (vs.
infrastructure — for that use `architecture-diagram`).

## Engine choice
- **Mermaid** — covers the widest set of explanatory diagram types out of the
  box: `flowchart`, `sequenceDiagram`, `mindmap`, `stateDiagram-v2`,
  `erDiagram`, `journey`, `gantt`, `classDiagram`. Default choice.
- **graphviz** — when you need fine layout control or non-Mermaid styling.

## Setup
```
install_packages: npm install -g @mermaid-js/mermaid-cli
install_packages: apt install -y graphviz
```

## Diagram type cookbook (Mermaid)
Write the source to `/home/user/diagram.mmd` with `write_sandbox_file`.

Flowchart:
```
flowchart TD
  A[Start] --> B{Logged in?}
  B -- yes --> C[Dashboard]
  B -- no --> D[Login] --> B
```
Sequence:
```
sequenceDiagram
  participant U as User
  participant S as Server
  U->>S: POST /login
  S-->>U: 200 + token
```
Mind map:
```
mindmap
  root((Candle))
    Memory
      Conversation
      Skills
      Episodic
    Tools
      Sandbox
      Web
```
State machine:
```
stateDiagram-v2
  [*] --> Idle
  Idle --> Running: start
  Running --> Done: finish
  Done --> [*]
```

## Render
Preferred, headless:
```
run_terminal: mmdc -i /home/user/diagram.mmd -o /home/user/diagram.png -b white -s 2
```
SVG (scalable): `mmdc -i /home/user/diagram.mmd -o /home/user/diagram.svg`.

Browser fallback if `mmdc` fails: write an HTML page that loads Mermaid from the
CDN, put the source in `<pre class="mermaid">`, `sandbox_browser` goto the
`file://` URL, then `screenshot` the rendered element to PNG.

## graphviz alternative (mind map / concept map)
```python
from graphviz import Graph
g = Graph(format="png"); g.attr(layout="neato", overlap="false")
g.node("Candle"); 
for k in ["Memory","Tools","Security"]:
    g.node(k); g.edge("Candle", k)
g.render("/home/user/diagram", cleanup=True)
```
Run with `run_python`.

## Verify and deliver
1. View the PNG (`screenshot_analyze` or `sandbox_browser`) to check for
   overlapping labels and correct branching.
2. `get_sandbox_file_url` on the PNG/SVG. Offer the `.mmd` source so the user
   can tweak it.

## Gotchas
- Mermaid `mindmap` and `journey` require a recent mermaid-cli; if rendering
  errors, fall back to the CDN/browser path which always has the latest.
- Keep node labels short; long text breaks layout. Use line breaks (`<br/>` in
  Mermaid, `\n` in graphviz labels) for multi-line nodes.
- `flowchart TD` (top-down) for processes/decisions; `LR` for pipelines.
- For dense mind maps, graphviz `neato`/`fdp` layouts spread nodes better than
  Mermaid's fixed radial layout.
