---
name: dcf-model
description: Build a discounted-cash-flow valuation in Excel — project unlevered FCF, derive WACC, discount, add terminal value, bridge enterprise to equity value, and run a sensitivity table.
tags: finance, valuation, dcf, excel, modeling
---

# DCF Model (Discounted Cash Flow)

## When to use
A user wants to value a company (or project) from its projected cash flows: "build a DCF for X", "what's X worth on a DCF basis", "value this business". These are modeling tools, not investment advice — say so briefly in the summary.

## Methodology (the line items)
1. **Unlevered Free Cash Flow** per forecast year (typically 5y):
   - `FCF = EBIT*(1 - tax rate) + D&A - CapEx - ΔNet Working Capital`
   - Drive revenue with a growth rate, EBIT via an operating margin, then D&A/CapEx/ΔNWC as % of revenue.
2. **WACC** (discount rate):
   - `WACC = E/V * Re + D/V * Rd * (1 - tax)` where `Re = Rf + β*(market risk premium)` (CAPM).
3. **Discount factor** per year `t`: `1 / (1 + WACC)^t`. PV of FCF = FCF * discount factor.
4. **Terminal value** (compute both, show the user):
   - Gordon growth: `TV = FCF_finalyear * (1 + g) / (WACC - g)`
   - Exit multiple: `TV = EBITDA_finalyear * exit EV/EBITDA`
   - Discount TV back at the final-year factor.
5. **Enterprise value** = Σ PV(FCF) + PV(TV).
6. **Equity value** = EV - net debt (= total debt - cash). **Per share** = equity value / shares outstanding.

## Missing assumptions
If the user hasn't given them, either `clarify` for the essentials (discount rate / WACC inputs, growth, terminal g or exit multiple, base-year financials) OR state sensible defaults explicitly in your reply, e.g. WACC 9%, terminal g 2.5%, tax 21%, 5-year horizon. Pull base financials from filings with `search_web` + `browse_web` (or `http_request`) and cite the source.

## Build steps
1. `install_packages` → `openpyxl pandas numpy` (once per sandbox).
2. Gather inputs: base revenue, margin, growth, D&A/CapEx/NWC %, WACC components, terminal assumptions, net debt, shares. Research + cite if public.
3. `run_python` to build the workbook with openpyxl. Put **formulas as strings** so the model is live and auditable. Use separate tabs:
   - `Assumptions` — every driver in one place (cells other tabs reference).
   - `DCF` — FCF projection, discount factors, PV, TV, EV→equity bridge.
   - `Sensitivity` — 2-D data table of implied share price vs WACC (rows) and terminal g (cols).
4. Format: bold headers, `$#,##0` / `0.0%` number formats, column widths, freeze panes.

```python
import openpyxl
from openpyxl.styles import Font, numbers
wb = openpyxl.Workbook()
a = wb.active; a.title = "Assumptions"
a["A1"] = "DCF Assumptions"; a["A1"].font = Font(bold=True, size=14)
rows = [("Base Revenue", 1000), ("Rev Growth", 0.08), ("EBIT Margin", 0.20),
        ("Tax Rate", 0.21), ("D&A % Rev", 0.05), ("CapEx % Rev", 0.06),
        ("ΔNWC % Rev", 0.02), ("WACC", 0.09), ("Terminal g", 0.025),
        ("Exit EV/EBITDA", 10.0), ("Net Debt", 200), ("Shares (mm)", 100)]
for i,(k,v) in enumerate(rows, start=2):
    a[f"A{i}"]=k; a[f"B{i}"]=v
# named refs: Assumptions!B2 = base rev, B3 growth, ... build DCF tab referencing them
d = wb.create_sheet("DCF")
d["A1"]="Year"; 
for j in range(1,6):   # 5 forecast years across columns B..F
    col = chr(ord('B')+j-1)
    d[f"{col}1"]=j
    # Revenue grows from prior year (B uses base rev * (1+g))
    if j==1:
        d[f"{col}2"]=f"=Assumptions!$B$2*(1+Assumptions!$B$3)"
    else:
        prev=chr(ord('B')+j-2)
        d[f"{col}2"]=f"={prev}2*(1+Assumptions!$B$3)"
    d[f"{col}3"]=f"={col}2*Assumptions!$B$4"                      # EBIT
    d[f"{col}4"]=f"={col}3*(1-Assumptions!$B$5)"                  # NOPAT
    d[f"{col}5"]=f"={col}2*Assumptions!$B$6"                      # D&A
    d[f"{col}6"]=f"={col}2*Assumptions!$B$7"                      # CapEx
    d[f"{col}7"]=f"={col}2*Assumptions!$B$8"                      # ΔNWC
    d[f"{col}8"]=f"={col}4+{col}5-{col}6-{col}7"                  # FCF
    d[f"{col}9"]=f"=1/(1+Assumptions!$B$9)^{j}"                   # discount factor
    d[f"{col}10"]=f"={col}8*{col}9"                               # PV of FCF
for lbl,r in [("Revenue",2),("EBIT",3),("NOPAT",4),("D&A",5),("CapEx",6),
              ("ΔNWC",7),("FCF",8),("Disc Factor",9),("PV FCF",10)]:
    d[f"A{r}"]=lbl
d["A12"]="Terminal Value (Gordon)"
d["B12"]="=F8*(1+Assumptions!$B$10)/(Assumptions!$B$9-Assumptions!$B$10)"
d["A13"]="PV of TV"; d["B13"]="=B12*F9"
d["A14"]="Enterprise Value"; d["B14"]="=SUM(B10:F10)+B13"
d["A15"]="Equity Value"; d["B15"]="=B14-Assumptions!$B$11"
d["A16"]="Implied Price"; d["B16"]="=B15/Assumptions!$B$12"
wb.save("/home/user/dcf_model.xlsx")
print("saved")
```

5. Add a `Sensitivity` tab: vary WACC (e.g. 7-11%) down rows and terminal g (1.5-3.5%) across columns, recomputing implied price for each pair. You can compute the grid in Python (numpy) and write values, or wire Excel `=` formulas referencing a corner-cell WACC/g — Python-computed values are simpler and robust.

## Deliver
- `get_sandbox_file_url("/home/user/dcf_model.xlsx")` → give the user the link.
- Summary: implied enterprise value, equity value, **implied per-share price**, both terminal-value methods, and the sensitivity range. List the key assumptions and cite any sourced financials. Note: modeling output, not investment advice.

## Gotchas
- Excel formula strings must use absolute refs (`$B$9`) when pointing at the Assumptions tab so fills don't drift.
- WACC must exceed terminal g or Gordon TV explodes/goes negative — guard for it.
- Keep tax applied to EBIT (NOPAT), not to FCF.
- Mid-year convention (discount factor `^(t-0.5)`) is optional; mention if used.
