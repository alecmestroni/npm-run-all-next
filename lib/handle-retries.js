/**
 * @module handle-retries
 * @author Toru Nagashima (2015)
 * @author Alec Mestroni (2025)
 * @copyright 2025 Alec Mestroni
 * See LICENSE file in root directory for full license.
 */
'use strict'

const runTask = require('./run-task')
const NpmRunAllError = require('./npm-run-all-error')
const convertSignal = require('./signals')

/**
 * Runs a single task with retry and abort support.
 *
 * @param {string} name
 * @param {number} index
 * @param {object} opts  // includes options, packageInfo, etc.
 * @param {number} maxRetries
 * @param {Function} onUpdate  // optional callback to update results
 * @param {Function} getAborted  // optional callback to get aborted state from main process
 * @returns {Promise<{name:string,code:number,retries:number,durationMs:number}>}
 */
module.exports = function runAttempt(name, index, opts, maxRetries, onUpdate, getAborted) {
  let childAbort = null
  const promise = new Promise(async (resolve, reject) => {
    const start = Date.now()
    let lastResult = { name, code: undefined, signal: null }
    let lastAttempt = 0

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      lastAttempt = attempt
      // console.log(chalk.gray(`Attempt ${attempt} for "${name}"`))
      const rt = runTask(name, opts)
      if (typeof rt.abort === 'function') childAbort = rt.abort
      if (getAborted()) {
        // console.log(chalk.gray(`Before run Aborting... "${name}" on attempt ${attempt}`))
        lastAttempt--
        childAbort()
        break
      }
      try {
        lastResult = await rt
      } catch (err) {
        lastResult = {
          name,
          code: typeof err.code === 'number' ? err.code : 1,
          signal: typeof err.signal === 'string' ? err.signal : null,
        }
      }

      onUpdate({ index, code: undefined, retries: attempt, durationMs: Date.now() - start })

      if (getAborted()) {
        // console.log(chalk.gray(`After run Aborting... "${name}" on attempt ${attempt}`))
        childAbort()
        break
      }

      if (lastResult.code === 0) {
        return resolve({ name, code: 0, retries: attempt, durationMs: Date.now() - start })
      }
    }

    const durationMs = Date.now() - start

    if (opts.continueOnError) {
      return resolve({ name, code: lastResult.code, retries: lastAttempt, durationMs })
    }

    const { code, signal } = lastResult
    const finalCode = code ?? (signal ? 128 + convertSignal(signal) : undefined)

    // console.log(chalk.red(`"${name}" exited with code ${finalCode}`))
    onUpdate({ index, code: finalCode, retries: lastAttempt, durationMs })
    return reject(new NpmRunAllError({ name, code: finalCode }))
  })

  promise.abort = () => {
    if (childAbort) childAbort()
  }
  return promise
}
