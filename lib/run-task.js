/**
 * @module run-task
 * @author Toru Nagashima (2015)
 * @author Alec Mestroni (2025)
 * @copyright 2015 Toru Nagashima
 * @copyright 2025 Alec Mestroni
 * See LICENSE file in root directory for full license.
 */
"use strict"

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const path = require("path")
const chalk = require("chalk")
const parseArgs = require("shell-quote").parse
const padEnd = require("string.prototype.padend")
const createHeader = require("./create-header")
const createPrefixTransform = require("./create-prefix-transform-stream")
const spawn = require("cross-spawn")
const killTree = require("tree-kill")
const { ENV_FILE, ENV_ROOT, ENV_PARENT, ENV_RETRIES, createId } = require("./summary-report")

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const colors = [chalk.cyan, chalk.green, chalk.magenta, chalk.yellow, chalk.red]

let colorIndex = 0
const taskNamesToColors = new Map()

/**
 * Select a color from given task name.
 *
 * @param {string} taskName - The task name.
 * @returns {function} A colorize function that provided by `chalk`
 */
function selectColor(taskName) {
  let color = taskNamesToColors.get(taskName)
  if (!color) {
    color = colors[colorIndex]
    colorIndex = (colorIndex + 1) % colors.length
    taskNamesToColors.set(taskName, color)
  }
  return color
}

/**
 * Wraps stdout/stderr with a transform stream to add the task name as prefix.
 *
 * @param {string} taskName - The task name.
 * @param {stream.Writable} source - An output stream to be wrapped.
 * @param {object} labelState - A label state for the transform stream.
 * @returns {stream.Writable} `source` or the created wrapped stream.
 */
function wrapLabeling(taskName, source, labelState) {
  if (source == null || !labelState.enabled) {
    return source
  }

  const label = padEnd(taskName, labelState.width)
  const colorFn = source.isTTY ? selectColor(taskName) : (x) => x
  const prefix = colorFn(`[${label}] `)
  const stream = createPrefixTransform(prefix, labelState)

  stream.pipe(source)
  return stream
}

/**
 * Converts a given stream to an option for `child_process.spawn`.
 *
 * @param {stream.Readable|stream.Writable|null} stream - An original stream to convert.
 * @param {process.stdin|process.stdout|process.stderr} std - A standard stream for this option.
 * @returns {string|stream.Readable|stream.Writable} An option for `child_process.spawn`.
 */
function detectStreamKind(stream, std) {
  return stream == null ? "ignore" : stream !== std || !std.isTTY ? "pipe" : stream
}

/**
 * Ensure the output of shell-quote's `parse()` is acceptable input to npm-cli.
 *
 * @param {object|string} arg - Item in the output of shell-quote's `parse()`.
 * @returns {string} A valid argument for npm-cli.
 */
function cleanTaskArg(arg) {
  return arg.pattern || arg.op || arg
}

//------------------------------------------------------------------------------
// Interface
//------------------------------------------------------------------------------

/**
 * Run a npm-script of a given name.
 * The return value is a promise which has an extra method: `abort()`.
 * The `abort()` kills the child process running the npm-script.
 *
 * @param {string} task - A npm-script name to run.
 * @param {object} options - An option object.
 * @param {stream.Readable|null} options.stdin -
 *   A readable stream to send messages to stdin of child process.
 * @param {stream.Writable|null} options.stdout -
 *   A writable stream to receive messages from stdout of child process.
 * @param {stream.Writable|null} options.stderr -
 *   A writable stream to receive messages from stderr of child process.
 * @param {string[]} options.prefixOptions -
 *   An array of options which are inserted before the task name.
 * @param {object} options.labelState - A state object for printing labels.
 * @param {boolean} options.printName - The flag to print task names before running each task.
 * @param {Array<string>} [options.arguments] - Arguments to pass to the npm script.
 * @param {object} [options.packageInfo] - Package metadata from read-package-json.
 * @returns {Promise} A promise which fulfills when the npm-script is completed.
 *                   It has an extra method `abort()`.
 * @private
 */
