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
    const argv = parseCLIArgs(args, { parallel: true }, { singleMode: true })
    const group = argv.lastGroup

    if (group.patterns.length === 0) {
      return Promise.resolve(null)
    }

    const promise = runAll(group.patterns, {
      stdout,
      stderr,
      stdin,
      parallel: group.parallel,
      maxParallel: argv.maxParallel,
      continueOnError: argv.continueOnError,
      printLabel: argv.printLabel,
      printName: argv.printName,
      config: argv.config,
      packageConfig: argv.packageConfig,
      silent: argv.silent,
      arguments: argv.rest,
      race: argv.race,
      npmPath: argv.npmPath,
      aggregateOutput: group.parallel && argv.aggregateOutput,
      retry: argv.retry
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
