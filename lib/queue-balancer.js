const fs = require('fs')
const path = require('path')

const HISTORY_FILE = '.npm-run-all-next-runtimes.json'

/**
 * Read historical runtimes map from JSON file.
 * @returns {{ [scriptName: string]: { count: number, avgRuntime: number } }}
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
 * Merge new measurements into old history and write updated JSON.
 * @param {{ [script: string]: { count: number, avgRuntime: number } }} oldMap
 * @param {{ [script: string]: number[] }} measurements  // seconds per run
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
 * Update history by extracting measurements from run results.
 * @param {Array<{ name: string, durationMs: number }>} results
 */
function updateHistoryFromResults(results) {
  const oldMap = readRuntimes()
  const measurements = {}

  for (const { name, durationMs } of results) {
    // ignore tasks without a duration
    if (typeof durationMs !== 'number') continue
    const secs = durationMs / 1000
    measurements[name] = measurements[name] || []
    measurements[name].push(secs)
  }

  updateRuntimesFile(oldMap, measurements)
}

/**
 * Schedule tasks using Weighted Longest Processing Time first-fit.
 * @param {Array<{name: string, weight: number, estimatedRuntime?: number}>} tasks
 * @param {Object} options
 * @param {number} options.parallel  // number of parallel slots
 * @param {string} [options.HISTORY_FILE]
 * @returns {Array<{name: string, weight: number, estimatedRuntime: number}>}
 */
function queueBalancer(tasks, options = {}) {
  const totalThreads = options.parallel ? options.maxParallel ?? tasks.length : 1
  // Read existing runtimes
  const runtimesMap = readRuntimes()

  // Attach avgRuntime to each task (fallback to 0)
  const enriched = tasks.map((task) => ({
    ...task,
    estimatedRuntime: (runtimesMap[task.name] && runtimesMap[task.name].avgRuntime) || 0,
  }))

  // Sort tasks by avgRuntime descending
  const remaining = enriched.sort((a, b) => b.estimatedRuntime - a.estimatedRuntime)

  const schedule = []
  let currentTime = 0
  const active = []

  while (remaining.length) {
    // calculate used slots
    const used = active.reduce((sum, job) => sum + job.weight, 0)
    let free = totalThreads - used

    // try to pack as many as fit
    for (let i = 0; i < remaining.length && free > 0; ) {
      const job = remaining[i]
      if (job.weight <= free) {
        job._start = currentTime
        job._finish = currentTime + job.estimatedRuntime
        schedule.push(job)
        active.push(job)
        free -= job.weight
        remaining.splice(i, 1)
      } else {
        i++
      }
    }

    // advance time to next finish
    if (active.length === 0) break
    const nextFinish = Math.min(...active.map((j) => j._finish))
    currentTime = nextFinish
    // remove finished
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i]._finish <= currentTime) active.splice(i, 1)
    }
  }

  // Return only name, weight, and carry over estimatedRuntime
  return schedule.map(({ name, weight, estimatedRuntime }) => ({ name, weight, estimatedRuntime }))
}
module.exports = { queueBalancer, updateHistoryFromResults }
