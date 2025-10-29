/**
 * @author Alec Mestroni
 * @copyright 2025 Alec Mestroni.
 * @license MIT
 *
 * Tests for the --tasks-file option. This flag makes the CLI load tasks from a file containing an array of strings.
 */

"use strict"

const assert = require("assert")
const fs = require("fs")
const path = require("path")
const util = require("./lib/util")
const runAll = util.runAll
const runPar = util.runPar
const runSeq = util.runSeq
const removeResult = util.removeResult
const result = util.result

const TASKS_FILE = path.join(__dirname, "tasks-list.json")

function writeTasksFile(tasks) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks), "utf8")
}
function removeTasksFile() {
  if (fs.existsSync(TASKS_FILE)) fs.unlinkSync(TASKS_FILE)
}

describe("[tasks-file] npm-run-all", () => {
  before(() => process.chdir("test-workspace"))
  after(() => process.chdir(".."))
  beforeEach(() => {
    removeResult()
    removeTasksFile()
  })
  afterEach(() => removeTasksFile())

  it("should run tasks from file (npm-run-all)", async () => {
    writeTasksFile(["test-task:append1 a", "test-task:append2 b"])
    await runAll(["--tasks-file", TASKS_FILE])
    assert.ok(["ab", "abb"].includes(result()))
  })

  it("should run tasks from file (run-p)", async () => {
    writeTasksFile(["test-task:append1 a", "test-task:append b"])
    await runPar(["--tasks-file", TASKS_FILE])
    assert.ok(["ab", "ba", "abb", "bab"].includes(result()))
  })

  it("should run tasks from file (run-s)", async () => {
    writeTasksFile(["test-task:append1 a", "test-task:append2 b"])
    await runSeq(["--tasks-file", TASKS_FILE])
    assert.ok(["ab", "abb"].includes(result()))
  })

  it("should support retries with tasks-file", async () => {
    writeTasksFile(["test-task:append1Error a"])
    try {
      await runAll(["--tasks-file", TASKS_FILE, "--retries", "2"])
    } catch (err) {
      assert.strictEqual((result().match(/a/g) || []).length, 3)
      return
    }
    assert.fail("Expected task to fail after retries")
  })

  it("should error if file is not found", async () => {
    removeTasksFile()
    try {
      await runAll(["--tasks-file", "notfound.json"])
    } catch (err) {
      assert.ok(/Cannot read tasks file/i.test(err.message))
      return
    }
    assert.fail("Expected error for missing file")
  })

  it("should error if file is not a valid array", async () => {
    fs.writeFileSync(TASKS_FILE, '{"not": "an array"}', "utf8")
    try {
      await runAll(["--tasks-file", TASKS_FILE])
    } catch (err) {
      assert.ok(/Tasks file must be a JSON array of strings/i.test(err.message))
      return
    }
    assert.fail("Expected error for invalid file format")
  })

  it("should ignore patterns if tasks-file is set", async () => {
    writeTasksFile(["test-task:append1 a"])
    await runAll(["--tasks-file", TASKS_FILE, "test-task:append2 b"])
    assert.strictEqual(result(), "a")
  })

  it("should run nothing if tasks-file is an empty array", async () => {
    writeTasksFile([])
    await runAll(["--tasks-file", TASKS_FILE])
    assert.ok(result() === null)
  })
})
