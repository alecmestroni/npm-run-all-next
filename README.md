# npm-run-all-next

[![npm version](https://img.shields.io/npm/v/npm-run-all-next.svg)](https://www.npmjs.com/package/npm-run-all-next)
[![Downloads/month](https://img.shields.io/npm/dm/npm-run-all-next.svg)](http://www.npmtrends.com/npm-run-all-next)
![Build Status](https://img.shields.io/github/actions/workflow/status/alecmestroni/npm-run-all-next/ci.yml?branch=main)
[![Coverage](https://codecov.io/gh/alecmestroni/npm-run-all-next/graph/badge.svg?token=RFNGO6EIMF)](https://codecov.io/gh/alecmestroni/npm-run-all-next)

A CLI utility and programmatic API to execute multiple npm scripts **in sequence** or **in parallel**, now enhanced with **retry**, **kill-on-fail** and **race** features.

---

## 📚 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [CLI Usage](#-cli-usage)
- [Node API](#-node-api)
- [Options](#-options)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)

---

## 🌟 Features

- **Sequential (`run-s`)** and **parallel (`run-p`)** execution of npm scripts
- **Retries**: automatically retry failed tasks up to `--retry <count>` times
- **Kill-on-fail**: abort all running tasks on first failure with `--kill-on-fail`
- **Race mode**: stop remaining tasks on first success with `--race`
- **Summary report**: display a table of results (`--summary`)
- **Aggregate output**: buffer per-task logs and print at the end (`--aggregate-output`)
- Full **Node.js API** for programmatic control

---

## 🔧 Installation

```sh
npm install --save-dev npm-run-all-next
```

---

## 💻 CLI Usage

### Run in sequence

```sh
npx npm-run-all-next run-s taskA taskB taskC
```

### Run in parallel

```sh
npx npm-run-all-next run-p taskX taskY taskZ
```

### Common flags

- `--retry <count>`: retry each task up to `<count>` times (default: `0`)
- `--kill-on-fail`: abort all running tasks when one fails
- `--race`: abort remaining tasks on first success
- `--summary`: display summary table at completion
- `--aggregate-output`: collect and print each task’s output after all finish
- `--parallel, -p`: run tasks in concurrently
- `--jobs, -j <num>`: max concurrent tasks (default: all)
- `--continue-on-error`: continue other tasks even if one fails
- `--balancer`: distribute tasks based on historical runtime data and tasks weight

**Example**

```sh
npx npm-run-all-next run-p build test lint --retry 1 --kill-on-fail --summary
```

---

## 📦 Node API

```js
const { runTasks } = require('npm-run-all-next')

runTasks(['build', 'test'], {
  parallel: 2,
  retry: 1,
  killOthersOnFail: true,
  summary: true,
})
  .then((results) => {
    console.log(results)
  })
  .catch((err) => {
    console.error('Error running tasks:', err.results)
  })
```

### API Options

| Option             | Type    | Default        | Description                                              |
| ------------------ | ------- | -------------- | -------------------------------------------------------- |
| `parallel`         | Boolean | `false`        | Run tasks in parallel jobs                               |
| `job`              | Number  | `tasks.length` | Max number of concurrent tasks                           |
| `retry`            | Number  | `0`            | Number of retry attempts per task                        |
| `killOthersOnFail` | Boolean | `false`        | Abort all tasks on first failure                         |
| `race`             | Boolean | `false`        | Stop tasks on first successful completion                |
| `summary`          | Boolean | `false`        | Print results table after execution                      |
| `aggregateOutput`  | Boolean | `false`        | Buffer and emit each task’s output at the end            |
| `continueOnError`  | Boolean | `false`        | Don’t abort other tasks on failure                       |
| `balancer`         | Boolean | `false`        | Distribute tasks based on historical runtimes and weight |

---

## 🚀 Roadmap

- **Orchestrator balancer**: distribute tasks based on historical timing (inspired by cypress-parallel)
- Advanced reporting and custom hooks
- Plugin system for community extensions

---

## 🤝 Contributing

Contributions, issues and feature requests are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md).

---

© 2025 Alec Mestroni. Maintained by the community.
