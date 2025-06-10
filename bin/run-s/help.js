/**
 * @author Toru Nagashima (2015)
 * @author Alec Mestroni (2025)
 * @copyright 2016 Toru Nagashima.
 * @copyright 2025 Alec Mestroni.
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
  // Read the documentation file
  const doc = fs.readFileSync(path.join(__dirname, '../../docs/run-s.md'), 'utf8')

  // Extract the Options section up to Examples:
  const optionsBlock = doc.match(/Options:[\s\S]*?(?=\nExamples:|\n```)/m)
  if (!optionsBlock) {
    throw new Error('Unable to find the Options section in run-s.md')
  }

  // Build the complete help text
  const helpText = `
Usage:
    $ run-s [--help | -h | --version | -v]
    $ run-s [OPTIONS] <tasks>

    Run given npm-scripts sequentially.

    <tasks> : A list of npm-scripts' names and Glob-like patterns.

${optionsBlock[0]}

Examples:
    $ run-s 'build:*'*
    $ run-s lint clean 'build:*'*
    $ run-s --silent --print-name lint clean 'build:*'*
    $ run-s -sn lint clean 'build:*'*

See Also:
    https://github.com/alecmestroni/npm-run-all-next#readme
`

  output.write(helpText)
  return Promise.resolve(null)
}
