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

// Matches npm scripts against given patterns
const matchTasks = require('./match-tasks')
// Reads and parses package.json
const readPackageJson = require('./read-package-json')
// Executes the matched tasks
const runTasks = require('./run-tasks')
// Writable stream constructor for creating no-op streams
const { Writable } = require('stream') // added to create null streams
const parsePatterns = require('./parse-patterns')

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Creates a writable stream that discards all data (no-op)
 * @returns {Writable}
 */
function createNullStream() {
  return new Writable({
    write(chunk, encoding, callback) {
      callback()
    },
  })
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
 * @param {boolean} options.killOthersOnFail
 * @param {boolean} options.balancer
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
  const killOthersOnFail = Boolean(options.killOthersOnFail)
  const balancer = Boolean(options.balancer)

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
        return readPackageJson(patterns)
      })
      .then(([packageInfo, tasks]) => {
        const taskNames = tasks.map((t) => t.name)
        const labelWidth = taskNames.reduce(maxLength, 0)

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
            lastIsLinebreak: true,
          },
          printName,
          packageInfo: packageInfo,
          parallel,
          race,
          maxParallel,
          npmPath,
          aggregateOutput,
          retry,
          summary,
          killOthersOnFail,
          balancer,
        }

        return runTasks(tasks, runOpts)
      })
  } catch (err) {
    return Promise.reject(new Error(err.message))
  }
}
