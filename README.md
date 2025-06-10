# 🚀 npm-run-all-next 🚀

[![npm version](https://img.shields.io/npm/v/npm-run-all-next.svg)](https://www.npmjs.com/package/npm-run-all-next)  
[![Downloads/month](https://img.shields.io/npm/dm/npm-run-all-next.svg)](http://www.npmtrends.com/npm-run-all-next)  
![Build Status](https://img.shields.io/github/actions/workflow/status/alecmestroni/npm-run-all-next/ci.yml?branch=main)  
[![Coverage](https://codecov.io/gh/alecmestroni/npm-run-all-next/graph/badge.svg?token=RFNGO6EIMF)](https://codecov.io/gh/alecmestroni/npm-run-all-next)

A CLI and programmatic API to run multiple npm scripts **sequentially** or **in parallel**, with built-in support for **retries**, **kill-on-fail**, **race**, summary reporting, and more.

---

## 📚 Main docs

| index | [npm-run-all] | [run-s] | [run-p] | [Node API] |
| ----- | ------------- | ------- | ------- | ---------- |


[npm-run-all]: docs/npm-run-all.md
[run-s]: docs/run-s.md
[run-p]: docs/run-p.md
[node api]: docs/node-api.md

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
    "parallel": "run-p test watch serve"
  }
}
```

---

## 🛠️ CLI Usage

### ⚙️ npm-run-all-next

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

Shortcut for `npm-run-all-next --sequential`:

```sh
run-s clean lint build:js build:css
```

Equivalent to:

```sh
npm run clean && npm run lint && npm run build:js && npm run build:css
```

---

### 🔀 run-p (parallel)

Shortcut for `npm-run-all-next --parallel`:

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
| -b, --balancer            | ⚖️ Balance tasks based on historical runtimes                              |
| -c, --continue-on-error   | 🚧 Don’t stop other tasks when one fails                                   |
| -k, --kill-others-on-fail | 💥 Kill remaining tasks on first failure (requires parallel)               |
| -r, --race                | 🏁 Stop remaining tasks when one succeeds (requires parallel)              |
| -j, --jobs `<number>`     | 🔢 Max concurrent tasks (default: unlimited; requires parallel)            |
| -t, --print-summary-table | 📊 Show a summary table of results at the end                              |
| -l, --print-label         | 🏷️ Prefix each output line with the task label                             |
| -n, --print-name          | 📝 Print the task name before running                                      |
| --retries `<count>`       | 🔁 Retry each failed task up to `<count>` times                            |
| --npm-path `<path>`       | 📍 Path to a custom npm executable                                         |
| --silent                  | 🤫 Suppress all output (sets `npm_config_loglevel` to `silent`)            |
| -h, --help                | ❓ Show help                                                               |
| -v, --version             | 🔖 Show version                                                            |

Short flags can be combined (e.g. `-crs` ⇔ `-c -r -s`).

---

## 🔍 Patterns & Placeholders

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

If your shell doesn’t support brace expansion, `npm-run-all` will expand patterns like:

```sh
run-p build:{a,b,c} # ↔> run-p build:a build:b build:c
```

…so you can target multiple scripts in one pattern.

## 📦 Node API

```js
const { runTasks } = require('npm-run-all-next')

runTasks(['clean', 'lint', 'build:*'], {
  parallel: true,
  retries: 2,
  killOthersOnFail: true,
  printSummaryTable: true,
})
  .then((results) => {
    // results: [{ name: 'clean', code: 0 }, …]
    console.log('✅ Done:', results)
  })
  .catch((err) => {
    console.error('❌ Failed:', err.results)
  })
```

Options mirror CLI flags:

```ts
interface RunOptions {
  parallel?: boolean
  aggregateOutput?: boolean
  balancer?: boolean
  continueOnError?: boolean
  killOthersOnFail?: boolean
  race?: boolean
  jobs?: number
  retries?: number
  printSummaryTable?: boolean
  printLabel?: boolean
  printName?: boolean
  npmPath?: string
  silent?: boolean
  stdin?: Stream
  stdout?: Stream
  stderr?: Stream
  taskList?: string[]
}
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!  
See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## 📄 License

MIT © 2025 Alec Mestroni
