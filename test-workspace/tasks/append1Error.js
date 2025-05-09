/**
 * Blocked test, append and than fails.
 */
const { appendResult } = require('./lib/util')
appendResult(process.argv[2])
process.exit(1)
