---
name: merger-model
description: Build an M&A merger model in Excel — combine acquirer and target, purchase accounting, synergies, financing mix, pro-forma EPS, and accretion/dilution analysis.
tags: finance, m&a, merger, accretion-dilution, excel, modeling
---

# Merger Model (M&A Accretion / Dilution)

## When to use
A user wants to model an acquisition of one public company by another and judge whether it helps or hurts EPS: "build a merger model", "is this deal accretive or dilutive", "model A buying B". Modeling tool, not investment advice — note briefly.

## Methodology (the line items)
1. **Offer / purchase price**: `Offer per share = target price * (1 + control premium)`. `Equity purchase price = offer/share * target shares`. `Deal EV = equity purchase + target net debt`.
2. **Financing mix** — how the buyer pays: % cash (from balance sheet or new debt) + % stock (new acquirer shares issued).
   - New shares issued = (stock portion of purchase) / acquirer share price.
   - New debt raised = cash-via-debt portion.
3. **Purchase accounting (simplified)**: goodwill = equity purchase - target book equity (less any write-ups). Usually not P&L-relevant unless you amortize intangibles.
4. **Pro-forma net income**:
   - `= Acquirer NI + Target NI + after-tax synergies - after-tax new interest on acquisition debt - after-tax foregone interest on cash used`
   - Synergies: `after-tax = pre-tax synergies * (1 - tax)`.
5. **Pro-forma shares** = acquirer shares + new shares issued for stock consideration.
6. **Pro-forma EPS** = pro-forma net income / pro-forma shares.
7. **Accretion / dilution**: `= Pro-forma EPS / Acquirer standalone EPS - 1`. Positive = **accretive**, negative = **dilutive**.
   - Quick intuition: an all-stock deal is accretive when the acquirer's P/E > target's P/E (on the offer).

## Missing assumptions
If not given, `clarify` or state defaults: control premium 25%, financing 50% cash / 50% stock, new debt rate 6%, cash interest forgone 2%, tax 21%, pre-tax synergies a stated $ amount (or 0). Pull both companies' NI, EPS, share counts, prices, and net debt from filings via `search_web`/`browse_web` and cite.

## Build steps
1. `install_packages` → `openpyxl pandas numpy`.
2. `run_python` with openpyxl, formulas as strings, tabs:
   - `Inputs` — acquirer & target standalone financials, deal terms, financing mix, synergies, rates, tax.
   - `Deal` — offer price, purchase price, financing split, new shares, new debt.
   - `ProForma` — combined net income, pro-forma shares, pro-forma EPS, accretion/dilution.
   - `Sensitivity` — accretion/dilution vs control premium (rows) and % stock consideration (cols).

```python
import openpyxl
from openpyxl.styles import Font
wb=openpyxl.Workbook(); inp=wb.active; inp.title="Inputs"
rows=[("Acq Price",60),("Acq Shares (mm)",500),("Acq NI",1200),("Acq Net Debt",2000),
      ("Tgt Price",40),("Tgt Shares (mm)",200),("Tgt NI",400),("Tgt Net Debt",800),
      ("Tgt Book Equity",1500),("Control Premium",0.25),("% Stock",0.50),
      ("New Debt Rate",0.06),("Cash Interest",0.02),("Tax Rate",0.21),
      ("Pre-tax Synergies",150)]
for i,(k,v) in enumerate(rows,2): inp[f"A{i}"]=k; inp[f"B{i}"]=v
inp["A1"]="Inputs"; inp["A1"].font=Font(bold=True,size=14)
# row index map: AcqPrice B2, AcqSh B3, AcqNI B4, AcqND B5, TgtPrice B6, TgtSh B7,
# TgtNI B8, TgtND B9, TgtBookEq B10, Premium B11, %Stock B12, DebtRate B13,
# CashInt B14, Tax B15, Synergies B16
dl=wb.create_sheet("Deal")
dl["A2"]="Offer / Share"; dl["B2"]="=Inputs!B6*(1+Inputs!B11)"
dl["A3"]="Equity Purchase"; dl["B3"]="=B2*Inputs!B7"
dl["A4"]="Deal EV"; dl["B4"]="=B3+Inputs!B9"
dl["A5"]="Stock Consideration"; dl["B5"]="=B3*Inputs!B12"
dl["A6"]="Cash Consideration"; dl["B6"]="=B3*(1-Inputs!B12)"
dl["A7"]="New Shares Issued"; dl["B7"]="=B5/Inputs!B2"
dl["A8"]="New Debt (=cash portion)"; dl["B8"]="=B6"
dl["A9"]="Goodwill"; dl["B9"]="=B3-Inputs!B10"
pf=wb.create_sheet("ProForma")
pf["A2"]="Acq NI"; pf["B2"]="=Inputs!B4"
pf["A3"]="Tgt NI"; pf["B3"]="=Inputs!B8"
pf["A4"]="After-tax Synergies"; pf["B4"]="=Inputs!B16*(1-Inputs!B15)"
pf["A5"]="New Interest (a-t)"; pf["B5"]="=-Deal!B8*Inputs!B13*(1-Inputs!B15)"
pf["A6"]="Forgone Cash Int (a-t)"; pf["B6"]="=-Deal!B6*Inputs!B14*(1-Inputs!B15)"
pf["A7"]="Pro-forma NI"; pf["B7"]="=SUM(B2:B6)"
pf["A8"]="Pro-forma Shares"; pf["B8"]="=Inputs!B3+Deal!B7"
pf["A9"]="Pro-forma EPS"; pf["B9"]="=B7/B8"
pf["A10"]="Acquirer Standalone EPS"; pf["B10"]="=Inputs!B4/Inputs!B3"
pf["A11"]="Accretion/(Dilution) %"; pf["B11"]="=B9/B10-1"
pf["A11"].font=Font(bold=True)
wb.save("/home/user/merger_model.xlsx"); print("saved")
```

3. Add a `Sensitivity` tab: vary control premium (e.g. 10-40%) down rows and % stock (0-100%) across columns; recompute accretion/dilution for each pair (compute in numpy and write values, or wire formulas referencing a corner premium/%stock cell).
4. Format: bold headers and the accretion/dilution row, `$#,##0`, `0.00` for EPS, `0.0%` for the result, column widths.

## Deliver
- `get_sandbox_file_url("/home/user/merger_model.xlsx")`.
- Summary: offer price and premium, financing split, pro-forma EPS vs standalone EPS, and **whether the deal is accretive or dilutive and by how much**, plus how it flips across the sensitivity grid. Cite sourced financials. Note: modeling output, not investment advice.

## Gotchas
- Match the after-tax treatment consistently: synergies, new interest, and forgone interest should all be after-tax to compare to net income.
- New shares are issued only on the **stock** portion of consideration — an all-cash deal issues none (no EPS denominator change, but adds interest cost).
- All-stock rule of thumb: accretive if acquirer P/E > target P/E at the offer; use it as a sanity check on the output.
- Don't double-count: if cash comes from new debt, model new interest; if from balance-sheet cash, model forgone interest — not both on the same dollars.
- Goodwill normally doesn't hit the P&L (no amortization under current GAAP); only model intangible amortization if explicitly asked.