module.exports = function runTask(task, options) {
  let cp = null
  let shouldKillOthers = false // flag per indicare che il task è stato abortito
  const args = Array.isArray(options.arguments) ? options.arguments : []
  const invocationId = createId("task")

  const promise = new Promise((resolve, reject) => {
    const stdin = options.stdin
    const stdout = wrapLabeling(task, options.stdout, options.labelState)
    const stderr = wrapLabeling(task, options.stderr, options.labelState)

    const stdinKind = detectStreamKind(stdin, process.stdin)
    const stdoutKind = detectStreamKind(stdout, process.stdout)
    const stderrKind = detectStreamKind(stderr, process.stderr)
    const childEnv = Object.assign({}, process.env)
    if (options.summaryReportFile) {
      childEnv[ENV_FILE] = options.summaryReportFile
      if (options.summaryRootId) {
        childEnv[ENV_ROOT] = options.summaryRootId
      }
      childEnv[ENV_PARENT] = invocationId
    }
    if (options.inheritRetries && options.retries > 0) {
      childEnv[ENV_RETRIES] = String(options.retries)
    }
    const spawnOptions = { stdio: [stdinKind, stdoutKind, stderrKind], env: childEnv }

    // Print task name + arguments header
    if (options.printName && options.stdout) {
      const nameAndArgs = args.length > 0 ? `${task} ${args.join(" ")}` : task
      const header = createHeader(nameAndArgs, options.packageInfo, Boolean(options.stdout.isTTY))
      stdout.write(header)
    }

    // Execute the npm-script
    const npmPath = options.npmPath || process.env.npm_execpath
    const npmPathIsJs = typeof npmPath === "string" && /\.m?js$/.test(path.extname(npmPath))
    const execPath = npmPathIsJs ? process.execPath : npmPath || "npm"
    const isYarn = path.basename(npmPath || "npm").startsWith("yarn")
    const spawnArgs = ["run"]

    if (npmPathIsJs) {
      spawnArgs.unshift(npmPath)
    }
    if (!isYarn) {
      spawnArgs.push(...options.prefixOptions)
    } else if (options.prefixOptions.includes("--silent")) {
      spawnArgs.push("--silent")
    }

    // Add script name and passed arguments
    spawnArgs.push(...parseArgs(task).map(cleanTaskArg))
    if (args.length) {
      spawnArgs.push(...args)
    }

    cp = spawn(execPath, spawnArgs, spawnOptions)

    // Track pipe completion for aggregate output
    let stdoutPipeFinished = stdoutKind !== "pipe"
    let stderrPipeFinished = stderrKind !== "pipe"

    // Pipe stdio of the child process
    if (stdinKind === "pipe") {
      stdin.pipe(cp.stdin)
    }
    if (stdoutKind === "pipe") {
      cp.stdout.pipe(stdout, { end: false })
      cp.stdout.on('end', () => {
        stdoutPipeFinished = true
      })
    }
    if (stderrKind === "pipe") {
      cp.stderr.pipe(stderr, { end: false })
      cp.stderr.on('end', () => {
        stderrPipeFinished = true
      })
    }

    cp.on("error", (err) => {
      cp = null
      reject(err)
    })
    cp.on("close", (code, signal) => {
      cp = null

      // Wait for pipes to finish before resolving
      // This is critical for aggregate output to prevent truncation
      const waitForPipes = () => {
        if (stdoutPipeFinished && stderrPipeFinished) {
          if (!shouldKillOthers) {
            resolve({ task, code, signal, invocationId })
          } else {
            reject({ task, signal: "SIGKILL", invocationId })
          }
        } else {
          // Check again on next tick
          setImmediate(waitForPipes)
        }
      }
      
      waitForPipes()
    })
  })

  promise.abort = function abort() {
    if (cp != null) {
      shouldKillOthers = true
      killTree(cp.pid, (err) => {
        if (err && !err.message.includes("not found") && !err.message.includes("not supported")) {
          /* istanbul ignore next */
          console.error("Tree-kill error:", err)
        } else {
          // The process has already been terminated.
        }
      })
      cp = null
    }
  }

  return promise
}
