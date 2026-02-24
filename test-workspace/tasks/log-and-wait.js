"use strict"

/**
 * Writes an initial log line, waits for a specified delay, then writes a final log line.
 * Usage: node log-and-wait.js <label> <delayMs>
 * Example: node log-and-wait.js slow 5000
 *   → immediately writes: [slow]__LIVE_START__
 *   → after 5s writes:    [slow]__LIVE_END__
 */

const label = process.argv[2] || "task"
const delay = parseInt(process.argv[3], 10) || 3000

process.stdout.write(`[${label}]__LIVE_START__\n`)

setTimeout(() => {
  process.stdout.write(`[${label}]__LIVE_END__\n`)
}, delay)
