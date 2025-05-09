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
let count = 0
const countChar = result() ? (result().match(new RegExp(char, 'g')) || []).length : 0
console.log(`Res: ${result()}`)
console.log(`Count char: ${countChar}`)
if (countChar > 0) {
  count = result().length
  console.log(`Recovered count: ${count}`)
}
count += 1
console.log(`Current count: ${count}`)
console.log(`Threshold: ${threshold}`)

setTimeout(() => {
  appendResult(char)
  if (count < threshold) {
    console.log(`Exiting with failure (count: ${count})`)
    process.exit(1)
  } else {
    process.exit(0)
  }
}, 3000)

// SIGINT/SIGTERM Handling.
process.on('SIGINT', () => {
  process.exit(0)
})
process.on('SIGTERM', () => {
  process.exit(0)
})
