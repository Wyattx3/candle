---
name: jupyter-notebook-authoring
description: Create and execute .ipynb notebooks programmatically with nbformat and jupyter nbconvert, then deliver the notebook plus an HTML render.
tags: jupyter, notebook, ipynb, nbformat, nbconvert, python
---

# Jupyter Notebook Authoring

Goal: build a `.ipynb` notebook (markdown + code cells), execute it so the
outputs are baked in, render it to HTML, and deliver both via sandbox URLs.

## When to use
User wants an analysis notebook, a tutorial, a reproducible report with code +
charts, or specifically a `.ipynb`/Jupyter file.

## Setup
```
install_packages(manager="pip", packages=["nbformat", "nbconvert", "jupyter", "ipykernel", "matplotlib", "pandas"])
```
Register a kernel if execution complains none is found:
```
run_terminal("python3 -m ipykernel install --user --name python3")
```

## Build the notebook with nbformat (run_python)
```python
import nbformat as nbf
nb = nbf.v4.new_notebook()
cells = []

cells.append(nbf.v4.new_markdown_cell(
    "# Sales Analysis\nA quick exploratory look at Q2 sales."))

cells.append(nbf.v4.new_code_cell(
    "import pandas as pd\n"
    "import matplotlib.pyplot as plt\n"
    "df = pd.DataFrame({'month':['Jan','Feb','Mar'],'rev':[1.2,1.4,1.8]})\n"
    "df"))

cells.append(nbf.v4.new_markdown_cell("## Trend"))

cells.append(nbf.v4.new_code_cell(
    "ax = df.plot(x='month', y='rev', marker='o', legend=False)\n"
    "ax.set_ylabel('Revenue ($M)'); plt.tight_layout(); plt.show()"))

nb["cells"] = cells
with open("/home/user/analysis.ipynb", "w", encoding="utf-8") as f:
    nbf.write(nb, f)
print("notebook written")
```
Build code-cell source from real strings (or read a `.py` you already wrote with
`read_sandbox_file`) — don't hand-assemble cell JSON.

## Execute the notebook (bakes outputs in)
Run it headless so charts/tables are stored in the file:
```
run_terminal("jupyter nbconvert --to notebook --execute --inplace --ExecutePreprocessor.timeout=120 /home/user/analysis.ipynb")
```
Programmatic alternative when you need error handling:
```python
import nbformat
from nbconvert.preprocessors import ExecutePreprocessor
nb = nbformat.read("/home/user/analysis.ipynb", as_version=4)
ep = ExecutePreprocessor(timeout=120, kernel_name="python3")
ep.preprocess(nb, {"metadata": {"path": "/home/user/"}})
nbformat.write(nb, "/home/user/analysis.ipynb")
```

## Render to HTML
```
run_terminal("jupyter nbconvert --to html /home/user/analysis.ipynb --output /home/user/analysis.html")
```
Use `--no-input` to hide code cells (report-style), or `--to webpdf`/`--to pdf`
for a PDF (PDF needs extra deps; HTML is the safe default).

## Gotchas
- **Execution order**: nbconvert runs cells top-to-bottom — make sure imports
  and definitions precede use, or execution errors out and stops.
- `--inplace` overwrites the source file with the executed version (what you
  want for a deliverable with outputs).
- A failing cell aborts execution by default; add
  `--ExecutePreprocessor.allow_errors=True` if you want it to continue.
- "No kernel named python3" → run the `ipykernel install` step above.
- Matplotlib in a headless sandbox uses the Agg backend automatically; no
  display needed. Don't call `plt.savefig` AND `plt.show` expecting a window.
- Bump `--ExecutePreprocessor.timeout` for long-running cells.

## Deliver
```
run_terminal("ls -lh /home/user/analysis.ipynb /home/user/analysis.html")
get_sandbox_file_url(path="/home/user/analysis.ipynb")
get_sandbox_file_url(path="/home/user/analysis.html")
```
Deliver both links (editable notebook + viewable HTML), URLs on the last lines.
