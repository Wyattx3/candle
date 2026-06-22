---
name: cli-tool-building
description: Build a small CLI tool in the sandbox (argparse/commander), test it via run_terminal, then package and deliver it.
tags: cli, tooling, argparse, commander, packaging
---

# CLI Tool Building

Use when the task is "build a command-line tool" to do X. Pick the language that
fits the task and the user's ecosystem, build it in the sandbox, test it with
real invocations, then package and deliver.

## Steps

### 1. Define the interface first

Before coding, nail down the contract: command name, positional args, options/
flags, defaults, input (stdin/file/args), output (stdout/file), and exit codes.
A CLI that's clear about its interface is half-built. Sketch the usage line:
```
mytool [--output FILE] [--verbose] INPUT
```

### 2. Scaffold

```
manage_sandbox_files: mkdir /home/user/mytool
```

**Python (argparse — no deps):**
```
write_sandbox_file: /home/user/mytool/mytool.py
---
#!/usr/bin/env python3
import argparse, sys

def main(argv=None):
    p = argparse.ArgumentParser(description="What it does")
    p.add_argument("input", help="input file or value")
    p.add_argument("-o", "--output", help="output path")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args(argv)
    # ... do the work ...
    return 0

if __name__ == "__main__":
    sys.exit(main())
```
For richer CLIs prefer `click` or `typer`: `install_packages: typer`.

**Node (commander):**
```
run_terminal: "cd /home/user/mytool && npm init -y"
install_packages: commander
write_sandbox_file: /home/user/mytool/cli.js
---
#!/usr/bin/env node
const { program } = require("commander");
program
  .argument("<input>", "input file or value")
  .option("-o, --output <file>", "output path")
  .option("-v, --verbose", "verbose logging")
  .action((input, opts) => { /* do work */ });
program.parse();
```
Add `"bin": { "mytool": "cli.js" }` to package.json for installability.

### 3. Make it executable and self-documenting

```
run_terminal: "cd /home/user/mytool && chmod +x mytool.py"   # or cli.js
```
Ensure `--help` works and is clear — argparse/commander generate it for free.

### 4. Test with real invocations

Exercise the happy path, the flags, and the failure modes via `run_terminal`:
```
run_terminal: "cd /home/user/mytool && python mytool.py --help"
run_terminal: "python mytool.py sample.txt -o out.txt -v"
run_terminal: "python mytool.py ; echo \"exit=$?\""        # missing arg -> nonzero exit + usage
run_terminal: "echo 'piped' | python mytool.py -"          # stdin if supported
```
For Node: `node cli.js --help`, etc. Confirm: correct output, sensible errors
on bad input, and a non-zero exit code on failure. Add a couple of unit tests
(see test-driven-development) for the core logic if it's non-trivial.

### 5. Package for delivery

- **Python single file**: it's already portable; optionally bundle deps with
  `install_packages: pyinstaller` then
  `run_terminal: "pyinstaller --onefile mytool.py"` (artifact in `dist/`).
- **Node**: ensure `package.json` `bin` is set; `npm pack` produces a tarball,
  or zip the folder.
- **Zip the project** for an easy download:
  ```
  manage_sandbox_files: zip /home/user/mytool -> /home/user/mytool.zip
  ```

### 6. Gotchas

- Always set exit codes: 0 success, non-zero failure. Scripts and pipelines
  depend on them.
- Write errors/diagnostics to stderr, real output to stdout, so the tool pipes
  cleanly.
- Validate inputs and fail with a clear message, not a stack trace.
- Don't hardcode paths; take them as args/options.
- Keep `--help` accurate as you add features.

## Deliver

Return a `get_sandbox_file_url` link to the zipped tool (or the single script /
built binary), plus a short usage summary and the test invocations you ran to
prove it works.
