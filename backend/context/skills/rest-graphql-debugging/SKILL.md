---
name: rest-graphql-debugging
description: Debug REST/GraphQL APIs with http_request and curl in run_terminal - inspect status/headers/body, auth, schema introspection.
tags: api, rest, graphql, http, debugging, curl
---

# REST / GraphQL API Debugging

Use when an API call returns the wrong status, wrong data, an auth error, or
nothing. The method: isolate the request, inspect the full response, fix one
variable at a time.

## 1. Make the raw request and read everything

Use `http_request` for a clean structured call, or `curl` in `run_terminal`
when you want full control over headers and verbose output.
```
http_request: GET https://api.example.com/v1/items   (capture status, headers, body)
```
```
run_terminal: "curl -i -sS -X GET 'https://api.example.com/v1/items' -H 'Accept: application/json'"
```
- `-i` includes response headers, `-sS` quiets the progress bar but keeps
  errors, `-v` shows the full request+TLS handshake when you need it.
- Read the **status code** first: 401/403 = auth, 404 = wrong path, 400/422 =
  bad payload, 429 = rate limited, 5xx = server side.
- Read the **body** — APIs usually return an error message explaining what's
  wrong. Don't skip it.

## 2. REST: vary one thing at a time

- **Auth**: confirm the token/header is present and correct.
  ```
  run_terminal: "curl -i 'https://api.example.com/v1/me' -H \"Authorization: Bearer $TOKEN\""
  ```
  401 with a good token → token expired or wrong scheme. 403 → authenticated
  but not authorized.
- **Headers**: many APIs need `Content-Type: application/json` and `Accept`.
  A 415 means wrong/missing Content-Type.
- **Body**: for POST/PUT, send valid JSON and check it matches the schema.
  ```
  run_terminal: "curl -i -X POST 'https://api.example.com/v1/items' -H 'Content-Type: application/json' -d '{\"name\":\"x\"}'"
  ```
  A 400/422 body usually names the offending field.
- **URL/query**: check path params and encoding. Use `--data-urlencode` for
  query values with special chars.

## 3. GraphQL: it's almost always HTTP 200

GraphQL returns 200 even on errors — the real status is in the `errors` array
of the JSON body. Always read the body.
```
run_terminal: "curl -sS -X POST 'https://api.example.com/graphql' -H 'Content-Type: application/json' -d '{\"query\":\"{ viewer { id name } }\"}'"
```
- **Introspect the schema** to learn valid fields/types:
  ```
  curl -sS -X POST '<endpoint>/graphql' -H 'Content-Type: application/json' \
    -d '{"query":"{ __schema { queryType { name } types { name kind } } }"}'
  ```
  For a specific type:
  `{"query":"{ __type(name: \"User\") { fields { name type { name kind } } } }"}`
- **Variables**: send them in the `variables` object, not interpolated into the
  query string.
- Common errors: "Cannot query field X" (wrong field/typo — introspect),
  "argument required" (missing variable), auth errors in the `errors` array.

## 4. Script it when iterating

For repeated probing or chained calls (login → use token), write a small script
with `run_python_with_tools` (it can call `http_request` directly) or a Python
`requests` script via `run_python` after `install_packages: requests`. Print
status, headers, and body each step.

## 5. Gotchas

- Pretty-print JSON to read it: pipe through `python -m json.tool` or install
  `jq` (`install_packages: jq`) and `| jq`.
- TLS/cert errors are real signals — don't reflexively add `-k`; understand why.
- Rate limits (429): respect `Retry-After`; back off, don't hammer.
- Redact tokens in anything you report back.

## Deliver

Report the failing request, the diagnostic response (status + key body fields),
the root cause, and the corrected request that now works. Never echo secret
tokens in the summary.
