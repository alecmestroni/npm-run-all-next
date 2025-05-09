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
 * Rimuove il valore x dall'array.
 * @template T
 * @param {T[]} array
 * @param {T} x
 */
function remove(array, x) {
  const idx = array.indexOf(x)
  if (idx !== -1) array.splice(idx, 1)
}

/**
 * Mappa i nomi dei segnali ai loro numeri.
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
 * Converte un nome di segnale nel suo exit code numerico.
 * @param {string} signal
 * @returns {number}
 */
function convert(signal) {
  return signals[signal] || 0
}

/**
 * Esegue in parallelo i task con supporto retry, printName e, se options.summary è true,
 * stampa un riepilogo tabellare. In modalità race interrompe al primo completamento
 * (successo o fallimento).
 *
 * @param {string[]} tasks
 * @param {object} options include:
 *   retry (number)
 *   continueOnError (boolean)
 *   summary (boolean)
 *   printName (boolean)
 *   maxParallel (number) or alias parallel (number)
 *   race (boolean)
 *   aggregateOutput (boolean)
 *   stdout, stderr (stream)
 * @returns {Promise<object[]>}
 */
module.exports = function runTasks(tasks, options) {
  const showSummary = Boolean(options.summary)
  const max = typeof options.parallel === 'number' && options.parallel > 0 ? options.parallel : options.maxParallel

  return readPackageJson().then(({ packageInfo }) => {
    return new Promise((resolve, reject) => {
      if (!Array.isArray(tasks) || tasks.length === 0) {
        if (showSummary) printSummaryTable([])
        return resolve([])
      }

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

          for (let attempt = 0; attempt <= maxRetries; attempt++) {
            console.log(chalk.gray(`Attempt ${attempt + 1} for "${name}"`))
            const rt = runTask(name, opts)
            if (typeof rt.abort === 'function') childAbort = rt.abort
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
            let exitCode = lastResult.code
            if (exitCode == null && lastResult.signal) {
              exitCode = 128 + convert(lastResult.signal)
            }
            if (exitCode === 0) {
              // "attempt" indica quanti retry sono stati necessari.
              return resolve({ name, code: 0, retries: attempt, durationMs: Date.now() - start })
            }
          }

          const durationMs = Date.now() - start
          if (opts.continueOnError) {
            return resolve({ name, code: lastResult.code, retries: maxRetries, durationMs })
          }

          const { code, signal } = lastResult
          const finalCode = code ?? (signal ? 128 + convert(signal) : undefined)
          results = results.map((r) => (r.name === name ? { ...r, code: finalCode, retries: maxRetries, durationMs } : r))
          return reject(new NpmRunAllError({ name, code: finalCode }, results))
        })

        promise.abort = () => {
          if (childAbort) childAbort()
        }
        return promise
      }

      function abort() {
        if (aborted) {
          return
        }
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
        if (showSummary) printSummaryTable(results)
        //update the error.results with the final state
        console.log('Results:', results)
        if (error?.results) error.results = results
        if (error != null) {
          return reject(error)
        }
        resolve(results)
      }

      function next() {
        if (aborted) {
          return
        }
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
          if (aborted) {
            return
          }
          if (writer && options.stdout) options.stdout.write(writer.toString())
          results[index] = {
            name,
            code: result.code,
            retries: result.retries,
            durationMs: result.durationMs
          }
          if (options.race && !result.code) {
            abort()
            return
          }
          if (result.code !== 0) {
            if (!opts.continueOnError) {
              error = new NpmRunAllError({ name: result.name, code: result.code }, results)
              return abort()
            }
          }
          next()
        }).catch((err) => {
          remove(promises, p)
          if (aborted) {
            return
          }
          if (!options.continueOnError || options.race) {
            error = err
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
