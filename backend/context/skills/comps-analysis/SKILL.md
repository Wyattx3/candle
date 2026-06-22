---
name: comps-analysis
description: Build a trading-comparables analysis in Excel — research peer multiples (EV/EBITDA, P/E), assemble a comp table with mean/median, and derive an implied valuation for the target.
tags: finance, valuation, comps, excel, modeling
---

# Comparable Companies Analysis (Trading Comps)

## When to use
A user wants a relative valuation of a company against its public peers: "build comps for X", "what's X worth vs peers", "trading comparables table". Modeling tool, not investment advice — note briefly.

## Methodology (the line items)
1. **Pick the peer set** — companies with similar industry, size, growth, and margins (typically 5-10).
2. For each peer gather: market cap (price * shares), net debt, → **Enterprise Value** = market cap + net debt; plus EBITDA, EBIT, net income, EPS, revenue.
3. **Multiples** per peer:
   - `EV/Revenue`, `EV/EBITDA`, `EV/EBIT`
   - `P/E = price / EPS`
4. **Summary stats** across peers: min, mean, **median** (median is the headline — robust to outliers), max.
5. **Implied valuation of target**: apply peer median multiple to the target's metric.
   - From `EV/EBITDA`: `Implied EV = median(EV/EBITDA) * target EBITDA` → `Implied Equity = Implied EV - target net debt` → `/ shares` = implied price.
   - From `P/E`: `Implied Price = median(P/E) * target EPS`.

## Missing assumptions
If the user hasn't named peers or given target financials, `clarify` for the target's EBITDA / EPS / net debt / shares and a peer list, OR pick a sensible peer set yourself and state it. Pull peer market data and financials via `search_web` + `browse_web` (or `http_request` to a financial data endpoint) and **cite each source** — comps are only as good as the data.

## Build steps
1. `install_packages` → `openpyxl pandas numpy`.
2. Research each peer: price, shares, net debt, EBITDA, EBIT, EPS, revenue. Record the source URL/date per peer.
3. `run_python` with openpyxl, tabs:
   - `Comps` — one row per peer, columns for the raw metrics and the computed multiples; summary stat rows (min/mean/median/max) at the bottom using Excel `=MEDIAN()/=AVERAGE()`.
   - `Implied` — applies the peer median multiples to the target metrics.
   - `Sources` — peer, metric, URL, as-of date.

```python
import openpyxl
from openpyxl.styles import Font
wb=openpyxl.Workbook(); c=wb.active; c.title="Comps"
hdr=["Company","Price","Shares","MktCap","NetDebt","EV","Revenue","EBITDA",
     "EBIT","EPS","EV/Rev","EV/EBITDA","EV/EBIT","P/E"]
for j,h in enumerate(hdr,1):
    cell=c.cell(row=1,column=j,value=h); cell.font=Font(bold=True)
# peers: fill price/shares/netdebt/revenue/ebitda/ebit/eps from research
peers=[["PeerA",50,100,None,500, None,800,200,150,3.5],
       ["PeerB",30,200,None,300, None,600,160,120,2.1]]
# columns: A name,B price,C shares,D mktcap,E netdebt(given separately?) -- adjust layout
# simplest: enter raw, compute MktCap/EV/multiples via formulas
for i,p in enumerate(peers,2):
    name,price,shares,netdebt,_,_,rev,ebitda,ebit,eps=p[0],p[1],p[2],p[4],None,None,p[6],p[7],p[8],p[9]
    c[f"A{i}"]=name; c[f"B{i}"]=price; c[f"C{i}"]=shares; c[f"E{i}"]=netdebt
    c[f"G{i}"]=rev; c[f"H{i}"]=ebitda; c[f"I{i}"]=ebit; c[f"J{i}"]=eps
    c[f"D{i}"]=f"=B{i}*C{i}"            # mkt cap
    c[f"F{i}"]=f"=D{i}+E{i}"            # EV
    c[f"K{i}"]=f"=F{i}/G{i}"            # EV/Rev
    c[f"L{i}"]=f"=F{i}/H{i}"            # EV/EBITDA
    c[f"M{i}"]=f"=F{i}/I{i}"            # EV/EBIT
    c[f"N{i}"]=f"=B{i}/J{i}"            # P/E
last=len(peers)+1
for lbl,fn,r in [("Min","MIN",last+2),("Mean","AVERAGE",last+3),
                 ("Median","MEDIAN",last+4),("Max","MAX",last+5)]:
    c[f"A{r}"]=lbl; c[f"A{r}"].font=Font(bold=True)
    for col in ["K","L","M","N"]:
        c[f"{col}{r}"]=f"={fn}({col}2:{col}{last})"
medrow=last+4
im=wb.create_sheet("Implied")
im["A1"]="Target Inputs"; im["A2"]="EBITDA"; im["B2"]=180
im["A3"]="EPS"; im["B3"]=2.8; im["A4"]="Net Debt"; im["B4"]=120
im["A5"]="Shares"; im["B5"]=90
im["A7"]="Implied EV (EV/EBITDA)"; im["B7"]=f"=Comps!L{medrow}*B2"
im["A8"]="Implied Equity"; im["B8"]="=B7-B4"
im["A9"]="Implied Price (EV/EBITDA)"; im["B9"]="=B8/B5"
im["A10"]="Implied Price (P/E)"; im["B10"]=f"=Comps!N{medrow}*B3"
wb.save("/home/user/comps_analysis.xlsx"); print("saved")
```

4. Format: bold headers and stat rows, `0.0x` for multiples, `$#,##0` for currency, column widths.

## Deliver
- `get_sandbox_file_url("/home/user/comps_analysis.xlsx")`.
- Summary: the peer set, headline **median EV/EBITDA and P/E**, and the **implied price range** for the target from each method. Cite every data source. Note: modeling output from public data, not investment advice.

## Gotchas
- Use **median**, not mean, as the headline — one mispriced peer skews the mean.
- Strip out negative or nonsensical multiples (loss-making peer → P/E meaningless); exclude and note it.
- Keep metric timeframes consistent (all LTM, or all forward) — don't mix.
- EV uses net debt (debt - cash); don't forget minority interest / preferred if material — mention if omitted.
- Data freshness matters: record the as-of date for prices.
