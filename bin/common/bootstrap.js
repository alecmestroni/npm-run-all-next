/**
 * @author Toru Nagashima (2015)
 * @author Alec Mestroni (2025)
 * @copyright 2016 Toru Nagashima.
 * @copyright 2025 Alec Mestroni.
 * See LICENSE file in root directory for full license.
 */
"use strict"

module.exports = function bootstrap(name) {
  const argv = process.argv.slice(2)

  switch (argv[0]) {
    case undefined:
    case "-h":
    case "--help":
      return require(`../${name}/help`)(process.stdout)

    case "-v":
    case "--version":
      return require("./version")(process.stdout)

    default:
      // Avoid MaxListenersExceededWarnings.
      process.stdout.setMaxListeners(0)
      process.stderr.setMaxListeners(0)
      process.stdin.setMaxListeners(0)

      return require(`../${name}/main`)(argv, process.stdout, process.stderr).then(
        () => {
          // On some platforms the process may not exit automatically.
          process.exit(0)
        },
        () => {
          process.exit(1)
        }
      )
  }
}
