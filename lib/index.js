/**
 * @module index
 * @author Toru Nagashima
 * @copyright 2015 Toru Nagashima. All rights reserved.
 * See LICENSE file in root directory for full license.
 */
"use strict"

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const shellQuote = require("shell-quote")
const matchTasks = require("./match-tasks")
const readPackageJson = require("./read-package-json")
const runTasks = require("./run-tasks")
const { Writable } = require("stream") // added to create null streams

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const ARGS_PATTERN = /\{(!)?([*@]|\d+)([^}]+)?}/g

// New helper to create a no-op stream.
function createNullStream() {
  return new Writable({
    write(chunk, encoding, callback) {
      callback()
    }
  })
}

function toArray(x) {
  if (x == null) {
    return []
  }
  return Array.isArray(x) ? x : [x]
}

function applyArguments(patterns, args) {
  const defaults = Object.create(null)
  return patterns.map((pattern) =>
    pattern.replace(ARGS_PATTERN, (whole, indirectionMark, id, options) => {
      if (indirectionMark != null) {
        throw new Error(`Invalid Placeholder: ${whole}`)
      }
      if (id === "@") {
        return shellQuote.quote(args)
      }
      if (id === "*") {
        return shellQuote.quote([args.join(" ")])
      }
      const position = parseInt(id, 10)
      if (position >= 1 && position <= args.length) {
        return shellQuote.quote([args[position - 1]])
      }
      if (options != null) {
        const prefix = options.slice(0, 2)
        if (prefix === ":=") {
          defaults[id] = shellQuote.quote([options.slice(2)])
          return defaults[id]
        }
        if (prefix === ":-") {
          return shellQuote.quote([options.slice(2)])
        }
        throw new Error(`Invalid Placeholder: ${whole}`)
      }
      if (defaults[id] != null) {
        return defaults[id]
      }
      return ""
    })
  )
}

function parsePatterns(patternOrPatterns, args) {
  const patterns = toArray(patternOrPatterns)
  const hasPlaceholder = patterns.some((pattern) => ARGS_PATTERN.test(pattern))
  return hasPlaceholder ? applyArguments(patterns, args) : patterns
}

function toOverwriteOptions(config) {
  const opts = []
  for (const pkg of Object.keys(config)) {
    const pkgCfg = config[pkg]
    for (const varName of Object.keys(pkgCfg)) {
      opts.push(`--${pkg}:${varName}=${pkgCfg[varName]}`)
    }
  }
  return opts
}

function toConfigOptions(config) {
  return Object.keys(config).map((key) => `--${key}=${config[key]}`)
}

function maxLength(length, name) {
  return Math.max(name.length, length)
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

/**
 * Runs npm-scripts matched by patterns, with retry and optional summary.
 *
 * @param {string|string[]} patternOrPatterns - Patterns to run.
 * @param {object} [options] - Various flags and streams.
 * @param {boolean} options.parallel
 * @param {stream.Readable|null} options.stdin
 * @param {stream.Writable|null} options.stdout
 * @param {stream.Writable|null} options.stderr
 * @param {object} options.config
 * @param {object} options.packageConfig
 * @param {boolean} options.continueOnError
 * @param {boolean} options.printLabel
 * @param {boolean} options.printName
 * @param {boolean} options.race
 * @param {number} options.maxParallel
 * @param {boolean} options.aggregateOutput
 * @param {string} options.npmPath
 * @param {number} options.retry
 * @param {boolean} options.summary
 * @returns {Promise}
 */
module.exports = function npmRunAll(patternOrPatterns, options) {
  options = options || {}
  const silent = Boolean(options.silent)
  const stdin = options.stdin || null
  const aggregateOutput = Boolean(options.aggregateOutput)
  const stdout = silent && !aggregateOutput ? createNullStream() : options.stdout || null
  const stderr = silent && !aggregateOutput ? createNullStream() : options.stderr || null
  const taskList = options.taskList || null
  const config = options.config || null
  const packageConfig = options.packageConfig || null
  const args = options.arguments || []
  const parallel = Boolean(options.parallel)
  const continueOnError = Boolean(options.continueOnError)
  const printLabel = Boolean(options.printLabel)
  const printName = Boolean(options.printName)
  const race = Boolean(options.race)
  const maxParallel = parallel ? options.maxParallel || 0 : 1
  const npmPath = options.npmPath
  const retry = Number(options.retry) || 0
  const summary = Boolean(options.summary)

  try {
    const patterns = parsePatterns(patternOrPatterns, args)
    if (patterns.length === 0) {
      return Promise.resolve(null)
    }
    if (taskList != null && !Array.isArray(taskList)) {
      throw new Error("Invalid options.taskList")
    }
    if (typeof maxParallel !== "number" || maxParallel < 0) {
      throw new Error("Invalid options.maxParallel")
    }
    if (!parallel && aggregateOutput) {
      throw new Error("Invalid options.aggregateOutput; It requires parallel")
    }
    if (!parallel && race) {
      throw new Error("Invalid options.race; It requires parallel")
    }

    const prefixOptions = []
      .concat(silent ? ["--silent"] : [])
      .concat(packageConfig ? toOverwriteOptions(packageConfig) : [])
      .concat(config ? toConfigOptions(config) : [])

    return Promise.resolve()
      .then(() => {
        if (taskList != null) {
          return { taskList, packageInfo: null }
        }
        return readPackageJson()
      })
      .then((x) => {
        const tasks = matchTasks(x.taskList, patterns)
        const labelWidth = tasks.reduce(maxLength, 0)

        const runOpts = {
          stdin,
          stdout,
          stderr,
          prefixOptions,
          continueOnError,
          labelState: {
            enabled: printLabel,
            width: labelWidth,
            lastPrefix: null,
            lastIsLinebreak: true
          },
          printName,
          packageInfo: x.packageInfo,
          race,
          maxParallel,
          npmPath,
          aggregateOutput,
          retry,
          summary
        }
        return runTasks(tasks, runOpts)
      })
  } catch (err) {
    return Promise.reject(new Error(err.message))
  }
}
