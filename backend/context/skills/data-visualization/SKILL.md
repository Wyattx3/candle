---
name: data-visualization
description: Build charts (bar/line/scatter/heatmap) from data with matplotlib or plotly in run_python; deliver a high-res PNG or an interactive HTML chart.
tags: chart, data, matplotlib, plotly, visualization
---

# Data Visualization

## When to use
A user has data (numbers, CSV, JSON, query results) and wants a chart: bar,
line, scatter, histogram, pie, heatmap, box plot, or a multi-panel dashboard.
Choose static (matplotlib -> PNG, great for reports) or interactive (plotly ->
HTML, hover/zoom).

## Setup
```
install_packages: pip install matplotlib pandas plotly kaleido
```
`pandas` for data wrangling, `kaleido` lets plotly export static PNG too.

## Step 1 — Get the data into a DataFrame
- Inline data: build a `dict`/list in code.
- File: user-provided CSV/JSON, or download with `http_request` then
  `pd.read_csv("/home/user/data.csv")`.
- Always inspect first: `print(df.head()); print(df.dtypes)` so you chart the
  right columns.

## Path A — Static (matplotlib, default for reports)
```python
import matplotlib
matplotlib.use("Agg")            # headless backend, no display needed
import matplotlib.pyplot as plt
import pandas as pd

df = pd.DataFrame({"month":["Jan","Feb","Mar","Apr"],
                   "sales":[120, 145, 98, 170]})
fig, ax = plt.subplots(figsize=(8, 5), dpi=150)
ax.bar(df["month"], df["sales"], color="#4C7EF3")
ax.set_title("Monthly Sales", fontsize=14, fontweight="bold")
ax.set_xlabel("Month"); ax.set_ylabel("Sales ($k)")
ax.grid(axis="y", alpha=0.3)
fig.tight_layout()
fig.savefig("/home/user/chart.png", bbox_inches="tight")
```
Heatmap: `ax.imshow(matrix, cmap="viridis")` + `fig.colorbar(...)`.
Multi-panel: `fig, axes = plt.subplots(2, 2, figsize=(12,8))`.

## Path B — Interactive (plotly)
```python
import plotly.express as px
fig = px.line(df, x="month", y="sales", markers=True, title="Monthly Sales")
fig.write_html("/home/user/chart.html", include_plotlyjs="cdn")
fig.write_image("/home/user/chart.png", scale=2)   # static preview (kaleido)
```

## Design tips
- High DPI (`dpi=150+`) so the PNG is crisp in docs.
- Always label axes and add a title; add units.
- Pick a colorblind-safe palette (`viridis`, `cividis`, or tab10).
- Sort categorical bars by value when ranking matters.
- Don't use pie charts for >5 slices — use a bar chart instead.
- For time series use a line chart; for distributions a histogram/box plot.

## Verify and deliver
1. `screenshot_analyze` the PNG to confirm labels aren't cut off and the data
   reads correctly.
2. `get_sandbox_file_url` on the PNG. For interactive charts deliver the
   `.html` too (it's self-contained with `include_plotlyjs="cdn"`).

## Gotchas
- Set `matplotlib.use("Agg")` BEFORE `import pyplot` — there's no display in the
  sandbox, otherwise it may error or hang.
- `fig.write_image` needs `kaleido` installed; without it, only HTML export
  works.
- Parse dates (`pd.to_datetime`) so time axes order correctly instead of
  alphabetically.
- For large datasets, downsample or aggregate before plotting to keep the image
  legible.
