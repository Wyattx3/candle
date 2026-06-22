---
name: arxiv-research
description: Find, download, and read arXiv papers — search by topic, fetch PDFs into the sandbox, extract text, and summarize with citations.
tags: arxiv, papers, research, pdf
---

# arXiv Research

When a user wants to find academic papers on arXiv, read a specific paper, or get a literature summary on a topic.

## Steps

1. **Find candidate papers.** Prefer the arXiv API (clean, structured, no scraping) over web search.
   - Use `http_request` to GET `http://export.arxiv.org/api/query?search_query=all:<terms>&start=0&max_results=10&sortBy=relevance`.
   - The response is Atom XML. Parse it in `run_python` with `feedparser` (install via `install_packages` if missing): each entry has `title`, `summary`, `authors`, `published`, `id` (the abs URL), and a `links` list where `rel="related" title="pdf"` is the PDF URL.
   - If you only have a paper title/topic, `search_web "<title> arxiv"` also works to locate the arXiv id.

2. **Download PDFs to the sandbox.** The PDF URL is `https://arxiv.org/pdf/<id>.pdf`. Use `run_python` with `requests` (or `run_terminal` with `curl -L -o /home/user/<id>.pdf <url>`). Save into `/home/user/papers/`.

3. **Extract text.** In `run_python`, install and use `pypdf`:
   ```python
   from pypdf import PdfReader
   reader = PdfReader("/home/user/papers/2401.12345.pdf")
   text = "\n".join(p.extract_text() or "" for p in reader.pages)
   ```
   For scanned/figure-heavy PDFs where `extract_text()` is empty, fall back to OCR: the sandbox has `tesseract` and `poppler` (`pdftoppm` → image → `pytesseract`).

4. **Read at scale.** To survey many papers in one turn, use `run_python_with_tools` to loop: for each arXiv id, http_request the abstract page and collect summaries without flooding context. Or `spawn_subagents_parallel` (2-4 workers) each reading a different paper's full text.

5. **Summarize.** Produce sections: problem, method, key results, limitations. Always cite arXiv id + title + authors + year. Write the summary to `/home/user/arxiv_summary.md`.

6. **Deliver.** `create_artifact` or `get_sandbox_file_url` on the summary (and the PDFs if the user wants them). Return the link plus a short inline abstract.

## Gotchas
- The arXiv API rate-limits aggressive polling — add a ~3s sleep between calls in loops.
- `id` from the API includes a version suffix (`v2`); strip it if matching titles.
- Very large PDFs: extract only the first N pages + conclusion to stay within budget.
- Never claim a result the paper does not state — quote the abstract when uncertain.
