---
name: web-scraping
description: Scrape structured data from websites — choose the right fetch method, handle pagination, and output clean CSV/JSON to the sandbox.
tags: scraping, data-extraction, csv, json
---

# Web Scraping

When a user wants structured data pulled off one or many web pages (listings, tables, search results, catalogs).

## Pick the right tool first
- **Static HTML / API-backed pages** → fastest path is `run_python` with `requests` + `beautifulsoup4` (install via `install_packages`). Lowest cost, scriptable.
- **One-off read of a single page** → `browse_web` returns cleaned readable content directly.
- **JS-rendered / infinite-scroll / login-gated** → `sandbox_browser` (Playwright): goto, scroll, click "load more", then extract. Persistent cookies survive across calls.
- **Bot-walled (Cloudflare, captcha, aggressive fingerprinting)** → `browser_interact` (stealth browser). Try `browse_web` first; escalate only if blocked.

## Steps
1. **Inspect one page.** Fetch a single target with `browse_web` (or `run_python` requests) and identify the repeating structure (CSS selectors, JSON endpoint in network calls). Many sites have a hidden JSON API — check for `/api/` calls; hitting it with `http_request` is far more reliable than parsing HTML.

2. **Write the extractor.** In `run_python`:
   ```python
   import requests, csv
   from bs4 import BeautifulSoup
   rows = []
   for item in soup.select(".product-card"):
       rows.append({
           "title": item.select_one(".title").get_text(strip=True),
           "price": item.select_one(".price").get_text(strip=True),
       })
   ```

3. **Handle pagination.** Detect the pattern: `?page=N`, offset params, "next" link, or scroll. For many pages, loop in ONE turn with `run_python_with_tools` (it can call browse_web/http_request internally) so you don't flood context. Add a polite delay (1-2s) and a max-page cap.

4. **Clean & dedupe.** Normalize whitespace, strip currency symbols if numeric output is wanted, dedupe on a key field.

5. **Write output.** Save to `/home/user/scrape.csv` and/or `scrape.json` with `write_sandbox_file` or directly in the python script. Print row count.

6. **Deliver.** `get_sandbox_file_url` on the file; return the link plus a 3-5 row preview.

## Gotchas
- Respect `robots.txt` and rate limits; do not hammer a host. Keep concurrency low.
- Set a real `User-Agent` header in requests — many sites 403 the default python UA.
- Selectors break: validate counts after each page; if zero rows, the markup changed or JS is required (switch to sandbox_browser).
- For large scrapes, write incrementally to disk rather than holding everything in memory.
- Scrape only public data; do not bypass paywalls or auth you weren't given.
