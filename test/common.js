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
const fs = require("fs") // added
const printHelpAll = require("../bin/npm-run-all/help.js")
const printHelpPar = require("../bin/run-p/help.js")
const printHelpSeq = require("../bin/run-s/help.js")
//------------------------------------------------------------------------------
// Test
//------------------------------------------------------------------------------

describe("[common]", () => {
  before(() => process.chdir("test-workspace"))
  after(() => process.chdir(".."))

  beforeEach(removeResult)

  const helpArray = [
    { name: "npm-run-all", fn: printHelpAll, doc: "npm-run-all.md" },
    { name: "run-p", fn: printHelpPar, doc: "run-p.md" },
    { name: "run-s", fn: printHelpSeq, doc: "run-s.md" },
  ]

  helpArray.forEach(({ name, fn, doc }) => {
    describe(`when the Options section is missing in ${doc}`, () => {
      let origRead
      before(() => {
        // mock readFileSync so docs have no "Options:" section
        origRead = fs.readFileSync
        fs.readFileSync = () => "This file does not contain the required section"
      })
      after(() => {
        fs.readFileSync = origRead
      })
      it(`should throw an error in ${name}.help() with correct message`, () => {
        const out = new BufferStream()
        assert.throws(
          () => fn(out),
          // match either Italian or English message, plus the doc filename
          new RegExp(`(Unable to find|Impossibile trovare).+Options.+${doc}`)
        )
      })
    })
  })

  describe("should print a help text if arguments are nothing.", () => {
    it("npm-run-all command", async () => {
      const buf = new BufferStream()
      await runAll([], buf)
      assert.ok(/Usage:/.test(buf.value))
    })

    it("run-s command", async () => {
      const buf = new BufferStream()
      await runSeq([], buf)
      assert.ok(/Usage:/.test(buf.value))
    })

    it("run-p command", async () => {
      const buf = new BufferStream()
      await runPar([], buf)
      assert.ok(/Usage:/.test(buf.value))
    })
  })

  describe("should print a help text if the first argument is --help (-h)", () => {
    it("npm-run-all command (-h)", async () => {
      const buf = new BufferStream()
      await runAll(["-h"], buf)
      assert.ok(/Usage:/.test(buf.value))
    })

    it("run-s command (-h)", async () => {
      const buf = new BufferStream()
      await runSeq(["-h"], buf)
      assert.ok(/Usage:/.test(buf.value))
    })

    it("run-p command (-h)", async () => {
      const buf = new BufferStream()
      await runPar(["-h"], buf)
      assert.ok(/Usage:/.test(buf.value))
    })

    it("npm-run-all command (--help)", async () => {
      const buf = new BufferStream()
      await runAll(["--help"], buf)
      assert.ok(/Usage:/.test(buf.value))
    })

    it("run-s command (--help)", async () => {
      const buf = new BufferStream()
      await runSeq(["--help"], buf)
      assert.ok(/Usage:/.test(buf.value))
    })

    it("run-p command (--help)", async () => {
      const buf = new BufferStream()
      await runPar(["--help"], buf)
      assert.ok(/Usage:/.test(buf.value))
    })
  })

  describe("should print a version number if the first argument is --version (-v)", () => {
    it("npm-run-all command (-v)", async () => {
      const buf = new BufferStream()
      await runAll(["-v"], buf)
      assert.ok(/v[0-9]+\.[0-9]+\.[0-9]+/.test(buf.value))
    })

    it("run-s command (-v)", async () => {
      const buf = new BufferStream()
      await runSeq(["-v"], buf)
      assert.ok(/v[0-9]+\.[0-9]+\.[0-9]+/.test(buf.value))
    })

    it("run-p command (-v)", async () => {
      const buf = new BufferStream()
      await runPar(["-v"], buf)
      assert.ok(/v[0-9]+\.[0-9]+\.[0-9]+/.test(buf.value))
    })

    it("npm-run-all command (--version)", async () => {
      const buf = new BufferStream()
      await runAll(["--version"], buf)
      assert.ok(/v[0-9]+\.[0-9]+\.[0-9]+/.test(buf.value))
    })

    it("run-s command (--version)", async () => {
      const buf = new BufferStream()
      await runSeq(["--version"], buf)
      assert.ok(/v[0-9]+\.[0-9]+\.[0-9]+/.test(buf.value))
    })

    it("run-p command (--version)", async () => {
      const buf = new BufferStream()
      await runPar(["--version"], buf)
      assert.ok(/v[0-9]+\.[0-9]+\.[0-9]+/.test(buf.value))
    })
  })

  describe("should do nothing if a task list is empty.", () => {
    it("Node API", async () => {
      await nodeApi(null)
      assert.strictEqual(result(), null)
    })
  })

  describe("should read -s as silent when single mode is active.", () => {
    it("run-p command", async () => {
      const buf = new BufferStream()
      await runPar(["-s"], buf)
      assert.strictEqual(buf.value, "")
    })
  })

  describe("should ignore color flags", () => {
    it("run-p command", async () => {
      await runAll(["--color"])
    })
  })

  describe("should ignore color flags", () => {
    it("run-p command", async () => {
      await runAll(["--no-color"])
    })
  })

  describe("should handle signals correctly", () => {
    const convertSignal = require("../lib/signals")

    it("should return the correct code for known signals", () => {
      assert.strictEqual(convertSignal("SIGINT"), 2)
      assert.strictEqual(convertSignal("SIGKILL"), 9)
      assert.strictEqual(convertSignal("SIGUSR1"), 30)
    })

    it("should return 0 for unknown signals or missing argument", () => {
      assert.strictEqual(convertSignal("SIGTERM"), 0) // non definito nella mappa
      assert.strictEqual(convertSignal("NON_EXISTENT"), 0)
      assert.strictEqual(convertSignal(), 0)
    })
  })

  describe("should run a task by npm (check an environment variable):", () => {
    it("Node API", async () => {
      await nodeApi("test-task:package-config")
      assert.strictEqual(result(), "OK")
    })

    it("npm-run-all command", async () => {
      await runAll(["test-task:package-config"])
      assert.strictEqual(result(), "OK")
    })

    it("run-s command", async () => {
      await runSeq(["test-task:package-config"])
      assert.strictEqual(result(), "OK")
    })

    it("run-p command", async () => {
      await runPar(["test-task:package-config"])
      assert.strictEqual(result(), "OK")
    })
  })

  describe("stdin can be used in tasks:", () => {
    it("Node API", async () => {
      await nodeApi("test-task:stdin")
      assert.strictEqual(result().trim(), "STDIN")
    })

    it("npm-run-all command", async () => {
      await runAll(["test-task:stdin"])
      assert.strictEqual(result().trim(), "STDIN")
    })

    it("run-s command", async () => {
      await runSeq(["test-task:stdin"])
      assert.strictEqual(result().trim(), "STDIN")
    })

    it("run-p command", async () => {
      await runPar(["test-task:stdin"])
      assert.strictEqual(result().trim(), "STDIN")
    })
  })

  describe("stdout can be used in tasks:", () => {
    it("Node API", async () => {
      await nodeApi("test-task:stdout")
      assert.strictEqual(result(), "STDOUT")
    })

    it("npm-run-all command", async () => {
      await runAll(["test-task:stdout"])
      assert.strictEqual(result(), "STDOUT")
    })

    it("run-s command", async () => {
      await runSeq(["test-task:stdout"])
      assert.strictEqual(result(), "STDOUT")
    })

    it("run-p command", async () => {
      await runPar(["test-task:stdout"])
      assert.strictEqual(result(), "STDOUT")
    })
  })

  describe("stderr can be used in tasks:", () => {
    it("Node API", async () => {
      await nodeApi("test-task:stderr")
      assert.strictEqual(result(), "STDERR")
    })

    it("npm-run-all command", async () => {
      await runAll(["test-task:stderr"])
      assert.strictEqual(result(), "STDERR")
    })

    it("run-s command", async () => {
      await runSeq(["test-task:stderr"])
      assert.strictEqual(result(), "STDERR")
    })

    it("run-p command", async () => {
      await runPar(["test-task:stderr"])
      assert.strictEqual(result(), "STDERR")
    })
  })

  describe("should be able to use `restart` built-in task:", () => {
    it("Node API", () => nodeApi("restart"))
    it("npm-run-all command", () => runAll(["restart"]))
    it("run-s command", () => runSeq(["restart"]))
    it("run-p command", () => runPar(["restart"]))
  })

  describe("should be able to use `env` built-in task:", () => {
    it("Node API", () => nodeApi("env"))
    it("npm-run-all command", () => runAll(["env"]))
    it("run-s command", () => runSeq(["env"]))
    it("run-p command", () => runPar(["env"]))
  })

  if (process.platform === "win32") {
    describe("issue14", () => {
      it("Node API", () => nodeApi("test-task:issue14:win32"))
      it("npm-run-all command", () => runAll(["test-task:issue14:win32"]))
      it("run-s command", () => runSeq(["test-task:issue14:win32"]))
      it("run-p command", () => runPar(["test-task:issue14:win32"]))
    })
  } else {
    describe("issue14", () => {
      it("Node API", () => nodeApi("test-task:issue14:posix"))
      it("npm-run-all command", () => runAll(["test-task:issue14:posix"]))
      it("run-s command", () => runSeq(["test-task:issue14:posix"]))
      it("run-p command", () => runPar(["test-task:issue14:posix"]))
    })
  }

  describe("should not print log if silent option was given:", () => {
    it("Node API", async () => {
      const stdout = new BufferStream()
      const stderr = new BufferStream()
      try {
        await nodeApi("test-task:error", { silent: true, stdout, stderr })
      } catch (_err) {
        assert.strictEqual(stdout.value, "")
        assert.strictEqual(stderr.value, "")
        return
      }
      assert.fail("Should fail.")
    })

    /**
     * Strip unknown istanbul's warnings.
     * @param {string} str - The string to be stripped.
     * @returns {string} The stripped string.
     */
    function stripIstanbulWarnings(str) {
      return str.replace(/File \[.+?] ignored, nothing could be mapped\r?\n/, "")
    }

    it("npm-run-all command", async () => {
      const stdout = new BufferStream()
      const stderr = new BufferStream()
      try {
        await runAll(["--silent", "test-task:error"], stdout, stderr)
      } catch (_err) {
        assert.strictEqual(stdout.value, "")
        assert.strictEqual(stripIstanbulWarnings(stderr.value), "")
        return
      }
      assert.fail("Should fail.")
    })

    it("run-s command", async () => {
      const stdout = new BufferStream()
      const stderr = new BufferStream()
      try {
        await runSeq(["--silent", "test-task:error"], stdout, stderr)
      } catch (_err) {
        assert.strictEqual(stdout.value, "")
        assert.strictEqual(stripIstanbulWarnings(stderr.value), "")
        return
      }
      assert.fail("Should fail.")
    })

    it("run-p command", async () => {
      const stdout = new BufferStream()
      const stderr = new BufferStream()
      try {
        await runPar(["--silent", "test-task:error"], stdout, stderr)
      } catch (_err) {
        assert.strictEqual(stdout.value, "")
        assert.strictEqual(stripIstanbulWarnings(stderr.value), "")
        return
      }
      assert.fail("Should fail.")
    })
  })

  describe("should not print MaxListenersExceededWarning when it runs 10 tasks:", () => {
    const tasks = Array.from({ length: 10 }, () => "test-task:append:a")

    it("npm-run-all command", async () => {
      const buf = new BufferStream()
      await runAll(tasks, null, buf)
      assert.strictEqual(buf.value.indexOf("MaxListenersExceededWarning"), -1)
    })

    it("run-s command", async () => {
      const buf = new BufferStream()
      await runSeq(tasks, null, buf)
      assert.strictEqual(buf.value.indexOf("MaxListenersExceededWarning"), -1)
    })

    it("run-p command", async () => {
      const buf = new BufferStream()
      await runPar(tasks, null, buf)
      assert.strictEqual(buf.value.indexOf("MaxListenersExceededWarning"), -1)
    })
  })

  describe("nodeApi color output integration", () => {
    // working in local machine but not in GITHUB CI environment
    it.skip("should produce colored output when printLabel is true and stdout is TTY", async () => {
      const buf = new BufferStream()
      buf.isTTY = true
      await nodeApi("test-task:stdout", { printLabel: true, stdout: buf })
      // Codici ANSI per colore: \u001b[ (ESC [)
      assert.match(buf.value, /\u001b\[/, "Output should contain ANSI color codes")
    })

    it("should NOT produce colored output when printLabel is false and stdout is TTY", async () => {
      const buf = new BufferStream()
      buf.isTTY = true
      await nodeApi("test-task:stdout", { printLabel: false, stdout: buf })
      assert.doesNotMatch(buf.value, /\u001b\[/, "Output should NOT contain ANSI color codes")
    })
  })

  // Test end-to-end per test-task:nest-parallel:error
  describe("error handling for nested-parallel weight calculation", () => {
    it("should throw error with correct message for invalid --jobs value", async () => {
      try {
        await runAll(["test-task:nest-parallel:error"])
      } catch (err) {
        assert.match(err.message, /Error parsing script command: node \.\.\/bin\/run-p\/index\.js test-task:append:a:\* --jobs notanumber/)
        assert.match(err.message, /Invalid Option: --jobs notanumber/)
        return
      }
      assert.fail("Should throw error for invalid --jobs value")
    })
  })
})
