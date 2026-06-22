---
name: stock-market-research
description: Research a stock ticker — pull quotes and fundamentals via public APIs or yfinance, then summarize performance and context with sources.
tags: stocks, finance, markets, ticker
---

# Stock Market Research

When a user wants research on a publicly traded stock, ETF, or index (price, fundamentals, recent performance, news).

## Not financial advice
State plainly that this is informational research, not investment advice. Report data and context; do not tell the user to buy or sell.

## Steps
1. **Resolve the ticker.** If given a company name, `search_web "<company> stock ticker"` to confirm the symbol and exchange.

2. **Pull quotes & fundamentals.** Fastest path is `yfinance` in `run_python` (`install_packages` pip `yfinance`):
   ```python
   import yfinance as yf
   t = yf.Ticker("AAPL")
   info = t.info                      # market cap, PE, sector, summary
   hist = t.history(period="1y")      # OHLCV time series
   ```
   From `hist` compute: latest close, 1d/1m/YTD/1y % change, 52-week high/low, average volume.
   - If yfinance is rate-limited/unavailable, use `http_request` against a public market API (e.g. Stooq CSV `https://stooq.com/q/d/l/?s=aapl.us&i=d`, or an API the user has a key for). Always note the data source and timestamp.

3. **Fundamentals & filings.** From `t.info` / `t.financials` / `t.balance_sheet` pull revenue, net income, margins, P/E, EPS, dividend yield, debt. For deeper digging, `search_web` recent earnings and `browse_web` the investor-relations or filing page.

4. **Recent news & context.** `search_web "<ticker> news"` and `browse_web` 2-3 reputable sources for catalysts (earnings, guidance, sector moves). Cross-check surprising claims.

5. **Optional chart.** In `run_python` with `matplotlib`, plot the 1y price series and save `/home/user/<ticker>_chart.png`.

6. **Summarize.** Write `/home/user/<ticker>_research.md`: Snapshot (price, % changes, market cap), Fundamentals table, Recent performance, News/catalysts, Sources. Date-stamp everything.

7. **Deliver.** `get_sandbox_file_url` for the report (and chart). Return the snapshot inline.

## Gotchas
- Quotes are delayed/approximate — never imply real-time precision; timestamp the data.
- Confirm the right exchange/ticker (dual listings, ADRs, name collisions).
- yfinance fields can be missing/None — guard for it; fall back to web for gaps.
