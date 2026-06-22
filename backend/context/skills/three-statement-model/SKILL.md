---
name: three-statement-model
description: Build a linked three-statement model in Excel — income statement, balance sheet, and cash flow tied together by drivers, with a balance-sheet balancing check.
tags: finance, three-statement, modeling, excel, accounting
---

# Three-Statement Model (IS / BS / CF linked)

## When to use
A user wants an integrated financial model where the income statement, balance sheet, and cash flow flow into each other: "build a 3-statement model for X", "link the financials", "project the financials with a balance check". Modeling tool, not investment advice — note briefly.

## Methodology (how the statements link)
**Income Statement (IS)**: Revenue → COGS → Gross Profit → OpEx → EBIT → Interest → Pre-tax → Taxes → **Net Income**.

**Cash Flow (CF)**:
- Operating: `Net Income + D&A - ΔNWC` (ΔAR, ΔInventory, ΔAP).
- Investing: `- CapEx`.
- Financing: `+ debt drawn - debt repaid - dividends`.
- `Net change in cash = CFO + CFI + CFF`. `Ending cash = beginning cash + net change`.

**Balance Sheet (BS)**:
- Assets: cash (from CF) + AR + inventory + Net PP&E (`prior + CapEx - D&A`) + other.
- Liabilities: AP + debt (`prior + draws - repayments`) + other.
- Equity: `prior equity + net income - dividends`.
- **The check**: `Assets - (Liabilities + Equity) = 0` every year. This is the whole point.

**The links that close the model**: net income → retained earnings (BS) and → CFO; D&A → CF add-back and reduces PP&E; CapEx → CFI and increases PP&E; working-capital deltas → CFO and update AR/Inv/AP; ending cash from CF → BS cash.

## Missing assumptions
If not given, `clarify` or state defaults: revenue growth 8%, gross margin 40%, OpEx 25% of revenue, tax 21%, D&A 5% of revenue, CapEx 6% of revenue, AR/Inv/AP as days (DSO 45, DIO 60, DPO 40), no new debt/dividends. Pull a historical base year from filings via `search_web`/`browse_web` and cite.

## Build steps
1. `install_packages` → `openpyxl pandas numpy`.
2. `run_python` with openpyxl, formulas as strings, tabs:
   - `Drivers` — growth, margins, tax, D&A%, CapEx%, working-capital days.
   - `IS`, `BS`, `CF` — one column per year, formulas referencing `Drivers` and each other.
   - Put the **balance check** as a visible row on `BS`.

