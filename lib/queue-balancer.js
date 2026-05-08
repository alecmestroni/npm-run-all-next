/**
 * @module queue-balancer
 * @author Alec Mestroni (2025)
 * @copyright 2025 Alec Mestroni
 * See LICENSE file in root directory for full license.
 */

const fs = require("fs")
const path = require("path")

const HISTORY_FILE = ".npm-run-all-next-runtimes.json"
const MAX_MEASUREMENTS = 14 // Keep last 2 weeks of measurements

/**
 * Read the historical runtimes map from a JSON file.
 * If the file does not exist or is invalid, returns an empty map.
 * @param {string|null} [customFile] - Custom runtime file path. If null, uses the default.
 * @returns {{ [scriptName: string]: { measurements: number[], avgRuntime: number, count: number } }}
 *   A mapping from script names to their measurement history and average runtime (in seconds).
 */
function readRuntimes(customFile = null) {
  const fileName = customFile || HISTORY_FILE
  const fullPath = path.resolve(process.cwd(), fileName)
  if (!fs.existsSync(fullPath)) {
    return {}
  }
  try {
    const data = JSON.parse(fs.readFileSync(fullPath, "utf8"))

    // Convert old format to new format if necessary
    const converted = {}
    for (const [script, value] of Object.entries(data)) {
      if (value && typeof value === "object") {
        if (Array.isArray(value.measurements)) {
          // New format
          converted[script] = value
        } else if (typeof value.avgRuntime === "number" && typeof value.count === "number") {
          // Old format - convert to new format with single measurement
          converted[script] = {
            measurements: [value.avgRuntime],
            avgRuntime: value.avgRuntime,
            count: 1,
          }
        }
      }
    }
    return converted
  } catch (err) {
    console.warn(`Could not parse runtime history file: ${err}`)
    return {}
  }
}

/**
 * Merge new runtime measurements into an existing history and write the result back to disk.
 * Uses a sliding window approach to keep only the most recent measurements.
 * @param {{ [script: string]: { measurements: number[], avgRuntime: number, count: number } }} oldMap
 *   The existing history of runtimes.
 * @param {{ [script: string]: number[] }} measurements
 *   New runtime measurements in seconds for each script.
 * @param {string|null} [customFile] - Custom runtime file path. If null, uses the default.
 * @returns {void}
 */
function updateRuntimesFile(oldMap, measurements, customFile = null) {
  const out = { ...oldMap }

  for (const [script, runs] of Object.entries(measurements)) {
    // Initialize script entry if it doesn't exist
    if (!out[script]) {
      out[script] = { measurements: [], avgRuntime: 0, count: 0 }
    }

    // Calculate average of new runs for this execution
    const avgNewRuns = runs.reduce((sum, r) => sum + r, 0) / runs.length

    // Add the new measurement to the sliding window
    out[script].measurements.push(avgNewRuns)

    // Keep only the last MAX_MEASUREMENTS
    if (out[script].measurements.length > MAX_MEASUREMENTS) {
      out[script].measurements = out[script].measurements.slice(-MAX_MEASUREMENTS)
    }

    // Recalculate average runtime from all measurements in the window
    const allMeasurements = out[script].measurements
    out[script].avgRuntime = allMeasurements.reduce((sum, m) => sum + m, 0) / allMeasurements.length
    out[script].count = allMeasurements.length
  }

  const fileName = customFile || HISTORY_FILE
  const fullPath = path.resolve(process.cwd(), fileName)

  // Create directory if it doesn't exist
  const dir = path.dirname(fullPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  fs.writeFileSync(fullPath, JSON.stringify(out, null, 2))
}

/**
 * Extract successful run durations from results and update the history file.
 * Only runs with exit code 0 are recorded.
 * @param {Array<{ name: string, durationMs: number, code?: number }>} results
 *   An array of run result objects.
 * @param {string|null} [customFile] - Custom runtime file path. If null, uses the default.
 * @param {{ [key: string]: number[] }|null} [extraMeasurements] - Additional measurements to merge
 *   (e.g., the total wall-clock time of a parallel group). These are merged as-is and are NOT
 *   filtered by exit code — the caller is responsible for only passing them when appropriate.
 * @returns {void}
 */
function updateHistoryFromResults(results, customFile = null, extraMeasurements = null) {
  const oldMap = readRuntimes(customFile)
  const measurements = {}

  for (const { name, durationMs, code } of results) {
    if (typeof durationMs !== "number" || code !== 0) continue
    const secs = durationMs / 1000
    measurements[name] = measurements[name] || []
    measurements[name].push(secs)
  }

  if (extraMeasurements && typeof extraMeasurements === "object") {
    for (const [key, runs] of Object.entries(extraMeasurements)) {
      measurements[key] = measurements[key] || []
      measurements[key].push(...runs)
    }
  }

  updateRuntimesFile(oldMap, measurements, customFile)
}

/**
 * Attach estimated runtimes to each task based on historical averages and sort them
 * in descending order of estimated runtime.
 * Unknown tasks (no history) are assigned a pessimistic high value (Infinity) to ensure
 * they run first, avoiding the worst-case scenario where a long unknown task runs last
 * and blocks all parallelism.
 * @param {Array<{ name: string, [key: string]: any }>} tasks
 *   The list of tasks to reorganize.
 * @param {string|null} [customFile] - Custom runtime file path. If null, uses the default.
 * @returns {Array<{ name: string, estimatedRuntime: number, [key: string]: any }>}
 *   The enriched and sorted list of tasks.
 */
function queueReorganizer(tasks, customFile = null) {
  const runtimesMap = readRuntimes(customFile)

  const enriched = tasks.map((task) => ({
    ...task,
    estimatedRuntime: (runtimesMap[task.name] && runtimesMap[task.name].avgRuntime) || Infinity,
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
    throw new Error(
      `No task found with weight <= ${freeThreads} in queue: ${JSON.stringify(queue)}. \nTIP: Change the queue or increase freeThreads.`
    )
  }
  return queue
}

module.exports = { queueBalancer, queueReorganizer, updateHistoryFromResults, readRuntimes, updateRuntimesFile }
