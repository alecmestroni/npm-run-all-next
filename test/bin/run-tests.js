/**
 * @author Toru Nagashima (2015)
 * @author Alec Mestroni (2025)
 * @copyright 2017 Toru Nagashima.
 * @copyright 2025 Alec Mestroni.
 * See LICENSE file in root directory for full license.
 */
"use strict"

/*
 * Run tests in parallel.
 * This can reduce the spent time of tests to 1/3, but this is badly affecting to the timers in tests.
 * I need more investigation.
 */

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const spawn = require("child_process").spawn
const path = require("path")
const os = require("os")
const fs = require("fs-extra")
const { default: PQueue } = require("p-queue")

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const ROOT_PATH = path.resolve(__dirname, "../")
const PROJECT_ROOT = path.resolve(__dirname, "../../")
const WORKSPACE_PATH = path.resolve(__dirname, "../../test-workspace")
const MOCHA_PATH = path.resolve(__dirname, "../../node_modules/mocha/bin/_mocha")
const ORDER_LARGEST_FIRST = "largest-first"

// Runtime hints in seconds, used to start heavier files first.
const DURATION_HINTS_SEC = {
  parallel: 191,
  sequential: 135,
  common: 120,
  retry: 99,
  pattern: 92,
  fail: 63,
  "print-summary": 54,
  mixed: 40,
  "aggregate-output": 40,
  "argument-placeholders": 21,
  "tasks-file": 19,
  "print-label": 17,
  config: 11,
  "print-name": 9,
  "runtime-file": 10,
  "queue-balancer": 10,
  yarn: 1,
}

/**
 * Prepare a runnable project sandbox for a single test process.
 * @param {string} runnerPath The sandbox root path.
 * @returns {Promise<void>}
 */
async function setupRunnerSandbox(runnerPath) {
  const links = ["bin", "lib", "node_modules"]
  for (const name of links) {
    const target = path.join(PROJECT_ROOT, name)
    const linkPath = path.join(runnerPath, name)
    await fs.symlink(target, linkPath, "dir")
  }
  await fs.copy(path.join(PROJECT_ROOT, "package.json"), path.join(runnerPath, "package.json"))
}

/**
 * Get the desired test concurrency.
 * @param {number} totalTests The amount of test files.
 * @returns {number} The desired concurrency.
 */
function getConcurrency(totalTests) {
  const raw = Number(process.env.TEST_CONCURRENCY || process.env.NPM_RUN_ALL_TEST_CONCURRENCY)
  if (Number.isInteger(raw) && raw > 0) {
    return Math.min(raw, totalTests)
  }
  return Math.max(1, Math.min(os.cpus().length, totalTests))
}

/**
 * Get the absolute paths of all test files.
 * @returns {Promise<string[]>} The test file paths.
 */
async function getTestFiles() {
  const files = (await fs.readdir(ROOT_PATH))
    .filter((fileName) => path.extname(fileName) === ".js")
    .map((fileName) => path.join(ROOT_PATH, fileName))

  files.sort((a, b) => {
    const aId = path.basename(a, ".js")
    const bId = path.basename(b, ".js")
    const aHint = DURATION_HINTS_SEC[aId] || 0
    const bHint = DURATION_HINTS_SEC[bId] || 0
    if (aHint !== bHint) {
      return bHint - aHint
    }
    return aId.localeCompare(bId)
  })

  return files
}

/**
 * Convert a given duration in seconds to a string.
 * @param {number} durationInSec A duration to convert.
 * @returns {string} The string of the duration.
 */
function durationToText(durationInSec) {
  return `${(durationInSec / 60) | 0}m ${durationInSec % 60 | 0}s`
}

/**
 * Run a given test file.
 * @param {string} filePath The absolute path to a test file.
 * @param {string} workspacePath The absolute path to the workspace directory.
 * @returns {Promise<{duration:number,exitCode:number,failing:number,id:string,passing:number,text:string}>}
 * - `duration` is the spent time in seconds.
 * - `exitCode` is the exit code of the child process.
 * - `failing` is the number of failed tests.
 * - `id` is the name of this tests.
 * - `passing` is the number of succeeded tests.
 * - `text` is the result text of the child process.
 */
