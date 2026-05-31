---
name: data-to-excel-workflow
description: Search for structured data, compile into a multi-sheet Excel file with Python, handle incomplete or unreleased data gracefully, and deliver a temporary sandbox download URL.
tags: data-processing, excel, python, sandbox
updated: 2026-05-31T03:43:16.890Z
---

# Data-to-Excel Workflow

## Purpose
Transform searched structured data into a multi-sheet Excel workbook and deliver a temporary sandbox URL.

## Steps

1. **Clarify Scope**: Determine what data the user needs, expected sheets, columns, and any filtering criteria.
2. **Search & Extract**: Use `search_web` to find authoritative sources. Use `browse_web` to extract tables, lists, or structured text. If the exact data is not yet available (e.g., future fixtures not released), identify what metadata is accessible (teams, dates, structure).
3. **Handle Incomplete Data**: If the full dataset is unavailable:
   - Document clearly what is missing and when it is expected.
   - Compile available substitute data into meaningful sheets.
   - Offer to regenerate once the full data is released.
4. **Build Workbook**: Use `run_python` with `pandas` and `openpyxl` to:
   - Create multiple sheets with clear headers.
   - Apply basic formatting (column widths, header bolding).
   - Save to `/home/user/` or the sandbox working directory.
5. **Deliver**: Use `get_sandbox_file_url` to generate a temporary download link. Present the link, summarize each sheet, and state any data completeness caveats.
