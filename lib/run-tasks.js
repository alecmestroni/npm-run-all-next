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
const printSummaryTable = require('./print-summary')
const runAttempt = require('./handle-retries')
const { queueBalancer, updateHistoryFromResults, queueReorganizer } = require('./queue-balancer')

/**
 * Formats a date in the local timezone.
 * @param {Date} date
 * @returns {string}
 */
function formatLocalTime(date) {
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

/**
 * Prints a table of active threads.
 * @param {Map<number, {name: string, weight: number, startTime: Date}>} runningTasks
 * @param {number} totalThreads
 * @param {string} event - 'START' or 'END'
 * @param {string} [taskName] - Name of the task that triggered the event
 */
function printThreadTable(runningTasks, totalThreads, event, taskName) {
  console.log('\n' + '='.repeat(100))
  console.log(`📊 THREAD STATUS [${event}${taskName ? ` - Task: ${taskName}` : ''}] - ${formatLocalTime(new Date())}`)
  console.log('='.repeat(100))

  const runningArray = Array.from(runningTasks.entries())

  if (runningArray.length === 0) {
    console.log('│ No active threads at the moment │')
  } else {
    console.log('┌─────────────┬──────────────────────────────────────────┬─────────┬─────────────────────┐')
    console.log('│   Thread    │                 Task Name                │  Weight │  Start Time (Local) │')
    console.log('├─────────────┼──────────────────────────────────────────┼─────────┼─────────────────────┤')

    runningArray.forEach(([threadId, task]) => {
      const taskName = task.name.padEnd(40).substring(0, 40)
      const weight = String(task.weight).padStart(5)
      const startTime = formatLocalTime(task.startTime).padEnd(19)
      console.log(`│ TaskId ${String(threadId).padStart(2)}   │ ${taskName} │ ${weight}   │ ${startTime} │`)
    })

    console.log('└─────────────┴──────────────────────────────────────────┴─────────┴─────────────────────┘')
  }

  const usedThreads = runningArray.reduce((sum, [_, task]) => sum + task.weight, 0)
  const freeThreads = totalThreads - usedThreads

  console.log(`\n📈 Threads in use: ${usedThreads}/${totalThreads} | Free threads: ${freeThreads}`)
  console.log('='.repeat(100) + '\n')
}

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
  const ordered = options.balancer ? queueReorganizer(rawTasks, options.runtimeFile) : rawTasks

  let queue = ordered.map((t) => ({
    name: t.name,
    index: tasks.findIndex((x) => x.name === t.name),
    weight: t.weight,
    estimatedRuntime: t.estimatedRuntime,
  }))

  const tasksWeight = queue.reduce((sum, t) => sum + (t.weight || 0), 0)

  const jobs = (() => {
    // 1) If the user explicitly set `options.parallel` to a positive number, honor that.
    if (typeof options.parallel === "number" && options.parallel > 0) {
      return options.parallel
    }
    // 2) Otherwise, if they provided `options.jobs` as a positive number, use that.
    if (typeof options.jobs === "number" && options.jobs > 0) {
      return options.jobs
    }
    // 3) As a last resort, default to running one thread per task.
    return tasksWeight || tasks.length
  })()

  let freeThreads = jobs ?? 1

  // Track active threads for logging.
  const runningTasks = new Map() // threadId -> {name, weight, startTime}
  let nextThreadId = 1
  let isInitialScheduling = true // Avoid multiple prints at startup.

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
          if (typeof p.abort === "function") p.abort()
        }
        Promise.allSettled(promises).then(() => done())
      }
    }

    function done() {
      if ((options.balancer || options.runtimeFile) && !alreadyUpdatedRuntimesFile) {
        alreadyUpdatedRuntimesFile = true
        updateHistoryFromResults(results, options.runtimeFile)
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
            queue = []
            return abort()
          } else {
            // Non-fatal: no task fits into the current freeThreads.
            // Let running tasks complete and retry scheduling once a thread is freed.
          }
        }
      }
      const { name, weight, index } = queue.shift()

      freeThreads -= weight

      // Assign a thread ID and register the running task.
      const currentThreadId = nextThreadId++
      runningTasks.set(currentThreadId, {
        name: name,
        weight: weight,
        startTime: new Date(),
      })

      // Do not print during initial scheduling; a single table will be printed after.

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

        // Remove the completed task from the map.
        runningTasks.delete(currentThreadId)

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
              const failures = results.filter((r) => r.code && r.code !== 0 && r.code !== 137)
              errorMsg = generateErrorMessage(failures)
            } else {
              errorMsg = new Error("Multiple tasks failed, see summary for details")
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

        // Print the updated table after scheduling any new tasks.
        if (!isInitialScheduling) {
          printThreadTable(runningTasks, jobs, 'COMPLETED', name)
        }
      }).catch(err => {
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

    // Schedule all initial tasks.
    while (freeThreads > 0 && queue.length > 0) next()

    // Print a single table with the initial state after scheduling the first tasks.
    if (runningTasks.size > 0) {
      printThreadTable(runningTasks, jobs, 'INITIAL', 'Initial thread state')
    }
    isInitialScheduling = false
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
