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
const { queueBalancer, updateHistoryFromResults, queueReorganizer } = require('./queue-balancer')

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
 * @param {number} [options.retries=0]
 *   Number of retries attempts per task.
 * @param {boolean} [options.continueOnError=false]
 *   Whether to continue running remaining tasks after one fails.
 * @param {boolean} [options.printSummaryTable=false]
 *   Whether to print a summary table when all tasks complete.
 * @param {boolean} [options.printName=false]
 *   Whether to prefix each output line with the task name.
 * @param {number} [options.jobs]
 *   Maximum number of tasks to run in parallel.
 * @param {number} [options.parallel]
 *   Alias for `options.jobs`.
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
  const showSummary = Boolean(options.printSummaryTable)
  const killOthersOnFail = Boolean(options.killOthersOnFail)
  const maxRetries = Number(options.retries) || 0
  const startTime = Date.now()

  let results = tasks.map((task) => ({ name: task.name, code: undefined, retries: 0, durationMs: 0 }))

  const rawTasks = tasks.map((t) => ({ name: t.name, weight: t.weight }))
  const ordered = options.balancer ? queueReorganizer(rawTasks) : rawTasks

  let queue = ordered.map((t) => ({
    name: t.name,
    index: tasks.findIndex((x) => x.name === t.name),
    weight: t.weight,
    estimatedRuntime: t.estimatedRuntime,
  }))

  const tasksWeight = queue.reduce((sum, t) => sum + (t.weight || 0), 0)

  const jobs = (() => {
    // 1) If the user explicitly set `options.parallel` to a positive number, honor that.
    if (typeof options.parallel === 'number' && options.parallel > 0) {
      return options.parallel
    }
    // 2) Otherwise, if they provided `options.jobs` as a positive number, use that.
    if (typeof options.jobs === 'number' && options.jobs > 0) {
      return options.jobs
    }
    // 3) As a last resort, default to running one thread per task.
    return tasksWeight
  })()

  let freeThreads = jobs ?? 1

  return new Promise((resolve, reject) => {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      if (showSummary && options.stdout) {
        options.stdout.write(printSummaryTable([]))
      }
      return resolve([])
    }

    const promises = []
    let error = null
    let aborted = false
    let alreadyUpdatedRuntimesFile = false

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
      if (options.balancer && !alreadyUpdatedRuntimesFile) {
        alreadyUpdatedRuntimesFile = true
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

      if (options.balancer && freeThreads > 0) {
        try {
          queue = queueBalancer(queue, freeThreads)
        } catch (err) {
          // When using the balancer, if no task in the queue can fit the current freeThreads,
          // queueBalancer will throw. If this happens at initial scheduling (all threads still free),
          // we cannot proceed at all—abort with a clear Queue-Balancer error.
          if (jobs === freeThreads) {
            error = new NpmRunAllError({ name: `Queue-Balancer error: ${err.message}` }, results)
            return abort()
          } else {
            // Non-fatal: no task fits into the current freeThreads.
            // Let running tasks complete and retry scheduling once a thread is freed.
          }
        }
      }
      const { name, weight, index } = queue.shift()

      freeThreads -= weight
      // console.log(`Running task: ${name} (weight: ${weight}, free threads: ${freeThreads})`)
      while (freeThreads > 0 && queue.length > 0) next() // Schedule next immediately if threads are still available

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
        if (killOthersOnFail && result.code !== 0) {
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

        freeThreads += weight
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

        freeThreads += weight
        next()
      })
    }
    // console.log(`Starting tasks: ${queue.map((t) => t.name).join(', ')}, freeThreads: ${freeThreads}, queue.length: ${queue.length}`)
    while (freeThreads > 0 && queue.length > 0) next()
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
