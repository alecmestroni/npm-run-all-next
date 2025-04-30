/**
 * @author Toru Nagashima
 * @copyright 2016 Toru Nagashima. All rights reserved.
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

      // Supporto --retry <count>
      const retryIndex = argv.findIndex((arg) => arg === "-r" || arg === "--retry")
      let retryCount = 0
      if (retryIndex !== -1) {
        retryCount = parseInt(argv[retryIndex + 1], 10) || 0
        argv.splice(retryIndex, 2)
      }

      // Supporto --summary
      const summaryIndex = argv.findIndex((arg) => arg === "--summary")
      let summaryFlag = false
      if (summaryIndex !== -1) {
        summaryFlag = true
        argv.splice(summaryIndex, 1)
      }

      const options = { retry: retryCount, summary: summaryFlag }
      return require(`../${name}/main`)(argv, process.stdout, process.stderr, options).then(
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

 