```python
import openpyxl
from openpyxl.styles import Font
wb=openpyxl.Workbook(); d=wb.active; d.title="Drivers"
drv=[("Base Revenue",1000),("Rev Growth",0.08),("Gross Margin",0.40),
     ("OpEx % Rev",0.25),("Tax Rate",0.21),("D&A % Rev",0.05),
     ("CapEx % Rev",0.06),("DSO",45),("DIO",60),("DPO",40),
     ("Beg Cash",100),("Beg PPE",500),("Beg Debt",300),("Beg Equity",300)]
for i,(k,v) in enumerate(drv,2): d[f"A{i}"]=k; d[f"B{i}"]=v
IS=wb.create_sheet("IS"); BS=wb.create_sheet("BS"); CF=wb.create_sheet("CF")
years=5
for j in range(1,years+1):
    c=chr(ord('B')+j-1); p=chr(ord('B')+j-2)  # p only valid for j>=2
    IS[f"{c}1"]=j; BS[f"{c}1"]=j; CF[f"{c}1"]=j
    # IS
    IS[f"{c}2"]=("=Drivers!$B$2*(1+Drivers!$B$3)" if j==1 else f"={p}2*(1+Drivers!$B$3)")  # revenue
    IS[f"{c}3"]=f"={c}2*(1-Drivers!$B$4)"        # gross profit
    IS[f"{c}4"]=f"={c}2*Drivers!$B$5"            # opex
    IS[f"{c}5"]=f"={c}3-{c}4"                     # EBIT
    IS[f"{c}6"]=f"=Drivers!$B$14*0+0" if j==1 else "0"  # interest (simplify 0 or rate*debt)
    IS[f"{c}7"]=f"={c}5-{c}6"                     # pretax
    IS[f"{c}8"]=f"={c}7*Drivers!$B$6"            # taxes
    IS[f"{c}9"]=f"={c}7-{c}8"                     # net income
    # working capital balances on BS first (need them for CF)
    BS[f"{c}3"]=f"=IS!{c}2*Drivers!$B$9/365"     # AR = rev*DSO/365
    BS[f"{c}4"]=f"=(IS!{c}2*(1-Drivers!$B$4))*Drivers!$B$10/365"  # inventory~COGS*DIO
    BS[f"{c}8"]=f"=(IS!{c}2*(1-Drivers!$B$4))*Drivers!$B$11/365"  # AP~COGS*DPO
    # PP&E roll
    BS[f"{c}5"]=("=Drivers!$B$13+IS!B2*Drivers!$B$8-IS!B2*Drivers!$B$7" if j==1
                 else f"={p}5+IS!{c}2*Drivers!$B$8-IS!{c}2*Drivers!$B$7")  # +capex -D&A (approx %rev)
    # CF
    da=f"IS!{c}2*Drivers!$B$7"; capex=f"IS!{c}2*Drivers!$B$8"
    if j==1:
        dnwc=f"(BS!{c}3-0)+(BS!{c}4-0)-(BS!{c}8-0)"
        begcash="Drivers!$B$12"; begdebt="Drivers!$B$14"; begeq="Drivers!$B$15"
    else:
        dnwc=f"(BS!{c}3-BS!{p}3)+(BS!{c}4-BS!{p}4)-(BS!{c}8-BS!{p}8)"
        begcash=f"BS!{p}2"; begdebt=f"BS!{p}9"; begeq=f"BS!{p}11"
    CF[f"{c}2"]=f"=IS!{c}9+{da}-({dnwc})"        # CFO
    CF[f"{c}3"]=f"=-{capex}"                     # CFI
    CF[f"{c}4"]="0"                              # CFF (no debt/div by default)
    CF[f"{c}5"]=f"={c}2+{c}3+{c}4"              # net change
    CF[f"{c}6"]=f"={begcash}+{c}5"              # ending cash
    # BS cash, debt, equity
    BS[f"{c}2"]=f"=CF!{c}6"                      # cash
    BS[f"{c}9"]=f"={begdebt}"                    # debt (flat)
    BS[f"{c}11"]=f"={begeq}+IS!{c}9"            # equity = prior + NI
    # totals + check
    BS[f"{c}6"]=f"={c}2+{c}3+{c}4+{c}5"        # total assets
    BS[f"{c}12"]=f"={c}8+{c}9+{c}11"           # total L+E
    BS[f"{c}13"]=f"={c}6-{c}12"                # CHECK (should be 0)
for lbl,r in [("Revenue",2),("Gross Profit",3),("OpEx",4),("EBIT",5),
              ("Interest",6),("Pretax",7),("Taxes",8),("Net Income",9)]: IS[f"A{r}"]=lbl
for lbl,r in [("Cash",2),("AR",3),("Inventory",4),("Net PPE",5),("Total Assets",6),
              ("AP",8),("Debt",9),("Equity",11),("Total L+E",12),("CHECK",13)]: BS[f"A{r}"]=lbl
for lbl,r in [("CFO",2),("CFI",3),("CFF",4),("Net Change",5),("Ending Cash",6)]: CF[f"A{r}"]=lbl
wb.save("/home/user/three_statement_model.xlsx"); print("saved")
```

3. Format: bold headers, `$#,##0`, column widths. Conditionally flag the CHECK row red if non-zero.

## Deliver
- `get_sandbox_file_url("/home/user/three_statement_model.xlsx")`.
- Summary: projected revenue and net income trajectory, ending cash, and **confirm the balance check is zero every year**. List assumptions and cite the base-year source. Note: modeling output, not investment advice.

## Gotchas
- **The balance check must be 0** in every column — if not, a link is broken (most often a working-capital delta missed in CFO, or D&A/CapEx not mirrored in PP&E). Debug column by column.
- Working-capital convention: an *increase* in AR/Inventory uses cash (subtract); an *increase* in AP frees cash (add). Sign errors here are the #1 cause of a non-balancing model.
- Year 1 has no prior column — handle the base-year references from `Drivers` explicitly (as above).
- If you add interest on debt, beware circularity (interest → NI → cash → debt). Keep debt flat or use a clearly-labeled iterative-calc setup.
