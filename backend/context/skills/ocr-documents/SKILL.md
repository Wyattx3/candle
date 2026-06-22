---
name: ocr-documents
description: Extract text from scanned PDFs and images using tesseract OCR - install tesseract + poppler, rasterize with pdf2image, and run pytesseract in the sandbox.
tags: ocr, tesseract, pdf, image, text-extraction, python
---

# OCR Scanned Documents

Goal: pull machine-readable text out of **scanned PDFs or images** (photos,
faxes, screenshots) where normal text extraction returns nothing. Deliver the
extracted text (and optionally a searchable PDF) via a sandbox URL.

## When to use
- `pdfplumber`/`pypdf` returns empty text → the PDF is image-only.
- Source is a `.png/.jpg/.tiff` of a document.
Plain digital PDFs do NOT need OCR — use the **pdf-editing** skill instead.

## Setup
OCR engine + the PDF rasterizer are system packages, then the Python bindings:
```
install_packages(manager="apt", packages=["tesseract-ocr", "poppler-utils"])
install_packages(manager="pip", packages=["pytesseract", "pdf2image", "Pillow"])
```
For non-English text, add the language data pack, e.g. Burmese / Chinese:
```
install_packages(manager="apt", packages=["tesseract-ocr-mya", "tesseract-ocr-chi-sim"])
```
Verify the engine and languages:
```
run_terminal("tesseract --version && tesseract --list-langs")
```

Fetch the source if it's remote (`http_request` → `write_sandbox_file` to
`/home/user/scan.pdf`).

## OCR an image (run_python)
```python
import pytesseract
from PIL import Image
img = Image.open("/home/user/scan.png")
text = pytesseract.image_to_string(img, lang="eng")   # e.g. "eng+mya"
open("/home/user/ocr.txt", "w", encoding="utf-8").write(text)
print(text[:500])
```

## OCR a scanned PDF (rasterize each page, then OCR)
```python
from pdf2image import convert_from_path
import pytesseract

pages = convert_from_path("/home/user/scan.pdf", dpi=300)   # 300 dpi = good accuracy
chunks = []
for i, page in enumerate(pages):
    chunks.append(f"\n--- page {i+1} ---\n")
    chunks.append(pytesseract.image_to_string(page, lang="eng"))
open("/home/user/ocr.txt", "w", encoding="utf-8").write("".join(chunks))
print("pages OCR'd:", len(pages))
```

## Make a searchable PDF (optional, keeps the original layout)
```
install_packages(manager="pip", packages=["ocrmypdf"])
run_terminal("ocrmypdf --force-ocr /home/user/scan.pdf /home/user/searchable.pdf")
```
`ocrmypdf` bundles tesseract + an invisible text layer over the original images.
Use `-l eng+mya` for other languages.

## Accuracy tips / gotchas
- **DPI matters**: 300 dpi is the sweet spot. Below 200 accuracy drops fast.
- **Preprocess noisy scans** before OCR — grayscale + threshold helps:
  ```python
  from PIL import Image
  g = Image.open("/home/user/scan.png").convert("L")
  bw = g.point(lambda x: 0 if x < 140 else 255, "1")   # binarize
  bw.save("/home/user/clean.png")
  ```
- Always pass the right `lang` — the default `eng` mangles other scripts.
  Confirm the pack is installed (`--list-langs`) or you'll get an error.
- `convert_from_path` needs poppler (the apt step) — without it you get
  "Unable to get page count".
- Rotated scans: tesseract has OSD; `image_to_osd` reports orientation so you
  can rotate with Pillow before OCR.

## Deliver
```
run_terminal("ls -lh /home/user/ocr.txt")
get_sandbox_file_url(path="/home/user/ocr.txt")
```
Report the page/character count and any low-confidence sections, then put the
URL on the last line. If you produced a searchable PDF, deliver that too.
