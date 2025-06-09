/**
 * @module queue-balancer
 * @author Alec Mestroni (2025)
 * @copyright 2025 Alec Mestroni
 * See LICENSE file in root directory for full license.
 */

const fs = require('fs')
const path = require('path')

const HISTORY_FILE = '.npm-run-all-next-runtimes.json'

/**
 * Read the historical runtimes map from a JSON file.
 * If the file does not exist or is invalid, returns an empty map.
 * @returns {{ [scriptName: string]: { count: number, avgRuntime: number } }}
 *   A mapping from script names to their execution count and average runtime (in seconds).
 */
function readRuntimes() {
  const fullPath = path.resolve(process.cwd(), HISTORY_FILE)
  if (!fs.existsSync(fullPath)) {
    return {}
  }
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'))
  } catch (err) {
    console.warn(`Could not parse runtime history file: ${err}`)
    return {}
  }
}

/**
 * Merge new runtime measurements into an existing history and write the result back to disk.
 * @param {{ [script: string]: { count: number, avgRuntime: number } }} oldMap
 *   The existing history of runtimes.
 * @param {{ [script: string]: number[] }} measurements
 *   New runtime measurements in seconds for each script.
 * @returns {void}
 */
function updateRuntimesFile(oldMap, measurements) {
  const out = { ...oldMap }

  for (const [script, runs] of Object.entries(measurements)) {
    const m = runs.length
    const totNew = runs.reduce((sum, r) => sum + r, 0)
    if (!out[script]) out[script] = { count: 0, avgRuntime: 0 }

    const { count: c0, avgRuntime: a0 } = out[script]
    const c1 = c0 + m
    const a1 = (a0 * c0 + totNew) / c1
    out[script] = { count: c1, avgRuntime: a1 }
  }

  fs.writeFileSync(path.resolve(process.cwd(), HISTORY_FILE), JSON.stringify(out, null, 2))
}

/**
 * Extract successful run durations from results and update the history file.
 * Only runs with exit code 0 are recorded.
 * @param {Array<{ name: string, durationMs: number, code?: number }>} results
 *   An array of run result objects.
 * @returns {void}
 */
function updateHistoryFromResults(results) {
  const oldMap = readRuntimes()
  const measurements = {}

  for (const { name, durationMs, code } of results) {
    if (typeof durationMs !== 'number' || code !== 0) continue
    const secs = durationMs / 1000
    measurements[name] = measurements[name] || []
    measurements[name].push(secs)
  }

  updateRuntimesFile(oldMap, measurements)
}

/**
 * Attach estimated runtimes to each task based on historical averages and sort them
 * in descending order of estimated runtime.
 * @param {Array<{ name: string, [key: string]: any }>} tasks
 *   The list of tasks to reorganize.
 * @returns {Array<{ name: string, estimatedRuntime: number, [key: string]: any }>}
 *   The enriched and sorted list of tasks.
 */
function queueReorganizer(tasks) {
  const runtimesMap = readRuntimes()

  const enriched = tasks.map((task) => ({
    ...task,
    estimatedRuntime: (runtimesMap[task.name] && runtimesMap[task.name].avgRuntime) || 0,
  }))

  return enriched.sort((a, b) => b.estimatedRuntime - a.estimatedRuntime)
}

/**
 * Rebalance a queue of tasks using a Weighted Longest Processing Time first-fit heuristic.
 * Finds the first task whose weight is less than or equal to the number of free threads
 * and moves it to the front.
 * @param {Array<{ name: string, weight: number, estimatedRuntime?: number }>} queue
 *   The current task queue.
 * @param {number} [freeThreads=queue.length]
 *   The number of available parallel slots.
 * @returns {Array<{ name: string, weight: number, estimatedRuntime?: number }>}

 *   The rebalanced task queue, with the first fitting task at index 0.
 */
function queueBalancer(queue, freeThreads = queue.length) {
  const idx = queue.findIndex((task) => task.weight <= freeThreads)
  if (idx > -1) {
    const [task] = queue.splice(idx, 1)
    queue.unshift(task)
  } else {
    throw new Error(`No task found with weight <= ${freeThreads} in queue: ${JSON.stringify(queue)}. Change the queue or increase freeThreads.`)
  }
  return queue
}

module.exports = { queueBalancer, queueReorganizer, updateHistoryFromResults, readRuntimes, updateRuntimesFile }
