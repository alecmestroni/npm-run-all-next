/**
 * @module index
 * @author Toru Nagashima (2015)
 * @author Alec Mestroni (2025)
 * @copyright 2015 Toru Nagashima
 * @copyright 2025 Alec Mestroni
 * See LICENSE file in root directory for full license.
 */
'use strict'

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

// Utility to handle shell-quoting of command-line arguments
const shellQuote = require('shell-quote')
// Matches npm scripts against given patterns
const matchTasks = require('./match-tasks')
// Reads and parses package.json
const readPackageJson = require('./read-package-json')
// Executes the matched tasks
const runTasks = require('./run-tasks')
// Writable stream constructor for creating no-op streams
const { Writable } = require('stream') // added to create null streams

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

// Regular expression for matching argument placeholders in patterns
const ARGS_PATTERN = /\{(!)?([*@]|\d+)([^}]+)?}/g

/**
 * Creates a writable stream that discards all data (no-op)
 * @returns {Writable}
 */
function createNullStream() {
  return new Writable({
    write(chunk, encoding, callback) {
      callback()
    }
  })
}

/**
 * Ensures the input is always an array
 * @param {string|string[]|null|undefined} x
 * @returns {string[]}
 */
function toArray(x) {
  if (x == null) {
    return []
  }
  return Array.isArray(x) ? x : [x]
}

/**
 * Replaces placeholders in patterns with the provided arguments
 * Supports positional ({1}, {2}), all-args ({@}), and joined ({*})
 * Also handles default values with ":=" and ":-" syntax
 * @param {string[]} patterns
 * @param {string[]} args
 * @returns {string[]}
 */
function applyArguments(patterns, args) {
  const defaults = Object.create(null)
  return patterns.map((pattern) =>
    pattern.replace(ARGS_PATTERN, (whole, indirectionMark, id, options) => {
      if (indirectionMark != null) {
        throw new Error(`Invalid Placeholder: ${whole}`)
      }
      if (id === '@') {
        return shellQuote.quote(args)
      }
      if (id === '*') {
        return shellQuote.quote([args.join(' ')])
      }
      const position = parseInt(id, 10)
      if (position >= 1 && position <= args.length) {
        return shellQuote.quote([args[position - 1]])
      }
      if (options != null) {
        const prefix = options.slice(0, 2)
        if (prefix === ':=') {
          defaults[id] = shellQuote.quote([options.slice(2)])
          return defaults[id]
        }
        if (prefix === ':-') {
          return shellQuote.quote([options.slice(2)])
        }
        throw new Error(`Invalid Placeholder: ${whole}`)
      }
      if (defaults[id] != null) {
        return defaults[id]
      }
      return ''
    })
  )
}

/**
 * Parses the given patterns and applies argument substitutions if needed
 * @param {string|string[]} patternOrPatterns
 * @param {string[]} args
 * @returns {string[]}
 */
function parsePatterns(patternOrPatterns, args) {
  const patterns = toArray(patternOrPatterns)
  const hasPlaceholder = patterns.some((pattern) => ARGS_PATTERN.test(pattern))
  return hasPlaceholder ? applyArguments(patterns, args) : patterns
}

/**
 * Converts a nested config object into an array of overwrite options (--pkg:var=value)
 * @param {object|null} config
 * @returns {string[]}
 */
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

/**
 * Converts a flat config object into an array of options (--key=value)
 * @param {object|null} config
 * @returns {string[]}
 */
function toConfigOptions(config) {
  return Object.keys(config).map((key) => `--${key}=${config[key]}`)
}

/**
 * Computes the maximum string length for formatting labels
 * @param {number} length
 * @param {string} name
 * @returns {number}
 */
function maxLength(length, name) {
  return Math.max(name.length, length)
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

/**
 * Runs npm-scripts matched by patterns, with retry and optional summary.
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
  // Ensure options is always an object
  options = options || {}

  // Extract flags and streams from options
  const silent = Boolean(options.silent)
  const aggregateOutput = Boolean(options.aggregateOutput)
  const printName = Boolean(options.printName)
  const printLabel = Boolean(options.printLabel)
  const stdin = options.stdin || null

  // Determine output streams, use null streams if completely silent
  let stdout = options.stdout || null
  let stderr = options.stderr || null
  if (silent && !aggregateOutput && !printName && !printLabel) {
    stdout = createNullStream()
    stderr = createNullStream()
  }

  // Other options
  const taskList = options.taskList || null
  const config = options.config || null
  const packageConfig = options.packageConfig || null
  const args = options.arguments || []
  const parallel = Boolean(options.parallel)
  const continueOnError = Boolean(options.continueOnError)
  const race = Boolean(options.race)
  const maxParallel = parallel ? options.maxParallel || 0 : 1
  const npmPath = options.npmPath
  const retry = Number(options.retry) || 0
  const summary = Boolean(options.summary)

  try {
    // Expand and validate patterns with arguments
    const patterns = parsePatterns(patternOrPatterns, args)
    if (patterns.length === 0) {
      return Promise.resolve(null)
    }
    // Validate taskList option
    if (taskList != null && !Array.isArray(taskList)) {
      throw new Error('Invalid options.taskList')
    }
    // Validate parallelization options
    if (typeof maxParallel !== 'number' || maxParallel < 0) {
      throw new Error('Invalid options.maxParallel')
    }
    if (typeof retry !== 'number' || retry < 0) {
      throw new Error('Invalid options.retry')
    }
    if (!parallel && aggregateOutput) {
      throw new Error('Invalid options.aggregateOutput; It requires parallel')
    }
    if (!parallel && race) {
      throw new Error('Invalid options.race; It requires parallel')
    }

    // Build prefix options for npm
    const prefixOptions = []
      .concat(silent ? ['--silent'] : [])
      .concat(packageConfig ? toOverwriteOptions(packageConfig) : [])
      .concat(config ? toConfigOptions(config) : [])

    // Read package.json if no taskList provided, then match and run tasks
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
          parallel,
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
