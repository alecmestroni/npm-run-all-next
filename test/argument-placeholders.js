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
const util = require("./lib/util")
const result = util.result
const removeResult = util.removeResult
const runAll = util.runAll
const runPar = util.runPar
const runSeq = util.runSeq

//------------------------------------------------------------------------------
// Test
//------------------------------------------------------------------------------

describe("[argument-placeholders]", () => {
  before(() => process.chdir("test-workspace"))
  after(() => process.chdir(".."))

  beforeEach(removeResult)

  describe("If arguments preceded by '--' are nothing, '{1}' should be empty:", () => {
    it("Node API", () => nodeApi("test-task:dump {1}").then(() => assert.strictEqual(result(), "[]")))

    it("npm-run-all command", () => runAll(["test-task:dump {1}"]).then(() => assert.strictEqual(result(), "[]")))

    it("npm-run-all command (only '--' exists)", () => runAll(["test-task:dump {1}", "--"]).then(() => assert.strictEqual(result(), "[]")))

    it("run-s command", () => runSeq(["test-task:dump {1}"]).then(() => assert.strictEqual(result(), "[]")))

    it("run-s command (only '--' exists)", () => runSeq(["test-task:dump {1}", "--"]).then(() => assert.strictEqual(result(), "[]")))

    it("run-p command", () => runPar(["test-task:dump {1}"]).then(() => assert.strictEqual(result(), "[]")))

    it("run-p command (only '--' exists)", () => runPar(["test-task:dump {1}", "--"]).then(() => assert.strictEqual(result(), "[]")))
  })

  describe("'{1}' should be replaced by the 1st argument preceded by '--':", () => {
    it("Node API", () => nodeApi("test-task:dump {1}", { arguments: ["1st", "2nd"] }).then(() => assert.strictEqual(result(), '["1st"]')))

    it("npm-run-all command", () => runAll(["test-task:dump {1}", "--", "1st", "2nd"]).then(() => assert.strictEqual(result(), '["1st"]')))

    it("run-s command", () => runSeq(["test-task:dump {1}", "--", "1st", "2nd"]).then(() => assert.strictEqual(result(), '["1st"]')))

    it("run-p command", () => runPar(["test-task:dump {1}", "--", "1st", "2nd"]).then(() => assert.strictEqual(result(), '["1st"]')))
  })

  describe("'{2}' should be replaced by the 2nd argument preceded by '--':", () => {
    it("Node API", () => nodeApi("test-task:dump {2}", { arguments: ["1st", "2nd"] }).then(() => assert.strictEqual(result(), '["2nd"]')))

    it("npm-run-all command", () => runAll(["test-task:dump {2}", "--", "1st", "2nd"]).then(() => assert.strictEqual(result(), '["2nd"]')))

    it("run-s command", () => runSeq(["test-task:dump {2}", "--", "1st", "2nd"]).then(() => assert.strictEqual(result(), '["2nd"]')))

    it("run-p command", () => runPar(["test-task:dump {2}", "--", "1st", "2nd"]).then(() => assert.strictEqual(result(), '["2nd"]')))
  })

  describe("'{@}' should be replaced by the every argument preceded by '--':", () => {
    it("Node API", () => nodeApi("test-task:dump {@}", { arguments: ["1st", "2nd"] }).then(() => assert.strictEqual(result(), '["1st","2nd"]')))

    it("npm-run-all command", () => runAll(["test-task:dump {@}", "--", "1st", "2nd"]).then(() => assert.strictEqual(result(), '["1st","2nd"]')))

    it("run-s command", () => runSeq(["test-task:dump {@}", "--", "1st", "2nd"]).then(() => assert.strictEqual(result(), '["1st","2nd"]')))

    it("run-p command", () => runPar(["test-task:dump {@}", "--", "1st", "2nd"]).then(() => assert.strictEqual(result(), '["1st","2nd"]')))
  })

  describe("'{*}' should be replaced by the all arguments preceded by '--':", () => {
    it("Node API", () => nodeApi("test-task:dump {*}", { arguments: ["1st", "2nd"] }).then(() => assert.strictEqual(result(), '["1st 2nd"]')))

    it("npm-run-all command", () => runAll(["test-task:dump {*}", "--", "1st", "2nd"]).then(() => assert.strictEqual(result(), '["1st 2nd"]')))

    it("run-s command", () => runSeq(["test-task:dump {*}", "--", "1st", "2nd"]).then(() => assert.strictEqual(result(), '["1st 2nd"]')))

    it("run-p command", () => runPar(["test-task:dump {*}", "--", "1st", "2nd"]).then(() => assert.strictEqual(result(), '["1st 2nd"]')))
  })

  describe("Every '{1}', '{2}', '{@}' and '{*}' should be replaced by the arguments preceded by '--':", () => {
    it("Node API", () => nodeApi("test-task:dump {1} {2} {3} {@} {*}", { arguments: ["1st", "2nd"] }).then(() => assert.strictEqual(result(), '["1st","2nd","1st","2nd","1st 2nd"]')))

    it("npm-run-all command", () => runAll(["test-task:dump {1} {2} {3} {@} {*}", "--", "1st", "2nd"]).then(() => assert.strictEqual(result(), '["1st","2nd","1st","2nd","1st 2nd"]')))

    it("run-s command", () => runSeq(["test-task:dump {1} {2} {3} {@} {*}", "--", "1st", "2nd"]).then(() => assert.strictEqual(result(), '["1st","2nd","1st","2nd","1st 2nd"]')))

    it("run-p command", () => runPar(["test-task:dump {1} {2} {3} {@} {*}", "--", "1st", "2nd"]).then(() => assert.strictEqual(result(), '["1st","2nd","1st","2nd","1st 2nd"]')))
  })

  describe("'{1:-foo}' should be replaced by 'foo' if arguments are nothing:", () => {
    it("Node API", () => nodeApi("test-task:dump {1:-foo} {1}").then(() => assert.strictEqual(result(), '["foo"]')))

    it("npm-run-all command", () => runAll(["test-task:dump {1:-foo} {1}"]).then(() => assert.strictEqual(result(), '["foo"]')))

    it("run-s command", () => runSeq(["test-task:dump {1:-foo} {1}"]).then(() => assert.strictEqual(result(), '["foo"]')))

    it("run-p command", () => runPar(["test-task:dump {1:-foo} {1}"]).then(() => assert.strictEqual(result(), '["foo"]')))
  })

  describe("'{1:=foo}' should be replaced by 'foo' and should affect following '{1}' if arguments are nothing:", () => {
    it("Node API", () => nodeApi("test-task:dump {1:=foo} {1}").then(() => assert.strictEqual(result(), '["foo","foo"]')))

    it("npm-run-all command", () => runAll(["test-task:dump {1:=foo} {1}"]).then(() => assert.strictEqual(result(), '["foo","foo"]')))

    it("run-s command", () => runSeq(["test-task:dump {1:=foo} {1}"]).then(() => assert.strictEqual(result(), '["foo","foo"]')))

    it("run-p command", () => runPar(["test-task:dump {1:=foo} {1}"]).then(() => assert.strictEqual(result(), '["foo","foo"]')))
  })
})
