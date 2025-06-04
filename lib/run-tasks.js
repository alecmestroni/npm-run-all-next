/**
 * @module run-tasks-in-parallel
 * @author Toru Nagashima (2015)
 * @author Alec Mestroni (2025)
 * @copyright 2015 Toru Nagashima
 * @copyright 2025 Alec Mestroni
 * See LICENSE file in root directory for full license.
 */
'use strict'

const os = require('os')
const MemoryStream = require('memorystream')
const chalk = require('chalk')
const NpmRunAllError = require('./npm-run-all-error')
const runTask = require('./run-task')
const readPackageJson = require('./read-package-json')
const printSummaryTable = require('./print-summary')

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
 * Maps signal names to their numeric codes.
 */
const signals = {
  SIGABRT: 6,
  SIGALRM: 14,
  SIGBUS: 10,
  SIGCHLD: 20,
  SIGCONT: 19,
  SIGFPE: 8,
  SIGHUP: 1,
  SIGILL: 4,
  SIGINT: 2,
  SIGKILL: 9,
  SIGPIPE: 13,
  SIGQUIT: 3,
  SIGSEGV: 11,
  SIGSTOP: 17,
  SIGTRAP: 5,
  SIGTSTP: 18,
  SIGTTIN: 21,
  SIGTTOU: 22,
  SIGUSR1: 30,
  SIGUSR2: 31
}

/**
 * Converts a signal name into its numeric exit code.
 * @param {string} signal
 * @returns {number}
 */
function convert(signal) {
  return signals[signal] || 0
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

      function attemptRun(name, index, opts) {
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
            if (aborted) {
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
                signal: typeof err.signal === 'string' ? err.signal : null
              }
            }
            results[index].retries = attempt
            results[index].durationMs = Date.now() - start
            if (aborted) {
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
          const finalCode = code ?? (signal ? 128 + convert(signal) : undefined)
          // console.log(chalk.red(`"${name}" exited with code ${finalCode}`))
          results = results.map((r) => (r.name === name ? { ...r, code: finalCode, retries: lastAttempt, durationMs } : r))
          return reject(new NpmRunAllError({ name, code: finalCode }, results))
        })

        promise.abort = () => {
          if (childAbort) childAbort()
        }
        return promise
      }

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

        const p = attemptRun(name, index, opts)
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
            durationMs: result.durationMs
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
