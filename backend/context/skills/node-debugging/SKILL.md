---
name: node-debugging
description: Debug Node/JS in the sandbox with console, stack traces, and node --inspect via run_node/run_terminal - reproduce, trace, fix.
tags: node, javascript, debugging, inspect, async
---

# Node / JavaScript Debugging

Use when Node/JS code throws, returns wrong results, or hangs in the sandbox.
Follow the systematic-debugging loop; this is the Node-specific toolkit.

## 1. Read the stack trace

```
run_terminal: "cd /home/user/proj && node failing.js 2>&1 | tail -n 60"
```
Read top-down here: the first line is the error type/message, then the stack
frames. Find the topmost frame in YOUR code (skip `node_modules` and internal
`node:` frames). For TypeScript, the trace may point at compiled JS — enable
source maps or run via `ts-node`/`tsx` so lines map to source:
```
run_terminal: "npx tsx failing.ts"
```

## 2. Make async failures legible

Async bugs are the most common Node trap.
- **Unhandled rejection** — run with full traces:
  ```
  run_terminal: "node --unhandled-rejections=strict --stack-trace-limit=50 failing.js 2>&1 | tail -n 60"
  ```
- **Forgotten `await`** — a function returns a Promise instead of a value, or
  errors vanish. Log the value: `console.log("typeof", typeof x, x)`. If you see
  `Promise { <pending> }`, you missed an `await`.
- **Errors swallowed in callbacks** — ensure every `.catch` / `try` logs.

## 3. Instrument with console

Add targeted logging with `patch`:
```js
console.log("[dbg] x=", x, "type=", typeof x);
console.trace("[dbg] reached here");   // prints a stack to show the path
console.dir(obj, { depth: null });     // full nested object
```
Log inputs at the function boundary and the value right before the failing
line. `console.trace` is great for "how did we get here".

## 4. Use the inspector for hard cases

```
run_terminal: "node --inspect-brk failing.js"   # starts paused on a debug port
```
The sandbox is non-interactive so an attached DevTools UI isn't practical;
prefer programmatic logging. For breakpoints, insert `debugger;` only if you
have an inspector attached — otherwise it's a no-op. In practice, structured
`console.log` + `console.trace` resolves most sandbox cases faster.

## 5. Common JS bug classes

- **`this` binding** lost in a callback — use arrow functions or `.bind`.
- **`==` vs `===`** coercion; `NaN !== NaN`; `0`/`""`/`null` falsy surprises.
- **Mutating shared objects/arrays** passed by reference.
- **Floating-point** rounding.
- **`undefined` property access** — `obj.a.b` where `a` is undefined. Use `?.`.
- **Module resolution** — CommonJS vs ESM (`require` vs `import`), wrong path.
  `run_terminal: "node -e \"console.log(require.resolve('mod'))\""`.
- **Event loop / hangs** — an open handle (timer, socket) keeps the process
  alive. Run with `node --trace-warnings` or check `why-is-node-running`.

## 6. Verify

Re-run the reproducer (must pass), then the suite:
`run_terminal: "npm test"` / `npx vitest run` / `npx jest`. Run the linter
(`npx eslint .`). Strip debug logs with `patch`.

## Deliver

State the root cause, the fix, and the passing run output. Return a
`get_sandbox_file_url` link if the user needs the corrected file.
