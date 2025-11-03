/**
 * @author Toru Nagashima (2015)
 * @author Alec Mestroni (2025)
 * @copyright 2016 Toru Nagashima.
 * @copyright 2025 Alec Mestroni.
 * See LICENSE file in root directory for full license.
 */
"use strict"

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const runAll = require("../../lib")
const parseCLIArgs = require("../common/parse-cli-args")
const loadTasksFile = require("../common/load-tasks-file")

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

/**
 * Parses arguments, then run specified npm-scripts.
 *
 * @param {string[]} args - Arguments to parse.
 * @param {stream.Writable} stdout - A writable stream to print logs.
 * @param {stream.Writable} stderr - A writable stream to print errors.
 * @returns {Promise} A promise which comes to be fulfilled when all npm-scripts are completed.
 * @private
 */
module.exports = function npmRunAll(args, stdout, stderr) {
  try {
    const stdin = process.stdin
    const argv = parseCLIArgs(args, { parallel: false }, { singleMode: true })
    const group = argv.lastGroup

    // If --tasks-file is set, load tasks and override patterns
    let tasksFromFile = null
    if (argv.tasksFile) {
      tasksFromFile = loadTasksFile(argv.tasksFile)
    }
    const patterns = tasksFromFile ?? group?.patterns ?? []

    if (patterns.length === 0) {
      return Promise.resolve(null)
    }

    const promise = runAll(patterns, {
      stdout,
      stderr,
      stdin,
      parallel: group.parallel,
      continueOnError: argv.continueOnError,
      printLabel: argv.printLabel,
      printName: argv.printName,
      config: argv.config,
      packageConfig: argv.packageConfig,
      silent: argv.silent,
      arguments: argv.rest,
      npmPath: argv.npmPath,
      retries: argv.retries,
      printSummaryTable: argv.printSummaryTable,
      balancer: argv.balancer,
      runtimeFile: argv.runtimeFile,
    })

    if (!argv.silent) {
      promise.catch((err) => {
        console.error("\nERROR:", err.message)
      })
    }

    return promise
  } catch (err) {
    console.error("\nERROR:", err.message)

    return Promise.reject(err)
  }
}
