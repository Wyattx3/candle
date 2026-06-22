---
name: excel-authoring
description: Author rich .xlsx workbooks with openpyxl - multiple sheets, formulas, cell formatting, native charts, freeze panes, and conditional formatting.
tags: excel, xlsx, openpyxl, charts, formulas, python
---

# Excel Authoring (advanced openpyxl)

Goal: build a feature-rich `.xlsx` workbook — formulas, formatting, native
charts, freeze panes — then deliver a sandbox download URL.

> This is about **authoring** a workbook with formatting/charts/formulas. If the
> task is "search the web for data, dump it into sheets", use the
> **data-to-excel-workflow** skill instead (`skill_view`).

## Setup
```
install_packages(manager="pip", packages=["openpyxl"])
```
(Use `pandas` too only if you're loading tabular data; openpyxl alone covers
the authoring features below.)

## Build the workbook (run_python)
```python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.chart import BarChart, LineChart, PieChart, Reference
from openpyxl.formatting.rule import ColorScaleRule

wb = Workbook()

# ---- Sheet 1: data with header styling + formulas ----
ws = wb.active; ws.title = "Sales"
headers = ["Month", "Units", "Price", "Revenue"]
ws.append(headers)

hdr_fill = PatternFill("solid", fgColor="1A7F37")
hdr_font = Font(bold=True, color="FFFFFF")
for c in range(1, len(headers) + 1):
    cell = ws.cell(row=1, column=c)
    cell.fill = hdr_fill; cell.font = hdr_font
    cell.alignment = Alignment(horizontal="center")

rows = [("Jan", 120, 9.99), ("Feb", 150, 9.99), ("Mar", 200, 8.49)]
for i, (m, u, p) in enumerate(rows, start=2):
    ws.cell(row=i, column=1, value=m)
    ws.cell(row=i, column=2, value=u)
    ws.cell(row=i, column=3, value=p)
    ws.cell(row=i, column=4, value=f"=B{i}*C{i}")        # formula
    ws.cell(row=i, column=3).number_format = '"$"#,##0.00'
    ws.cell(row=i, column=4).number_format = '"$"#,##0.00'

last = len(rows) + 1
ws.cell(row=last+1, column=1, value="Total").font = Font(bold=True)
ws.cell(row=last+1, column=4, value=f"=SUM(D2:D{last})")  # aggregate formula

# auto-ish column widths
for c in range(1, len(headers) + 1):
    ws.column_dimensions[get_column_letter(c)].width = 14

ws.freeze_panes = "A2"        # keep header visible while scrolling

# conditional formatting: color-scale on the Units column
ws.conditional_formatting.add(
    f"B2:B{last}",
    ColorScaleRule(start_type="min", start_color="FFF8696B",
                   end_type="max", end_color="FF63BE7B"))

# ---- Native chart on a second sheet ----
chart_ws = wb.create_sheet("Charts")
bar = BarChart(); bar.title = "Revenue by Month"
data = Reference(ws, min_col=4, min_row=1, max_row=last)      # incl header
cats = Reference(ws, min_col=1, min_row=2, max_row=last)
bar.add_data(data, titles_from_data=True); bar.set_categories(cats)
chart_ws.add_chart(bar, "B2")

# ---- A summary sheet referencing the first ----
summ = wb.create_sheet("Summary")
summ["A1"] = "Total Revenue"; summ["A1"].font = Font(bold=True)
summ["B1"] = f"=Sales.D{last+1}"     # cross-sheet ref (use Sales!D.. in some locales)

wb.save("/home/user/report.xlsx")
print("sheets:", wb.sheetnames)
```

## Chart types available
`BarChart`, `LineChart`, `PieChart`, `ScatterChart`, `AreaChart`. All take a
`Reference` for data and (except pie/scatter) `set_categories`. Set
`titles_from_data=True` when the data range includes the header row.

## Gotchas
- openpyxl writes the **formula string**, not its result — the value computes
  when Excel/LibreOffice opens the file. Don't expect to read computed values
  back via openpyxl.
- Cross-sheet refs: openpyxl uses `SheetName!A1`; if a sheet name has spaces,
  quote it: `'Sales Data'!D5`.
- `number_format` is a string; common ones: `'#,##0'`, `'0.00%'`,
  `'"$"#,##0.00'`, `'yyyy-mm-dd'`.
- There is no true auto-fit; estimate widths from the longest cell length.
- Freeze panes: the value is the FIRST scrollable cell (A2 freezes row 1).

## Deliver
```
run_terminal("ls -lh /home/user/report.xlsx")
get_sandbox_file_url(path="/home/user/report.xlsx")
```
List the sheet names and what each contains, URL on the last line.
