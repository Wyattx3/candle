---
name: username-search
description: Check whether a username exists across many public sites (sherlock-style) by probing candidate profile URLs and reporting confirmed hits.
tags: username, osint, social-media, enumeration
---

# Username Search

When a user wants to find where a given username is registered across public web platforms (social, dev, gaming, forums).

## Steps
1. **Build the candidate list.** Maintain a map of `site -> profile URL template`, e.g.:
   - GitHub `https://github.com/{u}`, Reddit `https://www.reddit.com/user/{u}`, Instagram `https://www.instagram.com/{u}/`, X `https://x.com/{u}`, TikTok `https://www.tiktok.com/@{u}`, Twitch `https://www.twitch.tv/{u}`, Medium `https://medium.com/@{u}`, PyPI `https://pypi.org/user/{u}`, Telegram `https://t.me/{u}`, etc.

2. **Probe in one turn.** Use `run_python_with_tools` so the whole sweep runs in a single turn without flooding context. For each URL, `http_request` (or requests inside the script) a GET with a realistic `User-Agent` and follow redirects:
   ```python
   import requests
   UA = {"User-Agent": "Mozilla/5.0 ..."}
   def exists(url):
       r = requests.get(url, headers=UA, timeout=10, allow_redirects=True)
       return r.status_code, len(r.text), r.url
   ```
   Decide "exists" per site: HTTP 200 AND not redirected to a generic 404/login AND the body lacks the site's known "not found" marker (e.g. Reddit returns 404, Instagram redirects to login). Tune a small per-site rule where a bare status code is ambiguous.

3. **Reduce false positives.** Some sites return 200 for everything. For those, check the page text for the username echoed back, or for a profile-specific element. Mark ambiguous results as "possible" rather than "confirmed".

4. **Optionally use the real tool.** If broad coverage is needed, `install_packages` then `run_terminal` with `sherlock <username>` (the maintained `sherlock-project`) and parse its output — but verify a sample of hits manually.

5. **Report.** Write `/home/user/username_<u>.md` with three buckets: Confirmed, Possible, Not found. Each confirmed hit lists the platform + clickable profile URL.

6. **Deliver.** `get_sandbox_file_url`; return the confirmed-hit list inline.

## Gotchas
- Rate limits: throttle (sleep ~1s) and cap total sites; bot-walled sites (Instagram, X) often need `browser_interact` instead of a bare GET.
- A username existing on a site does NOT mean it's the same person — say so.
- Public profile existence only; do not attempt to access private data or bypass auth.
