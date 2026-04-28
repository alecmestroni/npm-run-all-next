/**
 * @module run-tasks
 * @author Toru Nagashima (2015)
 * @author Alec Mestroni (2025)
 * @copyright 2015 Toru Nagashima
 * @copyright 2025 Alec Mestroni
 * See LICENSE file in root directory for full license.
 */
'use strict'

const { Writable } = require('stream')
const NpmRunAllError = require('./npm-run-all-error')
const printSummaryTable = require('./print-summary')
const runAttempt = require('./handle-retries')
const { queueBalancer, updateHistoryFromResults, queueReorganizer } = require('./queue-balancer')
const { appendRows, readRows, safeUnlink } = require('./summary-report')

/**
 * A writable stream that accumulates data in memory.
 * Uses native Node.js streams instead of external dependencies.
 */
class BufferWriter extends Writable {
  constructor() {
    super()
    this.chunks = []
    this._liveTarget = null
  }

  _write(chunk, encoding, callback) {
    if (this._liveTarget) {
      this._liveTarget.write(chunk, encoding)
      callback()
    } else {
      this.chunks.push(chunk)
      callback()
    }
  }

  toString() {
    return Buffer.concat(this.chunks).toString('utf8')
  }

  /**
   * Switch from buffering mode to live streaming mode.
   * Flushes accumulated content to the target and forwards all future writes.
   * @param {stream.Writable} target - The target stream to forward writes to.
   */
  switchToLiveStream(target) {
    if (this._liveTarget) return
    const accumulated = Buffer.concat(this.chunks).toString('utf8')
    if (accumulated) target.write(accumulated)
    this.chunks = []
    this._liveTarget = target
  }
}

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
function printThreadTable(runningTasks, totalThreads, event, taskName, writer = process.stdout) {
  const runningArray = Array.from(runningTasks.entries())
  const timeLabel = 'Start Time (Local)'
  const taskNumLabel = 'Task Num'
  const taskNameLabel = 'Task Name'
  const weightLabel = 'Weight'

  const title = `📊 THREAD STATUS [${event}${taskName ? ` - Task: ${taskName}` : ''}] - ${formatLocalTime(new Date())}`

  if (runningArray.length === 0) {
    const line = '='.repeat(Math.max(60, title.length))
    writer.write(`\n${line}\n`)
    writer.write(title + '\n')
    writer.write(line + '\n')
    writer.write('│ No active threads at the moment │\n')
    writer.write(line + '\n\n')
    return
  }

  // Dynamically determine column widths based on headers and data.
  const minTaskNumCol = 8
  const maxTaskNumCol = 12
  const minTaskNameCol = 12
  const maxTaskNameCol = 40

  const formattedRows = runningArray.map(([threadId, task]) => {
    return {
      taskNum: String(threadId),
      taskName: task.name,
      weight: String(task.weight),
      startTime: formatLocalTime(task.startTime),
      weightValue: task.weight,
    }
  })

  const taskNumColWidth = Math.max(
    minTaskNumCol,
    Math.min(
      maxTaskNumCol,
      Math.max(taskNumLabel.length, ...formattedRows.map((row) => row.taskNum.length))
    )
  )
  const taskNameColWidth = Math.max(
    minTaskNameCol,
    Math.min(
      maxTaskNameCol,
      Math.max(taskNameLabel.length, ...formattedRows.map((row) => row.taskName.length))
    )
  )
  const weightColWidth = Math.max(weightLabel.length, ...formattedRows.map((row) => row.weight.length))
  const timeColWidth = Math.max(timeLabel.length, ...formattedRows.map((row) => row.startTime.length))

  // Build dynamic table borders and headers.
  const top = `┌${'─'.repeat(taskNumColWidth + 2)}┬${'─'.repeat(taskNameColWidth + 2)}┬${'─'.repeat(weightColWidth + 2)}┬${'─'.repeat(timeColWidth + 2)}┐`
  const header = `│ ${taskNumLabel.padEnd(taskNumColWidth)} │ ${taskNameLabel.padEnd(taskNameColWidth)} │ ${weightLabel.padEnd(weightColWidth)} │ ${timeLabel.padEnd(timeColWidth)} │`
  const sep = `├${'─'.repeat(taskNumColWidth + 2)}┼${'─'.repeat(taskNameColWidth + 2)}┼${'─'.repeat(weightColWidth + 2)}┼${'─'.repeat(timeColWidth + 2)}┤`
  const bottom = `└${'─'.repeat(taskNumColWidth + 2)}┴${'─'.repeat(taskNameColWidth + 2)}┴${'─'.repeat(weightColWidth + 2)}┴${'─'.repeat(timeColWidth + 2)}┘`

  const line = '='.repeat(Math.max(top.length, title.length))

  writer.write(`\n${line}\n`)
  writer.write(title + '\n')
  writer.write(line + '\n')
  writer.write(top + '\n')
  writer.write(header + '\n')
  writer.write(sep + '\n')

  formattedRows.forEach((row) => {
    const taskNum = row.taskNum.padEnd(taskNumColWidth)
    const taskName = row.taskName.padEnd(taskNameColWidth).substring(0, taskNameColWidth)
    const weight = row.weight.padStart(weightColWidth)
    const startTime = row.startTime.padEnd(timeColWidth)
    writer.write(`│ ${taskNum} │ ${taskName} │ ${weight} │ ${startTime} │\n`)
  })

  writer.write(bottom + '\n')

  const usedThreads = formattedRows.reduce((sum, row) => sum + row.weightValue, 0)
  const freeThreads = totalThreads - usedThreads

  writer.write(`\n📈 Threads running: ${usedThreads}/${totalThreads} | Free threads: ${freeThreads}\n`)
  writer.write(line + '\n\n')
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
  const showAggregateTable = Boolean(options.aggregateTable)
  const killOthersOnFail = Boolean(options.killOthersOnFail)
  const maxRetries = Number(options.retries) || 0
  const startTime = Date.now()

  let results = tasks.map((task) => ({
    name: task.name,
    code: undefined,
    retries: 0,
    durationMs: 0,
    completionOrder: Infinity,
    completedAtMs: Infinity,
    invocationId: null,
    parentInvocationId: options.summaryParentInvocationId || null,
    mode: options.parallel ? 'parallel' : 'sequential',
  }))
  let completionSeq = 0

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
  const writersByThreadId = new Map() // threadId -> BufferWriter (only when aggregateOutput)
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

      if (options.summaryReportFile) {
        appendRows(
          options.summaryReportFile,
          results.map((result) => ({
            name: result.name,
            code: result.code,
            retries: result.retries,
            durationMs: result.durationMs,
            completionOrder: result.completionOrder,
            completedAtMs: result.completedAtMs,
            invocationId: result.invocationId,
            parentInvocationId: result.parentInvocationId,
            mode: result.mode,
            summaryRootId: options.summaryRootId || null,
          }))
        )
      }

      if (showSummary && options.stdout) {
        let summaryResults = results
        const tableOptions = {}

        if (options.summaryReportFile && !options.summaryParentInvocationId) {
          const mergedRows = readRows(options.summaryReportFile)
            .filter((row) => !options.summaryRootId || row.summaryRootId === options.summaryRootId)
          if (mergedRows.length > 0) {
            summaryResults = mergedRows
            const invocationIds = new Set(mergedRows.map((row) => row.invocationId).filter(Boolean))
            const hasHierarchy = mergedRows.some((row) => row.parentInvocationId && invocationIds.has(row.parentInvocationId))
            if (hasHierarchy) {
              tableOptions.hierarchical = true
              tableOptions.showMode = true
            }
          }
          if (options.summaryAutoCleanup) {
            safeUnlink(options.summaryReportFile)
          }
        }

        tableOptions.startTime = startTime
        options.stdout.write(printSummaryTable(summaryResults, Date.now() - startTime, jobs, tableOptions))
      }
      if (error != null) {
        const failures = results.filter((r) => r.code && r.code !== 0 && r.code !== 137)
        if (failures.length > 1) {
          error = new NpmRunAllError(
            { message: `${failures.length} tasks failed`, code: 1 },
            results
          )
        } else if (failures.length === 1) {
          error = new NpmRunAllError(
            { name: failures[0].name, code: failures[0].code },
            results
          )
        } else {
          if (error.results) error.results = results
        }
        // printSummaryTable already includes the error summary,
        // so mark as reported to prevent duplicate console.error in CLI wrappers.
        if (showSummary) {
          error.reported = true
        }
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
        writer = new BufferWriter()
        opts.stdout = writer
        opts.stderr = writer
        writersByThreadId.set(currentThreadId, writer)
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
          if (update.invocationId) {
            results[update.index].invocationId = update.invocationId
          }
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
          completionOrder: ++completionSeq,
          completedAtMs: Date.now(),
          invocationId: result.invocationId || results[index].invocationId,
          parentInvocationId: options.summaryParentInvocationId || null,
          mode: options.parallel ? 'parallel' : 'sequential',
        }

        // Remove the completed task from the map.
        runningTasks.delete(currentThreadId)
        writersByThreadId.delete(currentThreadId)

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
          if (error === null) {
            error = new NpmRunAllError({ name: result.name, code: result.code }, results)
          }
          if (!opts.continueOnError) {
            return abort()
          }
        }

        freeThreads += weight
        next()

        // Print the updated table after scheduling any new tasks.
        if (!isInitialScheduling && showAggregateTable && runningTasks.size > 0) {
          printThreadTable(runningTasks, jobs, 'COMPLETED', name, options.stdout)
        }

        // When only one task remains and queue is empty, switch it to live output.
        // There's no risk of interleaving, so buffering is no longer needed.
        switchLastTaskToLive()
      }).catch(err => {
        remove(promises, p)
        results[index].completionOrder = ++completionSeq
        results[index].completedAtMs = Date.now()
        results[index].invocationId = err && err.invocationId ? err.invocationId : results[index].invocationId
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

        // Also check for live switch in error path
        switchLastTaskToLive()
      })
    }

    // Switch the last remaining aggregate-output task to live streaming.
    // When only one task is left (and queue is empty), buffering is unnecessary.
    function switchLastTaskToLive() {
      if (!options.aggregateOutput || queue.length > 0 || promises.length !== 1) return
      for (const [tid, w] of writersByThreadId) {
        if (runningTasks.has(tid) && options.stdout) {
          w.switchToLiveStream(options.stdout)
          break
        }
      }
    }

    // Schedule all initial tasks.
    while (freeThreads > 0 && queue.length > 0) next()

    // Print a single table with the initial state after scheduling the first tasks.
    if (runningTasks.size > 0 && showAggregateTable) {
      printThreadTable(runningTasks, jobs, 'INITIAL', 'Initial thread state', options.stdout)
    }
    isInitialScheduling = false

    // If only one task was scheduled, switch it to live output immediately.
    switchLastTaskToLive()
  })
}

