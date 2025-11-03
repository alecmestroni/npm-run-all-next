/**
 * @module index
 * @author Toru Nagashima (2015)
 * @author Alec Mestroni (2025)
 * @copyright 2015 Toru Nagashima
 * @copyright 2025 Alec Mestroni
 * See LICENSE file in root directory for full license.
 */
"use strict"

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

// Matches npm scripts against given patterns
const matchTasks = require("./match-tasks")
// Reads and parses package.json
const readPackageJson = require("./read-package-json")
// Executes the matched tasks
const runTasks = require("./run-tasks")
// Writable stream constructor for creating no-op streams
const { Writable } = require("stream") // added to create null streams
const parsePatterns = require("./parse-patterns")

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
      /* Istanbul ignore next */
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

/**
 * Normalizes the input into an array of strings.
 * Accepts a string, an array of strings, or null/undefined.
 * @param {string|string[]|null|undefined} input - Single pattern, array of patterns, or null/undefined.
 * @returns {string[]} Normalized array of strings.
 * @throws {Error} If input is not a string or array of strings.
 */
function toArray(input) {
  if (input == null) return []
  if (Array.isArray(input)) return input.filter((x) => typeof x === "string")
  if (typeof input === "string") return [input]
  throw new Error("Invalid patternOrPatterns: must be string or array of strings")
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

/**
 * Runs npm-scripts matched by patterns, with retries and optional summary.
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
 * @param {number} options.jobs
 * @param {boolean} options.aggregateOutput
 * @param {string} options.npmPath
 * @param {number} options.retries
 * @param {boolean} options.printSummaryTable
 * @param {boolean} options.killOthersOnFail
 * @param {boolean} options.balancer
 * @param {string|null} options.runtimeFile
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
  const jobs = parallel ? options.jobs || 0 : 1
  const npmPath = options.npmPath
  const retries = Number(options.retries) || 0
  const printSummaryTable = Boolean(options.printSummaryTable)
  const killOthersOnFail = Boolean(options.killOthersOnFail)
  const balancer = Boolean(options.balancer)
  const runtimeFile = options.runtimeFile || null

  try {
    // Validate taskList option
    if (taskList != null && !Array.isArray(taskList)) {
      throw new Error("Invalid options.taskList should be an array")
    }

    // Prepare patterns
    if (!Array.isArray(parsePatterns)) patternOrPatterns = toArray(patternOrPatterns)

    // Expand and validate patterns with arguments
    const toParse = parsePatterns.length > 0 ? patternOrPatterns : taskList
    const patterns = parsePatterns(toParse, args)

    if (patterns.length === 0) {
      return Promise.resolve(null)
    }
    // Validate parallelization options
    if (typeof jobs !== "number" || jobs < 0) {
      throw new Error("Invalid options.jobs")
    }
    if (typeof retries !== "number" || retries < 0) {
      throw new Error("Invalid options.retries")
    }
    if (!parallel && aggregateOutput) {
      throw new Error("Invalid options.aggregateOutput; It requires parallel")
    }
    if (!parallel && race) {
      throw new Error("Invalid options.race; It requires parallel")
    }

    // Build prefix options for npm
    const prefixOptions = []
      .concat(silent ? ["--silent"] : [])
      .concat(packageConfig ? toOverwriteOptions(packageConfig) : [])
      .concat(config ? toConfigOptions(config) : [])

    function buildRunOpts(tasks, packageInfo) {
      const labelWidth = tasks.map((t) => t.name).reduce(maxLength, 0)
      return {
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
        packageInfo,
        parallel,
        race,
        jobs,
        npmPath,
        aggregateOutput,
        retries,
        printSummaryTable,
        killOthersOnFail,
        balancer,
        runtimeFile,
      }
    }

    if (taskList != null) {
      if (taskList.length === 0) {
        return Promise.resolve(null)
      }
      const tasks = taskList.map((name) => ({ name }))
      return runTasks(tasks, buildRunOpts(tasks, null))
    }

    return Promise.resolve()
      .then(() => readPackageJson(patterns))
      .then(([packageInfo, tasks]) => runTasks(tasks, buildRunOpts(tasks, packageInfo)))
  } catch (err) {
    return Promise.reject(new Error(err.message))
  }
}
