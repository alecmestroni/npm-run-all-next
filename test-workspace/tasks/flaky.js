/**
 * Flaky task: fails 'threshold' times (from argv[2]), then
 * always succeeds thereafter.
 *
 * Usage: node flaky.js <threshold>
 */
const { result, appendResult } = require('./lib/util')
const char = 'f'
// Read the threshold argument from the command line
if (process.argv.length < 3) {
  console.error('Missing Argument. Usage: node flaky.js <threshold>')
  process.exit(1)
}
const threshold = parseInt(process.argv[2], 10)
if (isNaN(threshold) || threshold < 0) {
  process.exit(1)
}

// Load and increment the run counter
let countChar = result() ? (result().match(/f/g) || []).length : 0
if (countChar > 0) {
  console.log(`Res: ${result()}`)
  console.log(`Recovered count: ${countChar}`)
}
appendResult(char)

countChar += 1
console.log(`Current count: ${countChar}`)
console.log(`Threshold: ${threshold}`)

setTimeout(() => {
  if (countChar <= threshold) {
    console.log(`Exiting with failure (count: ${countChar})`)
    process.exit(1)
  } else {
    process.exit(0)
  }
}, 1000)

// SIGINT/SIGTERM Handling.
process.on('SIGINT', () => {
  process.exit(0)
})
process.on('SIGTERM', () => {
  process.exit(0)
})
