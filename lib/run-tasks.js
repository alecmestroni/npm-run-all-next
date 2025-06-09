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
const { queueBalancer, updateHistoryFromResults } = require('./queue-balancer')

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
 * Executes an array of npm script tasks with support for concurrency, retries,
 * output aggregation, and summary reporting.
 *
 * @param {Array<{name: string, weight: number}>} tasks
 *   List of tasks to run.
 * @param {object} options
 *   Execution options.
 * @param {number} [options.retry=0]
 *   Number of retry attempts per task.
 * @param {boolean} [options.continueOnError=false]
 *   Whether to continue running remaining tasks after one fails.
 * @param {boolean} [options.summary=false]
 *   Whether to print a summary table when all tasks complete.
 * @param {boolean} [options.printName=false]
 *   Whether to prefix each output line with the task name.
 * @param {number} [options.maxParallel]
 *   Maximum number of tasks to run in parallel.
 * @param {number} [options.parallel]
 *   Alias for `options.maxParallel`.
 * @param {boolean} [options.race=false]
 *   Stop all tasks on the first completion (success or failure).
 * @param {boolean} [options.killOthersOnFail=false]
 *   Kill all remaining tasks on the first failure.
 * @param {boolean} [options.aggregateOutput=false]
 *   Collect each task’s stdout/stderr and print it only after the task ends.
 * @param {NodeJS.WritableStream} [options.stdout=process.stdout]
 *   Stream to write task stdout to.
 * @param {NodeJS.WritableStream} [options.stderr=process.stderr]
 *   Stream to write task stderr to.
 * @returns {Promise<Array<{
 *   name: string,
 *   code: number,
 *   retries: number,
 *   durationMs: number
 * }>>}
 *   Resolves with an array of result objects for each task.
 */
module.exports = function runTasks(tasks, options) {
  const showSummary = Boolean(options.summary)
  const max = typeof options.parallel === 'number' && options.parallel > 0 ? options.parallel : options.maxParallel
  const killOthersOnFail = Boolean(options.killOthersOnFail)
  const startTime = Date.now()

  return new Promise((resolve, reject) => {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      if (showSummary && options.stdout) options.stdout.write(printSummaryTable([]))
      return resolve([])
    }
    let results = tasks.map((task) => ({ name: task.name, code: undefined, retries: 0, durationMs: 0 }))

    const rawTasks = tasks.map((t) => ({ name: t.name, weight: t.weight }))
    const ordered = options.balancer
      ? queueBalancer(rawTasks, {
          parallel: options.parallel,
          historyFilePath: '.npm-run-all-next-runtimes.json',
        })
      : rawTasks
    const queue = ordered.map((t, idx) => ({
      name: t.name,
      index: tasks.findIndex((x) => x.name === t.name),
      weight: t.weight,
      estimatedRuntime: t.estimatedRuntime,
    }))

    const promises = []
    let error = null
    let aborted = false
    let updateRuntimesFile = false

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
      if (!updateRuntimesFile) {
        updateRuntimesFile = true
        updateHistoryFromResults(results)
      }

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
      const opts = { ...options }
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

function updateRuntimesFile(old, measurements) {
  // old: { script: { count, avgRuntime } }
  // measurements: { script: [dur1, dur2, …] } – array di misure nell’ultima run
  const out = { ...old }
  for (const [script, runs] of Object.entries(measurements)) {
    const m = runs.length
    const totNew = runs.reduce((a, b) => a + b, 0)
    if (!out[script]) out[script] = { count: 0, avgRuntime: 0 }

    const { count: c0, avgRuntime: a0 } = out[script]
    // Incremental average:
    // a1 = (a0 * c0 + totNew) / (c0 + m)
    const c1 = c0 + m
    const a1 = (a0 * c0 + totNew) / c1

    out[script] = { count: c1, avgRuntime: a1 }
  }

  fs.writeFileSync(path.resolve(process.cwd(), '.npm-run-all-next-runtimes.json'), JSON.stringify(out, null, 2))
}
