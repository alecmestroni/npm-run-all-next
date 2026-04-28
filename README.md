# npm-run-all-next

[![npm version](https://img.shields.io/npm/v/npm-run-all-next.svg)](https://www.npmjs.com/package/npm-run-all-next)
[![Downloads/month](https://img.shields.io/npm/dm/npm-run-all-next.svg)](http://www.npmtrends.com/npm-run-all-next)
[![Coverage](https://codecov.io/gh/alecmestroni/npm-run-all-next/graph/badge.svg?token=RFNGO6EIMF)](https://codecov.io/gh/alecmestroni/npm-run-all-next)

A modern, drop-in task runner for `npm`, `pnpm`, and `yarn`.

It lets you run multiple npm scripts in series or in parallel, with smart features for real-world CI/CD and monorepos:

- robust retries for flaky tasks
- intelligent parallelization / load balancing
- human-friendly summary tables
- cross-platform behavior (Windows / macOS / Linux)
- usable both as CLI (`run-s`, `run-p`, `npm-run-all-next`) and as a Node API

## Why NEXT? 🚀

`npm-run-all-next` is a modern evolution of `npm-run-all`, built for today’s workflows:

- 🔁 `--retries`  
  Automatically retry flaky tasks without rewriting scripts.


> N.B. Retry semantics are intentionally different by execution mode:
> - In parallel mode, `--retries` retries only the failed children, because parallel tasks are managed as isolated executions.
> - In sequential mode, `--retries` retries the whole sequential block from the beginning.

- ⚖️ `--balancer`  
  Parallel tasks are scheduled using historical runtime data, so long-running tasks are started earlier and total build time goes down.

- 📊 `--print-summary-table`  
  Get a final report with exit code, retries, and duration for each task.

- 📂 `--tasks-file`  
  Load task lists from an external file (JSON/JS), so your `package.json` doesn’t become unreadable.

- 🧵 Familiar commands  
  `npm-run-all-next` is the primary command, while `npm-run-all` remains available as a compatibility alias alongside `run-s` and `run-p`.

- 🧪 First-class Node API  
  Run tasks programmatically with `runTasks([...])`.

This tool is designed for CI pipelines, monorepos, and multi-step local dev workflows — not just simple "run two scripts at once."

---

## 📖 Table of Contents

- 📦 [Installation](#-installation)
- 🛠️ [CLI Usage](#-cli-usage)
  - ⚙️ [npm-run-all-next](#npm-run-all-next)
  - ▶️ [run-s (sequential)](#run-s-sequential)
  - 🔀 [run-p (parallel)](#run-p-parallel)
  - 🛡️ [Common Options](#common-options)
- 🔍 [Patterns & Placeholders](#patterns--placeholders)
- 📦 [Node API](#node-api)
- 🤝 [Contributing](#contributing)
- 📄 [License](#license)

---

## 📦 Installation

Install as a development dependency:

```sh
npm install --save-dev npm-run-all-next
```

All commands are exposed in `node_modules/.bin`:

- ✔️ `npm-run-all-next`
- ✔️ `npm-run-all`
- ✔️ `run-s`
- ✔️ `run-p`

You can also add them to your `package.json` scripts:

```jsonc
{
  "scripts": {
    "build:js": "…",
    "build:css": "…",
    "lint": "…",
    "clean": "…",
    "test": "…",
    "serial": "run-s clean lint build:*",
    "parallel": "run-p lint test clean"
  }
}
```

---

## 🛠️ CLI Usage

### ⚙️ npm-run-all-next

This is the branded primary command. `npm-run-all` remains available as a compatible alias.

Mix sequential and parallel groups in one command:

```sh
npm-run-all-next clean lint \
  --parallel build:* \
  --sequential test:* \
  --parallel deploy
```

This runs:

1. **clean** then **lint** (serial)
2. **build:\*** tasks (parallel)
3. **test:\*** tasks (serial)
4. **deploy** (parallel with a single task)

---

### ▶️ run-s (sequential)

Shortcut for `npm-run-all-next --sequential`.
`npm-run-all --sequential` remains supported as a compatibility alias:

```sh
run-s clean lint build:js build:css
```

Equivalent to:

```sh
npm run clean && npm run lint && npm run build:js && npm run build:css
```

---

### 🔀 run-p (parallel)

Shortcut for `npm-run-all-next --parallel`.
`npm-run-all --parallel` remains supported as a compatibility alias:

```sh
run-p test watch serve
```

Equivalent to (Unix shells):

```sh
npm run test & npm run watch & npm run serve
```

> Windows `cmd.exe` does not group `&` well—use `run-p` instead.

---

## 🛡️ Common Options

| Flag                      | Description                                                                |
| ------------------------- | -------------------------------------------------------------------------- |
| -a, --aggregate-output    | 🗃️ Buffer each task’s output and print when all finish (requires parallel) |
| --aggregate-table         | 🧵 Show live thread-usage table during parallel execution (requires `-a`)   |
| -b, --balancer            | ⚖️ Balance tasks based on historical runtimes                              |
| -c, --continue-on-error   | 🚧 Don’t stop other tasks when one fails                                   |
| -k, --kill-others-on-fail | 💥 Kill remaining tasks on first failure (requires parallel)               |
| -r, --race                | 🏁 Stop remaining tasks when one succeeds (requires parallel)              |
| -j, --jobs `<number>`     | 🔢 Max concurrent tasks (default: unlimited; requires parallel)            |
| -t, --print-summary-table | 📊 Show a summary table of results at the end                              |
| -l, --print-label         | 🏷️ Prefix each output line with the task label                             |
| -n, --print-name          | 📝 Print the task name before running                                      |
| --retries `<count>`       | 🔁 Retry each failed task up to `<count>` times                            |
| --inherit-retries         | 🧬 Propagate `--retries` to nested npm-run-all-next/run-s/run-p children   |
| --runtime-file `<path>`   | ⏱️ Save runtime-history file for balancer stats                            |
| --npm-path `<path>`       | 📍 Path to a custom npm executable                                         |
| --silent                  | 🤫 Suppress all output (sets `npm_config_loglevel` to `silent`)            |
| -h, --help                | ❓ Show help                                                               |
| -v, --version             | 🔖 Show version                                                            |
| --tasks-file <file>       | 📂 Load tasks from a JSON file (overrides patterns and <tasks> args)       |

Short flags can be combined (e.g. `-crs` ⇔ `-c -r -s`).

Retry behavior summary:

- `--retries` with parallel groups retries only the failed child tasks
- `--retries` with sequential groups replays the whole sequential block
- `--inherit-retries` propagates the retry count to all nested runner children, recursively

---

## 🔍 Patterns & Placeholders

Need the full cheat sheet? See the pattern and placeholder reference in [docs/npm-run-all.md](./docs/npm-run-all.md), including `*`, `**`, brace expansion, extglobs like `!(ai)`, and fallback placeholders such as `{1:-default}` and `{1:=default}`.

Use glob-like patterns on script names (separator `:`, globstar `**` supported):

```sh
run-p 'build:*'      # matches build:js, build:css
run-s 'test:**'      # matches test:unit, test:unit:api, etc.
```

Forward arguments to scripts:

```sh
run-p "start -- --port {1}" -- 8080
# 👉 expands to: npm run start -- --port 8080
```

**Placeholders**:

- `{1}`, `{2}`, … — 1st, 2nd, … argument
- `{@}` — all args as an array
- `{*}` — all args joined

---

**Brace expansion**

If your shell doesn’t support brace expansion, `npm-run-all-next` will expand patterns like:

```sh
run-p build:{a,b,c} # ↔> run-p build:a build:b build:c
```

…so you can target multiple scripts in one pattern.

## 📦 Node API

```js
const { runTasks } = require('npm-run-all-next');

runTasks(['clean', 'lint', 'build:*'], {
  parallel: true,
  retries: 2,
  killOthersOnFail: true,
  printSummaryTable: true,
})
  .then(results => {
    // results: [{ name: 'clean', code: 0 }, …]
    console.log('✅ Done:', results);
  })
  .catch(err => {
    console.error('❌ Failed:', err.results);
  });
```

Options mirror CLI flags:

```ts
interface RunOptions {
  parallel?: boolean;
  aggregateOutput?: boolean;
  balancer?: boolean;
  continueOnError?: boolean;
  killOthersOnFail?: boolean;
  race?: boolean;
  jobs?: number;
  retries?: number;
  inheritRetries?: boolean;
  printSummaryTable?: boolean;
  printLabel?: boolean;
  printName?: boolean;
  npmPath?: string;
  silent?: boolean;
  stdin?: Stream;
  stdout?: Stream;
  stderr?: Stream;
  taskList?: string[];
}
```

For the Node API, sequential executions already retry per task when you pass `retries`.

Set `inheritRetries: true` to propagate the retry count to nested npm-run-all-next/run-s/run-p children.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!  
See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

---

## 📚 Main docs

| index | [npm-run-all-next] | [run-s] | [run-p] | [Node API] |
| ----- | ------------------ | ------- | ------- | ---------- |

[npm-run-all-next]: docs/npm-run-all.md
[run-s]: docs/run-s.md
[run-p]: docs/run-p.md
[node api]: docs/node-api.md

---

## 📄 License

MIT © 2025 Alec Mestroni
