/**
 * @author Alec Mestroni
 * @copyright 2025 Alec Mestroni.
 * @license MIT
 *
 * Tests for the --runtime-file option. This flag makes the CLI load runtime configuration from a file containing an object.
 */

"use strict"

const assert = require("assert")
const fs = require("fs")
const path = require("path")
const util = require("./lib/util")
const runAll = util.runAll
const runPar = util.runPar
const removeResult = util.removeResult
const result = util.result

const RUNTIME_FILE = ".npm-run-all-next-runtimes.json"

function removeRuntimeFile() {
  if (fs.existsSync(RUNTIME_FILE)) fs.unlinkSync(RUNTIME_FILE)
}

function writeFakeRuntimes(runtimes) {
  // Simulate the balancer runtime file format
  const file = path.join(process.cwd(), RUNTIME_FILE)
  fs.writeFileSync(file, JSON.stringify(runtimes), "utf8")
  return file
}

describe("[runtime-file] npm-run-all", () => {
  before(() => process.chdir("test-workspace"))
  after(() => process.chdir(".."))
  beforeEach(() => {
    removeRuntimeFile()
    removeResult()
  })
  afterEach(() => {
    removeRuntimeFile()
    removeResult()
  })

  it("should run tasks with runtime config (npm-run-all) and respect balancer order", async () => {
    // Simulate runtime file: append1 is slow, append2 is fast
    writeFakeRuntimes({
      "test-task:append1 a": { measurements: [0.1], avgRuntime: 0.1, count: 1 },
      "test-task:append2 b": { measurements: [2], avgRuntime: 2, count: 1 },
    })
    await runAll(["--parallel", "--jobs", "1", "--balancer", "--runtime-file", RUNTIME_FILE, "test-task:append1 a", "test-task:append2 b"])
    // The balancer should run the slowest first, so result should be 'ab' or 'abb' (order preserved)
    const possible = ["bba"]
    assert.ok(possible.includes(result()), `Expected one of ${JSON.stringify(possible)}, received ${JSON.stringify(result())}`)
  })

  it("should run tasks with runtime config (run-p) and respect balancer order", async () => {
    writeFakeRuntimes({
      'test-task:append1 a': { measurements: [0.1], avgRuntime: 0.1, count: 1 },
      'test-task:append2 b': { measurements: [2], avgRuntime: 2, count: 1 },
    });
    await runPar([
      '--jobs',
      '1',
      '--balancer',
      '--runtime-file',
      RUNTIME_FILE,
      'test-task:append1 a',
      'test-task:append1 c',
      'test-task:append2 b',
    ]);
    // All of them run in sequential (jobs 1), but balancer should order by runtime
    // test-task:append1 c has no history (INFINITY), so it should be treated as slowest and run first, then append2 b, then append1 a
    const possible = ['cbba'];
    assert.ok(
      possible.includes(result()),
      `Expected one of ${JSON.stringify(possible)}, received ${JSON.stringify(result())}`,
    );
  })

  it("should handle missing runtime file gracefully", async () => {
    removeRuntimeFile()
    await runAll(["--runtime-file", "notfound.json"])
    // No error is thrown, so just assert that result is as expected (likely null)
    const actual = result()
    assert.ok(actual === null, `Expected null, received ${JSON.stringify(actual)}`)
  })

  it("should handle invalid runtime file format gracefully", async () => {
    fs.writeFileSync(RUNTIME_FILE, '["not", "an object"]', "utf8")
    await runAll(["--runtime-file", RUNTIME_FILE])
    // No error is thrown, so just assert that result is as expected (likely null)
    const actual = result()
    assert.ok(actual === null, `Expected null, received ${JSON.stringify(actual)}`)
  })
  it("should run nothing if tasks in runtime-file is empty", async () => {
    await runAll(["--runtime-file", RUNTIME_FILE])
    const actual = result()
    assert.ok(actual === null, `Expected null, received ${JSON.stringify(actual)}`)
  })
})
