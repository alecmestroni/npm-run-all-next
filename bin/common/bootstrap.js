/**
 * @author Toru Nagashima (2015)
 * @author Alec Mestroni (2025)
 * @copyright 2016 Toru Nagashima.
 * @copyright 2025 Alec Mestroni.
 * See LICENSE file in root directory for full license.
 */
'use strict'

/**
 * Exits the process safely, waiting for stdout/stderr to drain
 * before calling process.exit(). This prevents output truncation
 * when large amounts of data (>64KB) are written to stdout.
 *
 * @param {number} code - The exit code.
 */
function safeExit(code) {
  process.exitCode = code

  // If stdout has buffered data, wait for it to drain before exiting.
  // This prevents truncation of aggregate output and summary tables.
  const needsDrain = process.stdout.writableLength > 0
  if (needsDrain) {
    process.stdout.once('drain', () => process.exit(code))
    // Safety timeout: if drain never fires, exit anyway after 5 seconds.
    setTimeout(() => process.exit(code), 5000).unref()
  } else {
    // On some platforms the process may not exit automatically,
    // so we still call process.exit() explicitly.
    process.exit(code)
  }
}

module.exports = function bootstrap(name) {
  const argv = process.argv.slice(2)

  switch (argv[0]) {
    case undefined:
    case '-h':
    case '--help':
      return require(`../${name}/help`)(process.stdout)

    case '-v':
    case '--version':
      return require('./version')(process.stdout)

    default:
      // Avoid MaxListenersExceededWarnings.
      process.stdout.setMaxListeners(0)
      process.stderr.setMaxListeners(0)
      process.stdin.setMaxListeners(0)

      return require(`../${name}/main`)(argv, process.stdout, process.stderr).then(
        () => {
          safeExit(0)
        },
        () => {
          safeExit(1)
        }
      )
  }
}
