---
name: content-monitoring
description: Watch a website or feed for changes on a schedule — re-fetch, diff against stored state, and alert when something changes.
tags: monitoring, cron, diff, alerts, rss
---

# Content Monitoring

When a user wants ongoing monitoring of a page, RSS/Atom feed, price, job board, or API for changes over time.

## One-time setup
1. **Establish the baseline.** Fetch the target now:
   - Page → `browse_web` (cleaned text) or `http_request` (raw).
   - Feed → `http_request` the RSS/Atom URL, parse with `feedparser` in `run_python`.
   - API → `http_request` the JSON endpoint.
2. **Normalize.** Reduce to the signal that matters (e.g. the price string, the list of feed item ids/titles, a specific DOM section). Strip volatile noise (timestamps, ad tokens, CSRF nonces) so diffs aren't all-noise.
3. **Persist the baseline.** Save to a stable file like `/home/user/monitor/<name>_state.json` with `write_sandbox_file`. Also `store_memory` a compact fingerprint (hash + last-checked time) so it survives across runs.

## Recurring check (the schedule)
4. **Register a cron job.** Use `cronjob` to schedule a recurring prompt such as: "Re-fetch <url>, normalize, compare to /home/user/monitor/<name>_state.json, and if changed, report what changed and update the state file." Pick a sane interval (feeds hourly, prices a few times daily) — avoid hammering.
5. **On each run, diff.** Re-fetch → normalize → compare to stored state:
   - Feeds: new item ids not in the prior set.
   - Text/price: compute a hash; if different, do a line-level diff (`difflib` in `run_python`) and summarize only the changed parts.
6. **Act on change.** If changed: write the new state, append to a changelog `/home/user/monitor/<name>_log.md`, and surface a concise "what changed" summary. If unchanged, exit quietly (no noise).

## Deliver
- Return the change summary inline; `get_sandbox_file_url` on the changelog for history.
- Tell the user the cron schedule and how to stop it.

## Gotchas
- Diff the meaningful content, not raw HTML — markup churn creates false positives.
- JS-rendered pages need `sandbox_browser`, not bare `http_request`.
- Note: cron prompts run with no chat history, so the prompt must be fully self-contained (include the URL, the state file path, and the comparison rule).
- Be polite: realistic User-Agent, reasonable interval, honor robots/rate limits.
