# --tasks-file Option

## Overview

The `--tasks-file <file>` option allows you to specify the list of npm scripts to run via a JSON file containing an array of strings. This is an alternative to using patterns or listing tasks directly on the command line.

## Usage

```sh
npm-run-all-next --tasks-file ./tasks.json
run-p --tasks-file ./tasks.json
run-s --tasks-file ./tasks.json
```

Where `tasks.json` contains:

```json
["clean", "lint", "build:js", "build:css"]
```

## Features

- Full CLI support for `--tasks-file` in `npm-run-all-next`, `npm-run-all`, `run-p`, and `run-s`.
- If `--tasks-file` is provided, patterns are ignored and only the tasks from the file are executed.
- Maintains backward compatibility: if the option is not present, the CLI works as before.
- Supports all other options (parallel, jobs, retries, child-retries, etc.) in combination with `--tasks-file`.

## Error Handling

- If the file is missing or not a valid JSON array of strings, an error is thrown.
- If the array is empty, no tasks are executed.

## Node API

You can also use the `taskList` option in the Node API:

```js
npmRunAll([], { taskList: ["clean", "lint"] })
```
