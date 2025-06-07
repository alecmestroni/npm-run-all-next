/**
 * @module run-tasks
 * @author Toru Nagashima (2015)
 * @author Alec Mestroni (2025)
 * @copyright 2015 Toru Nagashima
 * @copyright 2025 Alec Mestroni
 * See LICENSE file in root directory for full license.
 */
'use strict'

const MemoryStream = require('memorystream')
const NpmRunAllError = require('./npm-run-all-error')
const readPackageJson = require('./read-package-json')
const printSummaryTable = require('./print-summary')
const runAttempt = require('./handle-retries')

/**
 * Removes the value x from the array.
 * @template T
 * @param {T[]} array
 * @param {T} x
 */
function remove(array, x) {
  const idx = array.indexOf(x)
  if (idx !== -1) array.splice(idx, 1)
}

/**
 * Runs tasks in parallel with support for retry, printName, and if options.summary is true,
 * prints a tabular summary. In race mode, stops at the first completion (success or failure).
 * With killOthersOnFail, terminates all tasks on the first failure.
 *
 * @param {string[]} tasks
 * @param {object} options include:
 *   retry (number)
 *   continueOnError (boolean)
 *   summary (boolean)
 *   printName (boolean)
 *   maxParallel (number) or alias parallel (number)
 *   race (boolean)
 *   killOthersOnFail (boolean)
 *   aggregateOutput (boolean)
 *   stdout, stderr (stream)
 * @returns {Promise<object[]>}
 */
module.exports = function runTasks(tasks, options) {
  const showSummary = Boolean(options.summary)
  const max = typeof options.parallel === 'number' && options.parallel > 0 ? options.parallel : options.maxParallel
  const killOthersOnFail = Boolean(options.killOthersOnFail)

  return readPackageJson().then(({ packageInfo }) => {
    return new Promise((resolve, reject) => {
      if (!Array.isArray(tasks) || tasks.length === 0) {
        if (showSummary && options.stdout) options.stdout.write(printSummaryTable([]))
        return resolve([])
      }
      const startTime = Date.now()
      let results = tasks.map((name) => ({ name, code: undefined, retries: 0, durationMs: 0 }))
      const queue = tasks.map((name, idx) => ({ name, index: idx }))
      const promises = []
      let error = null
      let aborted = false
      const maxRetries = Number(options.retry) || 0

      function abort() {
        aborted = true
        if (promises.length === 0) {
          done()
        } else {
          for (const p of promises) {
            if (typeof p.abort === 'function') p.abort()
          }
          Promise.allSettled(promises).then(() => done())
        }
      }

      function done() {
        if (showSummary && options.stdout) options.stdout.write(printSummaryTable(results, Date.now() - startTime))
        if (error != null) {
          if (error.results) error.results = results
          return reject(error)
        }
        resolve(results)
      }

      function next() {
        if (queue.length === 0) {
          if (promises.length === 0) done()
          return
        }

        const { name, index } = queue.shift()
        const opts = { ...options, packageInfo }
        let writer = null
        if (opts.aggregateOutput && opts.stdout) {
          writer = new MemoryStream(null, { readable: false })
          opts.stdout = writer
          opts.stderr = writer
        }

        const p = runAttempt(
          name,
          index,
          opts,
          maxRetries,
          (update) => {
            results[update.index].code = update.code
            results[update.index].retries = update.retries
            results[update.index].durationMs = update.durationMs
          },
          () => aborted
        )

        const origAbort = p.abort
        p.abort = () => {
          if (writer) writer.destroy()
          origAbort()
        }

        promises.push(p)

        p.then((result) => {
          remove(promises, p)
          if (writer && options.stdout) options.stdout.write(writer.toString())
          results[index] = {
            name,
            code: result.code,
            retries: result.retries,
            durationMs: result.durationMs,
          }

          // Race mode: abort on first success
          if (options.race && !result.code) {
            abort()
            return
          }
          // killOthersOnFail option: abort on first failure
          if (killOthersOnFail && result.code === 0) {
            abort()
            return
          }

          // Default error behavior
          if (result.code !== 0) {
            if (error !== null) {
              let errorMsg
              if (!showSummary) {
                const failures = results.filter((r) => r.code && r.code !== 0 && r.code !== 130)
                errorMsg = generateErrorMessage(failures)
              } else {
                errorMsg = new Error('Multiple tasks failed, see summary for details')
              }
              error = new NpmRunAllError({ name: errorMsg, code: result.code }, results)
            } else {
              error = new NpmRunAllError({ name: result.name, code: result.code }, results)
            }
            if (!opts.continueOnError) {
              return abort()
            }
          }
          next()
        }).catch((err) => {
          remove(promises, p)
          if (aborted) {
            return
          }
          error = err
          error.results = results
          if (!options.continueOnError || options.race || killOthersOnFail) {
            abort()
            return
          }
          next()
        })
      }

      const initial = typeof max === 'number' && max > 0 ? Math.min(tasks.length, max) : tasks.length
      for (let i = 0; i < initial; i++) next()
    })
  })
}

const generateErrorMessage = (failures) => {
  if (failures.length) {
    // Group by exit code
    const byCode = failures.reduce((acc, { name, code }) => {
      ;(acc[code] ||= []).push(name)
      return acc
    }, {})

    // Build the new error message
    let errorMsg = `🚨 ${failures.length} scripts failed:\n\n`
    for (const [code, names] of Object.entries(byCode)) {
      errorMsg += `${names.length} exited with code ${code}:\n`
      errorMsg += `-----\n`
      for (const name of names) {
        errorMsg += `  • ${name}\n`
      }
      errorMsg += `\n`
    }
    return errorMsg
  }
}
