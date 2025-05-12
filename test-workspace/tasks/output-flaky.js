/**
 * Flaky task: fails '2' times, then
 * always succeeds thereafter.
 *
 * Usage: node output-flaky.js <text> <timeout>
 */
const { result, appendResult } = require('./lib/util')
const resulted = result()

// SIGINT/SIGTERM Handling.
process.on('SIGINT', () => {
  process.exit(0)
})
process.on('SIGTERM', () => {
  process.exit(0)
})

// Read the threshold argument from the command line
if (process.argv.length < 3) {
  console.error('Missing Argument. Usage: node output-flaky.js <text> <timeout>')
  process.exit(1)
}
const text = process.argv[2]
const timeout = process.argv[3]
const char = text.charAt(0)
// Load and increment the run counter
let countChar = resulted ? (resulted.match(new RegExp(char, 'g')) || []).length : 0

process.stdout.write(`[${text}]`)
appendResult(char)

countChar += 1

const threshold = 2
if (countChar <= threshold) {
  setTimeout(() => {
    process.stdout.write(`__[${text}]\n`)
    process.exit(1)
  }, timeout)
} else {
  setTimeout(() => {
    process.stdout.write(`__[${text}]\n`)
    process.exit(0)
  }, timeout)
}
