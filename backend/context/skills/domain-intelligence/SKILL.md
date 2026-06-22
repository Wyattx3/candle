---
name: domain-intelligence
description: Recon a domain — gather WHOIS, DNS records, HTTP headers, TLS, and tech stack, then summarize the findings with sources.
tags: domain, dns, whois, recon, osint
---

# Domain Intelligence

When a user wants reconnaissance on a domain or website (ownership, infrastructure, DNS, security headers).

## Steps
1. **Confirm scope.** Public recon of a domain is fine. Do NOT run intrusive scans (port sweeps, vuln scanners, brute force) against hosts you don't own without explicit authorization — keep to passive/public lookups.

2. **WHOIS / registration.** Use `run_terminal`:
   - `whois example.com` (install via `install_packages` apt `whois` if missing). Capture registrar, creation/expiry dates, name servers, registrant org if public.
   - If `whois` is unavailable or privacy-protected, use `http_request` against a public RDAP endpoint: `https://rdap.org/domain/example.com` (clean JSON).

3. **DNS records.** `run_terminal` with `dig`:
   - `dig +short A example.com`, `AAAA`, `MX`, `NS`, `TXT`, `CNAME www.example.com`. TXT often reveals SPF/DKIM and SaaS verification tokens (hints at tech stack).

4. **HTTP/TLS posture.** Use `http_request` or `run_terminal curl -sI https://example.com`:
   - Capture status, redirects, `Server`, `X-Powered-By`, and security headers (HSTS, CSP, X-Frame-Options). Note missing security headers.
   - For the TLS cert: `echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null | openssl x509 -noout -issuer -subject -dates`.

5. **Tech fingerprint.** `browse_web` the homepage and note frameworks/CDN from headers and markup. Subdomains: query public sources (e.g. `https://crt.sh/?q=%25.example.com&output=json` via `http_request`) for certificate-transparency subdomain discovery — passive, no scanning.

6. **Summarize.** Write `/home/user/domain_<name>.md`: Registration, DNS, Hosting/IP & geolocation, TLS, Security headers (with gaps flagged), Subdomains, Tech stack. Cite the command/source for each section.

7. **Deliver.** `get_sandbox_file_url`; return key findings inline.

## Gotchas
- WHOIS privacy services hide registrant — report that rather than guessing.
- IPs/CDN (Cloudflare, Fastly) mask the real origin; note when a host sits behind a CDN.
- Data is a snapshot — timestamp it. DNS/TTL means records can differ by resolver.
