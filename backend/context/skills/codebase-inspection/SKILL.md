---
name: codebase-inspection
description: Systematically map an unfamiliar repo - entry points, data flow, build/test commands - and summarize the architecture.
tags: codebase, exploration, architecture, onboarding, repo-map
---

# Codebase Inspection

Use when you land in an unfamiliar repository and need to understand it before
changing anything. The goal is an accurate mental model: what it does, how it's
structured, how to build and test it, and where the important logic lives.

## Steps

### 1. Get the lay of the land

```
run_terminal: "cd /home/user/repo && ls -la"
run_terminal: "git log --oneline -15"          # recent activity, what's active
run_terminal: "find . -maxdepth 2 -type d -not -path '*/node_modules/*' -not -path '*/.git/*'"
```
Read the top-level README and any docs first if present
(`read_sandbox_file`) — they often hand you the architecture for free.

### 2. Identify language, build, and test commands

Look at the manifest/config to learn how it runs:
```
read_sandbox_file: package.json | pyproject.toml | requirements.txt | pom.xml | Cargo.toml | Makefile | go.mod
```
Extract the real commands: build, test, lint, start. Note the package manager.
Don't guess `npm test` — read the scripts block.

### 3. Find the entry points

```
run_terminal: "rg -n 'def main|if __name__|func main|export default|app.listen|createServer' --type-add 'src:*.{ts,js,py,go,java}' -tsrc"
```
Common entry points: `main.*`, `index.*`, `server.*`, `app.*`, `cli.*`, or the
`main`/`bin`/`scripts.start` field in the manifest. Read the top one or two with
`read_sandbox_file`.

### 4. Trace the data flow

Pick the primary use case (e.g. "handle a request") and follow it from entry
point inward: which module receives input, where it's validated, what it calls,
where it persists/returns. Use `rg` to jump between call sites:
```
run_terminal: "rg -n 'functionName' "       # find definition + callers
```
Map the layers: routing → business logic → data access. Note key modules and
what each owns.

### 5. Find the seams

- Config & env: `rg -n 'process.env|os.environ|getenv'` and any `.env.example`.
- External deps: which DBs, APIs, services it talks to.
- Tests: where they live and what they cover — `find . -name '*test*'`. Tests
  are excellent documentation of intended behavior.

### 6. Verify your model

Run the build and tests to confirm the commands work and the repo is healthy:
```
install_packages: <deps>     # npm install / pip install -r requirements.txt
run_terminal: "<build cmd>" ; "<test cmd>"
```

## For large repos

If the repo is big and the question is broad, delegate the survey to a worker:
`spawn_subagent` with a precise task ("map the auth flow: list the files and
functions a login request passes through, in order"). Fold its summary into
your map.

## Deliver

Produce a concise architecture summary: purpose, top-level layout, entry
points, the main data-flow path, how to build/test, key modules, and external
dependencies. Note anything surprising or risky. Keep it to what a new
contributor needs.
