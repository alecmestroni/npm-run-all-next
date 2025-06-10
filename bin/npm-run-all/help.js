/**
 * @author Toru Nagashima (2015)
 * @author Alec Mestroni (2025)
 * @copyright 2015 Toru Nagashima
 * @copyright 2025 Alec Mestroni
 * See LICENSE file in root directory for full license.
 */
'use strict'

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
  const doc = fs.readFileSync(path.join(__dirname, '../../docs/npm-run-all.md'), 'utf8')

  // Extract the Options section up to Examples:
  const optionsBlock = doc.match(/Options:[\s\S]*?(?=\nExamples:|\n```)/m)
  if (!optionsBlock) {
    throw new Error('Impossibile trovare la sezione Options in npm-run-all.md')
  }

  // Build the complete help text
  const helpText = `
Usage:
    $ npm-run-all [--help | -h | --version | -v]
    $ npm-run-all [tasks] [OPTIONS]

    Run given npm-scripts in parallel or sequential.

    <tasks> : A list of npm-scripts' names and Glob-like patterns.

${optionsBlock[0]}

Examples:
    $ npm-run-all --serial clean lint 'build:*'*
    $ npm-run-all --parallel 'watch:*'*
    $ npm-run-all clean lint --parallel "'build:*'* -- --watch"
    $ npm-run-all -l -p start-server start-browser start-electron

See Also:
    https://github.com/alecmestroni/npm-run-all-next#readme
`

  output.write(helpText)
  return Promise.resolve(null)
}
