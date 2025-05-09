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

const assert = require("assert")
const util = require("./lib/util")
const result = util.result
const removeResult = util.removeResult
const runAll = util.runAll

//------------------------------------------------------------------------------
// Test
//------------------------------------------------------------------------------

describe("[mixed] npm-run-all", () => {
  before(() => process.chdir("test-workspace"))
  after(() => process.chdir(".."))

  beforeEach(removeResult)

  it("should run a mix of sequential and parallel tasks (has the default group):", async () => {
    await runAll(["test-task:append a", "-p", "test-task:append b", "test-task:append c", "-s", "test-task:append d", "test-task:append e"])
    assert.ok(["aabcbcddee", "aabccbddee", "aacbbcddee", "aacbcbddee"].includes(result()), `Expected result to be one of "aabcbcddee", "aabccbddee", "aacbbcddee", "aacbcbddee" but got "${result()}"`)
  })

  it("should run a mix of sequential and parallel tasks (doesn't have the default group):", async () => {
    await runAll(["-p", "test-task:append b", "test-task:append c", "-s", "test-task:append d", "test-task:append e"])
    assert.ok(["bcbcddee", "bccbddee", "cbbcddee", "cbcbddee"].includes(result()), `Expected result to be one of "bcbcddee", "bccbddee", "cbbcddee", "cbcbddee" but got "${result()}"`)
  })

  it("should not throw errors for --race and --max-parallel options if --parallel exists:", () =>
    runAll(["test-task:append a", "-p", "test-task:append b", "test-task:append c", "-s", "test-task:append d", "test-task:append e", "-r"]))
})