function runMocha(filePath, workspacePath) {
  return new Promise((resolve, reject) => {
    const startMs = Date.now()
    const cp = spawn(process.execPath, [MOCHA_PATH, filePath, "--reporter", "json", "--timeout", "120000"], {
      cwd: workspacePath,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""

    cp.stdout.setEncoding("utf8")
    cp.stdout.on("data", (chunk) => {
      stdout += chunk
    })
    cp.stderr.setEncoding("utf8")
    cp.stderr.on("data", (chunk) => {
      stderr += chunk
    })

    cp.on("close", (exitCode) => {
      let passing = 0
      let failing = 0
      let text = stderr.trim()

      try {
        const report = JSON.parse(stdout || "{}")
        const stats = report.stats || {}
        passing = Number(stats.passes) || 0
        failing = Number(stats.failures) || 0

        const failures = Array.isArray(report.failures) ? report.failures : []
        const failureText = failures
          .map((failure, index) => {
            const title = failure.fullTitle || failure.title || "Unknown test failure"
            const message = failure.err && (failure.err.stack || failure.err.message)
            if (message) {
              return `${index + 1}) ${title}\n${message}`
            }
            return `${index + 1}) ${title}`
          })
          .join("\n\n")

        if (failureText) {
          text = text ? `${text}\n\n${failureText}` : failureText
        }
      } catch (_parseError) {
        // If mocha output cannot be parsed, keep the raw output for diagnosis.
        const raw = `${stdout}\n${stderr}`.trim()
        text = raw || text
      }

      resolve({
        duration: (Date.now() - startMs) / 1000,
        exitCode,
        failing,
        id: path.basename(filePath, ".js"),
        passing,
        text
      })
    })
    cp.on("error", reject)
  })
}

/**
 * Run a given test file.
 * @param {string} filePath The absolute path to a test file.
 * @returns {Promise<{duration:number,exitCode:number,failing:number,id:string,passing:number,text:string}>}
 * - `duration` is the spent time in seconds.
 * - `exitCode` is the exit code of the child process.
 * - `failing` is the number of failed tests.
 * - `id` is the name of this tests.
 * - `passing` is the number of succeeded tests.
 * - `text` is the result text of the child process.
 */
async function runMochaWithWorkspace(filePath) {
  const runnerPath = await fs.mkdtemp(path.resolve(os.tmpdir(), "npm-run-all-next-test-"))
  const workspacePath = path.join(runnerPath, "test-workspace")

  await setupRunnerSandbox(runnerPath)
  await fs.copy(WORKSPACE_PATH, workspacePath, { dereference: true, recursive: true })
  try {
    return await runMocha(filePath, runnerPath)
  } finally {
    try {
      await fs.remove(runnerPath)
    } catch (_error) {
      // ignore to keep the original error.
    }
  }
}

//------------------------------------------------------------------------------
// Main
//------------------------------------------------------------------------------

;(async () => {
  const startInSec = process.uptime()
  const testFiles = await getTestFiles()
  const concurrency = getConcurrency(testFiles.length)
  const queue = new PQueue({ concurrency })
  const results = []

  process.stdout.write(`\nRunning ${testFiles.length} files with concurrency ${concurrency} (order: ${ORDER_LARGEST_FIRST})...\n`)

  await Promise.all(
    testFiles.map((filePath, index) =>
      queue.add(async () => {
        const result = await runMochaWithWorkspace(filePath)
        results.push(result)
        process.stdout.write(`\n[${results.length}/${testFiles.length}] ${result.id} (${durationToText(result.duration)})`)
        if (result.exitCode) {
          process.stdout.write(" failed")
        }
      })
    )
  )

  results.sort((a, b) => a.id.localeCompare(b.id))

  process.stdout.write("\n\n")

  for (const result of results) {
    if (result.text) {
      process.stdout.write(`\n${result.text}\n\n`)
    }
    if (result.exitCode) {
      process.exitCode = 1
    }
  }

  let passing = 0
  let failing = 0
  for (const result of results) {
    passing += result.passing
    failing += result.failing
    process.stdout.write(`\n${result.id}: passing ${result.passing} failing ${result.failing} (${durationToText(result.duration)})`)
  }
  process.stdout.write(`\n\nTOTAL: passing ${passing} failing ${failing} (${durationToText(process.uptime() - startInSec)})\n\n`)
})().catch((error) => {
  process.stderr.write(`\n\n${error.stack}\n\n`)
  process.exit(1)
})
