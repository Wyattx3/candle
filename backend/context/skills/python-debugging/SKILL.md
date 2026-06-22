---
name: python-debugging
description: Debug Python in the sandbox with tracebacks, logging, pdb/breakpoint() and targeted instrumentation via run_python.
tags: python, debugging, pdb, logging, traceback
---

# Python Debugging

Use when Python code raises, returns wrong results, or behaves oddly in the
sandbox. Combine reading the traceback, targeted logging, and pdb. Follow the
systematic-debugging loop; this skill is the Python-specific toolkit.

## 1. Read the traceback properly

Run the failing code and capture the full trace:
```
run_terminal: "cd /home/user/proj && python -X dev failing.py 2>&1 | tail -n 60"
```
Read it bottom-up: the LAST line is the exception type and message; the frames
above show the call path. The frame nearest the bottom that's in YOUR code
(not a library) is usually where to look first. Note file, line, and the
variables named in the message.

## 2. Get more from the trace

- `python -X dev` enables dev mode (extra warnings).
- For deeper context on an exception, run under a wrapper that prints locals:
  ```
  run_python: "import traceback, sys\ntry:\n    import failing  # or call the func\nexcept Exception:\n    traceback.print_exc()"
  ```
- For chained exceptions, read the "During handling of the above exception"
  sections — the original cause is the first one.

## 3. Instrument with logging (preferred over scattered prints)

Add targeted logging around the suspect area with `patch`:
```python
import logging
logging.basicConfig(level=logging.DEBUG, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)
log.debug("x=%r type=%s", x, type(x))
```
Re-run with `run_terminal`/`run_python` and read what the values actually are
vs what you expected. Log the inputs at the function boundary and the value
right before the failing line.

## 4. Use pdb for interactive-style inspection

Since the sandbox is non-interactive, drive pdb with a script or use targeted
techniques:
- Drop into post-mortem automatically on crash:
  ```
  run_terminal: "python -m pdb -c continue failing.py"   # stops at the exception
  ```
  then it prints the frame; inspect with one-shot commands isn't interactive,
  so prefer the programmatic approach below.
- Programmatic inspection without interactivity:
  ```
  run_python: "import pdb\n# set a trace via sys.settrace, or just add prints"
  ```
- For a quick stop-and-dump, insert `breakpoint()` then run with
  `PYTHONBREAKPOINT` set to a non-interactive handler, or simpler: replace it
  with explicit logging of the locals you'd inspect. In a sandbox, logging
  beats interactive pdb.

## 5. Common Python bug classes

- **Mutable default args** (`def f(x=[])`) — shared across calls.
- **Late binding in closures/loops** — capture with a default arg.
- **`is` vs `==`**, integer caching surprises.
- **Encoding** — bytes vs str, default encoding. Print `repr()`.
- **Import shadowing** — a local file named like a stdlib module.
  `run_python: "import mod; print(mod.__file__)"`.
- **Off-by-one / slice** edges.
- **None propagation** — a function returning None silently.

## 6. Verify

Re-run the original reproducer (it must pass), then `run_terminal: "pytest -q"`.
Strip the debug logging with `patch`.

## Deliver

State the root cause, the fix, and the passing run output. Return a
`get_sandbox_file_url` link if the user needs the corrected file.
