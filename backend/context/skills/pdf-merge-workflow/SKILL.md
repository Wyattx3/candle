---
name: pdf-merge-workflow
description: Merge multiple input PDFs (URLs or sandbox paths) into one PDF and deliver a download URL.
tags: pdf, document, merge, combine
---

# PDF Merge Workflow

Goal: combine multiple PDFs into a single file and return a sandbox URL.

## Steps

1. **Resolve sources.** If inputs are URLs, download each into
   `/home/user/inputs/` first using `run_python` + `requests`. If they're
   already in the sandbox, skip this step.
2. **Install `pypdf`** with `install_packages(manager="pip", packages=["pypdf"])`.
   Do not check whether it's already installed — just install.
3. **Run the merge** with `run_python`:
   ```python
   from pypdf import PdfWriter
   import os, glob
   writer = PdfWriter()
   for path in sorted(glob.glob("/home/user/inputs/*.pdf")):
       writer.append(path)
   out = "/home/user/artifacts/merged.pdf"
   os.makedirs(os.path.dirname(out), exist_ok=True)
   with open(out, "wb") as f:
       writer.write(f)
   print(out)
   ```
4. **Verify** with `run_terminal "ls -la /home/user/artifacts/merged.pdf"`.
   Confirm the file exists and is non-empty.
5. **Deliver** the URL with `get_sandbox_file_url(path="/home/user/artifacts/merged.pdf")`.
   Mention page count and file size in the final reply.

## Anti-patterns

- Don't try `PyPDF2` first — `pypdf` is the maintained successor.
- Don't merge in chunks unless the inputs total >100 MB; the simple path
  above works for the typical case.
