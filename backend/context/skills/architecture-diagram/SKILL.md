---
name: architecture-diagram
description: Produce system/architecture diagrams using Mermaid (rendered with mmdc or sandbox_browser) or the Python diagrams/graphviz libs, then deliver a PNG/SVG.
tags: architecture, diagram, mermaid, graphviz, infrastructure
---

# Architecture Diagram

## When to use
A user wants a picture of how a system fits together: services, databases,
queues, cloud components, request flow, deployment topology, or a C4-style
context/container diagram. Pick the engine by the look they want.

## Engine choice
- **Mermaid** — fastest for flow-style architecture (`flowchart`, `C4Context`).
  Text-based, easy to edit, clean default theme.
- **Python `diagrams`** — best for cloud architecture with real provider icons
  (AWS/GCP/Azure/K8s). Requires graphviz.
- **graphviz (`dot`)** — maximum control over node/edge layout.

## Setup
```
install_packages: apt install -y graphviz
install_packages: pip install diagrams graphviz
# Mermaid CLI (optional, for headless PNG):
install_packages: npm install -g @mermaid-js/mermaid-cli
```

## Path A — Mermaid (recommended default)
1. Write the diagram source with `write_sandbox_file` to `/home/user/arch.mmd`:
```
flowchart LR
  U[Client] -->|HTTPS| LB[Load Balancer]
  LB --> API[API Service]
  API --> DB[(Postgres)]
  API --> Q[[Queue]]
  Q --> W[Worker]
```
2. Render to PNG. Preferred (no browser):
```
run_terminal: mmdc -i /home/user/arch.mmd -o /home/user/arch.png -b transparent -s 2
```
   `-s 2` doubles scale for crisp output.
3. Fallback if `mmdc` is unavailable: embed Mermaid in an HTML page via CDN and
   screenshot it.
   - `write_sandbox_file` `/home/user/arch.html` with
     `<script type="module">import mermaid from
     'https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.esm.min.mjs';
     mermaid.initialize({startOnLoad:true});</script>` and a
     `<pre class="mermaid">...source...</pre>`.
   - `sandbox_browser` goto `file:///home/user/arch.html`, wait for render,
     `screenshot` the `.mermaid` element to `/home/user/arch.png`.

## Path B — Python `diagrams` (cloud icons)
```python
from diagrams import Diagram, Cluster
from diagrams.aws.compute import EC2
from diagrams.aws.database import RDS
from diagrams.aws.network import ELB
with Diagram("Web Service", filename="/home/user/arch", outformat="png",
             show=False):
    lb = ELB("lb")
    with Cluster("App Tier"):
        svc = [EC2("web1"), EC2("web2")]
    db = RDS("postgres")
    lb >> svc >> db
```
Run with `run_python`. Output is `/home/user/arch.png`.

## Path C — graphviz directly
```python
from graphviz import Digraph
g = Digraph(format="png")
g.attr(rankdir="LR")
g.node("api", "API"); g.node("db", "DB", shape="cylinder")
g.edge("api", "db")
g.render("/home/user/arch", cleanup=True)
```

## Verify and deliver
1. `screenshot_analyze` or `sandbox_browser` view the PNG to confirm nothing
   overlaps and labels are legible.
2. `get_sandbox_file_url` on the PNG (and the `.mmd`/`.svg` source if the user
   may want to edit it).

## Gotchas
- `diagrams` and `mmdc` both need graphviz / a browser engine; install before
  rendering or you'll get a cryptic failure.
- Keep <~25 nodes per diagram; split large systems into layered views
  (context → container → component) rather than one mega-diagram.
- For SVG output (infinitely scalable), use `outformat="svg"` or
  `mmdc -o arch.svg`; render a PNG too if the user needs a raster preview.
- Left-to-right (`rankdir=LR` / `flowchart LR`) reads better for request flows;
  top-down for hierarchies.
