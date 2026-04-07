/**
 * @author Toru Nagashima (2015)
 * @author Alec Mestroni (2025)
 * @copyright 2015 Toru Nagashima
 * @copyright 2025 Alec Mestroni
 * See LICENSE file in root directory for full license.
 */
'use strict'

const fs = require('fs')
const path = require('path')

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

/**
 * Print a help text.
 *
 * @param {stream.Writable} output - A writable stream to print.
 * @returns {Promise} Always a fulfilled promise.
 * @private
 */
module.exports = function printHelp(output) {
  const doc = fs.readFileSync(path.join(__dirname, '../../docs/npm-run-all.md'), 'utf8')
  const optionsBlock = doc.match(/Options:[\s\S]*?(?=\nExamples:|\n```)/m)
  if (!optionsBlock) {
    throw new Error('Impossibile trovare la sezione Options in npm-run-all.md')
  }

  const helpText = `
Usage:
    $ npm-run-all-next [--help | -h | --version | -v]
    $ npm-run-all-next [tasks] [OPTIONS]

    Run given npm-scripts in parallel or sequential.

    <tasks> : A list of npm-scripts' names and Glob-like patterns.

${optionsBlock[0]}

Examples:
    $ npm-run-all-next --serial clean lint 'build:*'*
    $ npm-run-all-next --parallel 'watch:*'*
    $ npm-run-all-next clean lint --parallel "'build:*'* -- --watch"
    $ npm-run-all-next -l -p start-server start-browser start-electron

See Also:
    https://github.com/alecmestroni/npm-run-all-next#readme
`

  output.write(helpText)
  return Promise.resolve(null)
}