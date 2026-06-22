---
name: lbo-model
description: Build a leveraged-buyout model in Excel — sources & uses, debt schedule with cash sweep, levered FCF, and sponsor returns (IRR/MOIC) across an exit multiple.
tags: finance, lbo, private-equity, excel, modeling
---

# LBO Model (Leveraged Buyout)

## When to use
A user wants to model a private-equity-style acquisition financed with debt and assess returns: "build an LBO for X", "what IRR does a sponsor get", "model this buyout". Modeling tool, not investment advice — note briefly.

## Methodology (the line items)
1. **Entry valuation**: `Entry EV = entry EV/EBITDA * LTM EBITDA`.
2. **Sources & Uses** (must balance):
   - Uses: purchase EV + transaction fees (- existing net debt assumed/refinanced).
   - Sources: new debt tranches (e.g. Term Loan at entry leverage * EBITDA) + sponsor equity (the plug).
   - `Sponsor Equity = Total Uses - Total Debt`.
3. **Operating projection** (5y): grow revenue, hold/expand EBITDA margin, subtract D&A → EBIT.
4. **Debt schedule** per year:
   - Interest = beginning balance * rate.
   - **Levered FCF** = EBITDA - cash interest - taxes - CapEx - ΔNWC - mandatory amortization.
   - **Cash sweep**: excess FCF pays down debt → reduces next year's interest.
   - Ending debt = beginning - mandatory amort - optional sweep.
5. **Exit**: `Exit EV = exit EV/EBITDA * final-year EBITDA`. `Exit Equity = Exit EV - net debt at exit`.
6. **Returns**:
   - `MOIC = Exit Equity / Sponsor Equity`.
   - `IRR = MOIC^(1/years) - 1` (single entry/exit cash flow) or `=IRR()` over the equity cash-flow stream.

## Missing assumptions
If not given, `clarify` or state defaults: entry & exit EV/EBITDA 10x, entry leverage 5x EBITDA, debt rate 8%, mandatory amort 5%/yr, hold 5y, tax 21%, revenue growth 6%, EBITDA margin flat. Pull LTM EBITDA from filings via `search_web`/`browse_web` and cite.

## Build steps
1. `install_packages` → `openpyxl pandas numpy`.
2. `run_python` with openpyxl, formulas as strings, tabs:
   - `Assumptions` — entry/exit multiples, leverage, rate, growth, margin, fees, tax, hold.
   - `SourcesUses` — uses vs sources, with the balance check.
   - `Model` — operating projection + debt schedule + cash sweep + exit + returns.

```python
import openpyxl
from openpyxl.styles import Font
wb = openpyxl.Workbook(); a = wb.active; a.title="Assumptions"
inp=[("LTM EBITDA",100),("Entry EV/EBITDA",10),("Exit EV/EBITDA",10),
     ("Entry Leverage x",5),("Debt Rate",0.08),("Mand Amort %",0.05),
     ("Rev Growth",0.06),("EBITDA Margin",0.25),("Base Revenue",400),
     ("Tax Rate",0.21),("CapEx % Rev",0.05),("Fees % EV",0.02),("Hold Yrs",5)]
for i,(k,v) in enumerate(inp,2): a[f"A{i}"]=k; a[f"B{i}"]=v
su=wb.create_sheet("SourcesUses")
su["A1"]="USES"; su["A2"]="Purchase EV"; su["B2"]="=Assumptions!B2*Assumptions!B3"
su["A3"]="Fees"; su["B3"]="=B2*Assumptions!B13"
su["A4"]="Total Uses"; su["B4"]="=B2+B3"
su["A6"]="SOURCES"; su["A7"]="Term Loan"; su["B7"]="=Assumptions!B2*Assumptions!B5"
su["A8"]="Sponsor Equity"; su["B8"]="=B4-B7"
su["A9"]="Total Sources"; su["B9"]="=B7+B8"
su["A10"]="Check (0)"; su["B10"]="=B9-B4"
m=wb.create_sheet("Model")
m["A1"]="Year"
for j in range(0,6):  # year 0 = entry, 1..5 forecast across cols B..G
    c=chr(ord('B')+j); m[f"{c}1"]=j
    if j==0:
        m[f"{c}8"]="=SourcesUses!B7"      # beginning debt = term loan
    else:
        p=chr(ord('B')+j-1)
        # revenue & EBITDA
        m[f"{c}2"]=f"=Assumptions!$B$10*(1+Assumptions!$B$8)^{j}" if False else (
            f"=Assumptions!$B$10*(1+Assumptions!$B$8)" if j==1 else f"={p}2*(1+Assumptions!$B$8)")
        m[f"{c}3"]=f"={c}2*Assumptions!$B$9"                    # EBITDA
        m[f"{c}4"]=f"={p}8*Assumptions!$B$6"                    # interest on beg debt
        m[f"{c}5"]=f"=({c}3-{c}4)*Assumptions!$B$11"            # taxes (rough)
        m[f"{c}6"]=f"={c}2*Assumptions!$B$12"                   # capex
        m[f"{c}7"]=f"={c}3-{c}4-{c}5-{c}6"                      # levered FCF
        # sweep: pay down all FCF, floored at zero debt
        m[f"{c}8"]=f"=MAX(0,{p}8-{c}7)"                          # ending debt
for lbl,r in [("Revenue",2),("EBITDA",3),("Interest",4),("Taxes",5),
              ("CapEx",6),("Levered FCF",7),("Net Debt",8)]:
    m[f"A{r}"]=lbl
m["A10"]="Exit EV"; m["B10"]="=G3*Assumptions!B3"   # uses exit multiple cell B3? use B4 exit
m["A10"]="Exit EV"; m["B10"]="=G3*Assumptions!B4"
m["A11"]="Exit Equity"; m["B11"]="=B10-G8"
m["A12"]="Sponsor Equity"; m["B12"]="=SourcesUses!B8"
m["A13"]="MOIC"; m["B13"]="=B11/B12"
m["A14"]="IRR"; m["B14"]="=B13^(1/Assumptions!B14)-1"
wb.save("/home/user/lbo_model.xlsx"); print("saved")
```

3. Format: bold headers, `$#,##0` and `0.0%`, column widths, freeze panes. Double-check the exit-multiple cell reference and the Sources & Uses balance check reads 0.

## Deliver
- `get_sandbox_file_url("/home/user/lbo_model.xlsx")`.
- Summary: entry EV, total debt vs sponsor equity, exit equity, **MOIC and IRR**, and how sensitive returns are to the exit multiple. Cite sourced EBITDA. Note: modeling output, not investment advice.

## Gotchas
- Sources must equal Uses — keep the explicit check cell.
- Cash sweep can't drive debt below zero — use `MAX(0, ...)`.
- Interest is on the *beginning* balance of each year (circularity-free if no revolver). A full revolver creates circular refs; avoid or enable iterative calc explicitly and mention it.
- Returns are extremely sensitive to entry vs exit multiple — always show a small IRR sensitivity (exit multiple +/- 1-2x).
