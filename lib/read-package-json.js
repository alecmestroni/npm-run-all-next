/**
 * @module read-package-json
 * @author Alec Mestroni (2025)
 * @copyright 2025 Alec Mestroni
 * See LICENSE file in root directory for full license.
 */
"use strict"

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const path = require("path")
const fs = require("fs")
const readPkg = require("read-pkg")
const parseCliArgs = require("../bin/common/parse-cli-args")
const matchTasks = require("./match-tasks")
const parsePatterns = require("./parse-patterns")

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Detect concurrency weight of a script command.
 * @param {string} scriptCmd
 * @returns {number}
 */
function detectConcurrencyWeight(scriptCmd, taskList) {
  // Se contiene sia "npm-run-all" che "--parallel" o se contiene "run-p"
  if (
    (/npm[- ]run[- ]all /.test(scriptCmd) && /--parallel/.test(scriptCmd)) ||
    /run[- ]p /.test(scriptCmd) ||
    /\.\.\/bin\/run-p\/index\.js/.test(scriptCmd)
  ) {
    try {
      const scriptCmdCleaned = scriptCmd
        .replace(/node\s+\.\.\/bin\/run-p\/index\.js /, "")
        .split(" ")
        .filter((s) => s !== "run-p" && s !== "npm-run-all")
      const args = parseCliArgs(scriptCmdCleaned, { parallel: true }, { singleMode: true })
      if (args.jobs > 0) {
        return args.jobs
      } else {
        let totalTasks = 0
        for (const group of args.groups) {
          const patterns = parsePatterns(group.patterns, args)
          const tasks = matchTasks(taskList, patterns)
          totalTasks += tasks.length
        }

        return totalTasks > 0 ? totalTasks : 2
      }
    } catch (e) {
      throw new Error("Error parsing script command: " + scriptCmd + "\n" + e)
    }
  }

  return 1
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

/**
 * Reads package.json and optionally filters scripts by patterns,
 * then computes historical runtimes and concurrency weight.
 *
 * @param {string[]} [patterns] Optional array of glob patterns to match script names.
 * @returns {Promise<Object|Array>}
 *   If patterns is not provided, resolves with the parsed package.json body.
 *   Otherwise, resolves with an array [packageInfo, tasks], where:
 *     - packageInfo: { path: string, body: object }
 *     - tasks: Array<{ name: string, weight: number }>
 * @throws {Error} If package.json is not found or is not readable.
 */
module.exports = function readPackageJson(patterns) {
  const pkgPath = path.join(process.cwd(), "package.json")
  // Ensure package.json exists
  try {
    fs.accessSync(pkgPath, fs.constants.R_OK)
  } catch (_e) {
    return Promise.reject(new Error("No package.json found in the current directory: " + process.cwd()))
  }

  // Read scripts and package body
  return readPkg(pkgPath)
    .then((body) => {
      const packageInfo = { path: pkgPath, body }
      if (patterns) {
        const scripts = body.scripts || {}
        const taskList = Object.keys(scripts)

        const tasks = matchTasks(taskList, patterns)

        // Compute concurrency weight
        for (const task of tasks) {
          const cmd = scripts[task.name]
          task.weight = detectConcurrencyWeight(cmd, taskList)
        }

        // L’ordine deve essere coerente con index.js!
        return [packageInfo, tasks]
      } else {
        // TODO check if its ok to return body or packageInfo
        return packageInfo
      }
    })
    .catch((err) => {
      return Promise.reject(new Error("Error reading package.json: " + err.message + err.stack))
    })
}
