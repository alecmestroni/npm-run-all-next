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
const nodeApi = require("../lib")
const BufferStream = require("./lib/buffer-stream")
const util = require("./lib/util")
const result = util.result
const removeResult = util.removeResult
const runAll = util.runAll
const runPar = util.runPar
const runSeq = util.runSeq

//------------------------------------------------------------------------------
// Test
//------------------------------------------------------------------------------

describe("[pattern] it should run matched tasks if glob like patterns are given.", () => {
  before(() => process.chdir("test-workspace"))
  after(() => process.chdir(".."))
  beforeEach(removeResult)

  describe('"test-task:append:*" to "test-task:append:a" and "test-task:append:b"', () => {
    it("Node API", async () => {
      await nodeApi("test-task:append:*")
      assert.strictEqual(result(), "aabb")
    })

    it("npm-run-all command", async () => {
      await runAll(["test-task:append:*"])
      assert.strictEqual(result(), "aabb")
    })

    it("run-s command", async () => {
      await runSeq(["test-task:append:*"])
      assert.strictEqual(result(), "aabb")
    })

    it("run-p command", async () => {
      await runPar(["test-task:append:*"])
      assert.ok(["abab", "abba", "baba", "baab"].includes(result()), `Expected result to be one of "abab", "abba", "baba", "baab" but got "${result()}"`)
    })
  })

  describe('"test-task:append:**:*" to "test-task:append:a", "test-task:append:a:c", "test-task:append:a:d", and "test-task:append:b"', () => {
    it("Node API", async () => {
      await nodeApi("test-task:append:**:*")
      assert.strictEqual(result(), "aaacacadadbb")
    })

    it("npm-run-all command", async () => {
      await runAll(["test-task:append:**:*"])
      assert.strictEqual(result(), "aaacacadadbb")
    })

    it("run-s command", async () => {
      await runSeq(["test-task:append:**:*"])
      assert.strictEqual(result(), "aaacacadadbb")
    })
  })

  describe('(should ignore duplications) "test-task:append:b" "test-task:append:*" to "test-task:append:b", "test-task:append:a"', () => {
    it("Node API", async () => {
      await nodeApi(["test-task:append:b", "test-task:append:*"])
      assert.strictEqual(result(), "bbaa")
    })

    it("npm-run-all command", async () => {
      await runAll(["test-task:append:b", "test-task:append:*"])
      assert.strictEqual(result(), "bbaa")
    })

    it("run-s command", async () => {
      await runSeq(["test-task:append:b", "test-task:append:*"])
      assert.strictEqual(result(), "bbaa")
    })

    it("run-p command", async () => {
      await runPar(["test-task:append:b", "test-task:append:*"])
      assert.ok(["baba", "baab", "abab", "abba"].includes(result()), `Expected result to be one of "baba", "baab", "abab", "abba" but got "${result()}"`)
    })
  })

  describe('"a" should not match to "test-task:append:a"', () => {
    it("Node API", async () => {
      try {
        await nodeApi("a")
        assert.fail("should not match")
      } catch (err) {
        assert(/not found/i.test(err.message))
      }
    })

    it("npm-run-all command", async () => {
      const stderr = new BufferStream()
      try {
        await runAll(["a"], null, stderr)
        assert.fail("should not match")
      } catch (_err) {
        assert(/not found/i.test(stderr.value))
      }
    })

    it("run-s command", async () => {
      const stderr = new BufferStream()
      try {
        await runSeq(["a"], null, stderr)
        assert.fail("should not match")
      } catch (_err) {
        assert(/not found/i.test(stderr.value))
      }
    })

    it("run-p command", async () => {
      const stderr = new BufferStream()
      try {
        await runPar(["a"], null, stderr)
        assert.fail("should not match")
      } catch (_err) {
        assert(/not found/i.test(stderr.value))
      }
    })
  })

  describe('"!test-task:**" should not match to anything', () => {
    it("Node API", async () => {
      try {
        await nodeApi("!test-task:**")
        assert.fail("should not match")
      } catch (err) {
        assert(/not found/i.test(err.message))
      }
    })

    it("npm-run-all command", async () => {
      const stderr = new BufferStream()
      try {
        await runAll(["!test-task:**"], null, stderr)
        assert.fail("should not match")
      } catch (_err) {
        assert(/not found/i.test(stderr.value))
      }
    })

    it("run-s command", async () => {
      const stderr = new BufferStream()
      try {
        await runSeq(["!test-task:**"], null, stderr)
        assert.fail("should not match")
      } catch (_err) {
        assert(/not found/i.test(stderr.value))
      }
    })

    it("run-p command", async () => {
      const stderr = new BufferStream()
      try {
        await runPar(["!test-task:**"], null, stderr)
        assert.fail("should not match")
      } catch (_err) {
        assert(/not found/i.test(stderr.value))
      }
    })
  })

  describe('"!test" "?test" to "!test", "?test"', () => {
    it("Node API", async () => {
      await nodeApi(["!test", "?test"])
      assert.strictEqual(result().trim(), "XQ")
    })

    it("npm-run-all command", async () => {
      await runAll(["!test", "?test"])
      assert.strictEqual(result().trim(), "XQ")
    })

    it("run-s command", async () => {
      await runSeq(["!test", "?test"])
      assert.strictEqual(result().trim(), "XQ")
    })

    it("run-p command", async () => {
      await runPar(["!test", "?test"])
      assert.ok(["XQ", "QX"].includes(result().trim()), `Expected result to be either "XQ" or "QX" but got "${result().trim()}"`)
    })
  })
})
