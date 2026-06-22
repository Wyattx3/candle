---
name: wiki-knowledge-search
description: Query Wikipedia and knowledge bases via their public APIs, extract and cite facts, and cross-check with web search.
tags: wikipedia, knowledge, facts, citations
---

# Wiki Knowledge Search

When a user wants factual, encyclopedic information (definitions, history, biographies, summaries) with citations.

## Steps
1. **Search for the right article.** Use the Wikipedia OpenSearch/REST API via `http_request`:
   - Search: `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=<terms>&format=json` → gives candidate page titles.
   - Disambiguate by picking the title that matches intent.

2. **Pull the summary.** REST summary endpoint is clean and concise:
   - `https://en.wikipedia.org/api/rest_v1/page/summary/<Title>` → JSON with `extract`, `description`, `content_urls`.
   - For full article text/sections: `https://en.wikipedia.org/w/api.php?action=parse&page=<Title>&prop=wikitext|text&format=json`, or `&prop=extracts&explaintext=1` via the query API for plain text.

3. **Other knowledge bases when relevant:**
   - **Wikidata** for structured facts: `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=<term>&language=en&format=json`, then fetch the entity for typed claims (dates, identifiers, relations).
   - **DBpedia**, **MediaWiki sites** (Fandom, etc.) follow the same `api.php` shape.

4. **Cross-check.** For anything contested or time-sensitive, confirm with `search_web` + `browse_web` against a second source. Wikipedia can be outdated or vandalized — verify surprising claims.

5. **Extract & cite.** Pull the specific facts requested. For each, cite the article title + section + URL (and revision date if precision matters). Use `run_python` to parse JSON if the response is large.

6. **Deliver.** For a short answer, respond inline with inline citations. For a longer brief, write `/home/user/wiki_brief.md` and return a `get_sandbox_file_url` link, ending with a Sources list.

## Gotchas
- Use the REST summary endpoint for speed; only fetch full wikitext when you need detail (it's verbose and contains markup/templates).
- URL-encode titles (spaces → `_` or `%20`).
- Language editions differ — pick the right subdomain (`en.`, `de.`, etc.) for the user's language.
- Distinguish encyclopedic consensus from a single cited claim; note when a fact is marked "citation needed".
