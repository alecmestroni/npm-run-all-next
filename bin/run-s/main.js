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
const { ENV_PARENT, ENV_RETRIES } = require("../../lib/summary-report")

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
    const inheritedRetries = parseInt(process.env[ENV_RETRIES], 10) || 0

    if (!group || !group.patterns || group.patterns.length === 0) {
      return Promise.resolve(null)
    }

    const promise = runAll(group.patterns, {
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
      retries: argv.propagateRetries ? (argv.retries || inheritedRetries || 0) : argv.retries,
      printSummaryTable: argv.printSummaryTable,
      aggregateTable: argv.aggregateTable,
      balancer: argv.balancer,
      runtimeFile: argv.runtimeFile,
    })

    if (!argv.silent) {
      promise.catch((err) => {
        // Suppress if running as a tracked child of npm-run-all-next: the parent's
        // summary table already captures the error via FinalExitCode. Printing here
        // would cause stderr/stdout interleaving inside the parent's table.
        if (!err.reported && !process.env[ENV_PARENT]) {
          console.error("\nERROR:", err.message)
        }
      })
    }

    return promise
  } catch (err) {
    console.error("\nERROR:", err.message)

    return Promise.reject(err)
  }
}
