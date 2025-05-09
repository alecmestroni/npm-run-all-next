/**
 * @author Toru Nagashima (2015)
 * @author Alec Mestroni (2025)
 * @copyright 2016 Toru Nagashima.
 * @copyright 2025 Alec Mestroni.
 * See LICENSE file in root directory for full license.
 */
"use strict"

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const spawn = require("cross-spawn")
const assert = require("assert")
const BufferStream = require("./lib/buffer-stream")
const util = require("./lib/util")
const result = util.result
const removeResult = util.removeResult

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Execute a command.
 * @param {string} command A command to execute.
 * @param {string[]} args Arguments for the command.
 * @returns {Promise<void>} The result of child process's stdout.
 */
function exec(command, args) {
  return new Promise((resolve, reject) => {
    const stderr = new BufferStream()
    const cp = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] })

    cp.stderr.pipe(stderr)
    cp.on("exit", (exitCode) => {
      if (exitCode) {
        reject(new Error(`Exited with ${exitCode}: ${stderr.value}`))
        return
      }
      resolve()
    })
    cp.on("error", reject)
  })
}

const nodeVersion = Number(process.versions.node.split(".")[0])

//------------------------------------------------------------------------------
// Test
//------------------------------------------------------------------------------

;(nodeVersion >= 6 ? describe : xdescribe)("[yarn]", () => {
  before(() => process.chdir("test-workspace"))
  after(() => process.chdir(".."))

  beforeEach(removeResult)

  describe("'yarn run' command", () => {
    it("should run 'npm-run-all' in scripts with yarn.", async () => {
      await exec("yarn", ["run", "test-task:yarn"])
      assert.strictEqual(result(), "aabb")
    })
  })
})