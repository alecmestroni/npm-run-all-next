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
const ansiStyles = require("ansi-styles")
const printSummary = require("../lib/print-summary")
const BufferStream = require("./lib/buffer-stream")
const util = require("./lib/util")
const nodeApi = require("../lib")

const removeResult = util.removeResult
const runAll = util.runAll
const runPar = util.runPar
const runSeq = util.runSeq

//------------------------------------------------------------------------------
// Utils
//------------------------------------------------------------------------------

const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const getTableRaw = (results, target) => {
  const regex = new RegExp(`\\|\\s*${escapeRegExp(target)}\\s*\\|`)
  return results.split("\n").find((line) => {
    return /^(?:\x1B\[[0-9;]*m)*\|/.test(line) && regex.test(line)
  })
}

const getTableRawElements = (results, string) => {
  const raw = getTableRaw(results, string)
  return raw
    .split("|")
    .map((el) => el.trim().replace(/ +/g, " "))
    .filter((el) => el)
}

//------------------------------------------------------------------------------
// Test
//------------------------------------------------------------------------------

describe("[print-summary] npm-run-all", () => {
  before(() => process.chdir("test-workspace"))
  after(() => process.chdir(".."))
  let stdout
  beforeEach(() => {
    stdout = new BufferStream()
    removeResult()
  })
  describe("[printSummary]", () => {
    describe("core", () => {
      it("styles a successful (exit code 0) row in white", () => {
        const results = [{ name: "successTask", code: 0, retries: 0, durationMs: 1500 }]
        const rowLine = printSummary(results)
          .split("\n")
          .find((l) => l.includes("successTask"))
        assert(rowLine.startsWith(ansiStyles.white.open))
        assert(rowLine.endsWith(ansiStyles.white.close))
        assert(rowLine.includes("successTask"))
        assert(rowLine.includes("0"))
        assert(rowLine.includes("0"))
        assert(rowLine.includes("1.50"))
      })

      it('styles a forced kill (exit code 137) row in gray and shows "(Killed)"', () => {
        const results = [{ name: "forcedTask", code: 137, retries: 1, durationMs: 123 }]
        const rowLine = printSummary(results)
          .split("\n")
          .find((l) => l.includes("forcedTask"))
        assert(rowLine.startsWith(ansiStyles.gray.open))
        assert(rowLine.endsWith(ansiStyles.gray.close))
        assert(rowLine.includes("137 (Killed)"))
        assert(rowLine.includes("1"))
        assert(rowLine.includes("0.12"))
      })

      it("styles a failing (non-zero, non-137) row in red", () => {
        const results = [{ name: "failTask", code: 2, retries: 3, durationMs: 900 }]
        const rowLine = printSummary(results)
          .split("\n")
          .find((l) => l.includes("failTask"))
        assert(rowLine.startsWith(ansiStyles.red.open))
        assert(rowLine.endsWith(ansiStyles.red.close))
        assert(rowLine.includes("2"))
        assert(rowLine.includes("3"))
        assert(rowLine.includes("0.90"))
      })

      it("aligns columns correctly for mixed-length entries", () => {
        const results = [
          { name: "short", code: 0, retries: 0, durationMs: 1000 },
          { name: "muchLongerTaskName", code: 1, retries: 2, durationMs: 2000 },
        ]
        const rawLines = printSummary(results)
          .split("\n")
          .filter((l) => l)

        const stripAnsi = (str) => str.replace(/\u001b\[[0-9;]*m/g, "")

        const lines = rawLines.map(stripAnsi)

        const headerLine = lines.find((l) => l.includes("Task") && l.includes("FinalExitCode"))
        const headerCols = headerLine.split("|").slice(1, -1)

        const dataLines = lines.filter((l) => /short|muchLongerTaskName/.test(l))

        dataLines.forEach((line) => {
          const cols = line.split("|").slice(1, -1)
          cols.forEach((cell, i) => {
            assert.strictEqual(cell.length, headerCols[i].length, `Colonna ${i} non allineata: expected ${headerCols[i].length}, got ${cell.length}`)
          })
        })
      })

      it("prints only headers when results is empty", () => {
        const lines = printSummary([])
          .split("\n")
          .filter((l) => l)
        assert.strictEqual(lines.length, 8) // ora c’è anche Estimated Total Time
        const [divider, printSummaryTable, divider2, header, separator, divider3, est] = lines

        const summaryInner = printSummaryTable.slice(1, -1).trim()
        assert.strictEqual(summaryInner, "Summary")
        assert.strictEqual(divider, divider2)
        assert.strictEqual(divider2, divider3)
        assert(header.includes("Task"))
        assert(separator.includes("-".repeat(header.split("|")[1].trim().length)))
        assert.strictEqual(est, "| Estimated Total Time:              0.00 s|")
      })

      it("formats estimated total time in seconds when <60s", () => {
        const results = [
          { name: "a", code: 0, retries: 0, durationMs: 1500 },
          { name: "b", code: 0, retries: 0, durationMs: 2500 },
        ]
        const lines = printSummary(results)
          .split("\n")
          .filter((l) => l)
        const penult = lines[lines.length - 2]
        assert.strictEqual(penult, "| Estimated Total Time:              4.00 s|")
      })

      it("converts estimated total time to minutes when ≥60s", () => {
        const results = [{ name: "long", code: 0, retries: 0, durationMs: 90000 }]
        const lines = printSummary(results)
          .split("\n")
          .filter((l) => l)
        const penult = lines[lines.length - 2]
        assert.strictEqual(penult, "| Estimated Total Time:            1.50 min|")
      })

      it("prints actual total time when provided", () => {
        const results = [{ name: "x", code: 0, retries: 0, durationMs: 1000 }]
        const lines = printSummary(results, 2000)
          .split("\n")
          .filter((l) => l)
        const penult = lines[lines.length - 2]
        const terzult = lines[lines.length - 3]
        assert.strictEqual(penult, "| Actual Total Time:                 2.00 s|")
        assert.strictEqual(terzult, "| Estimated Total Time:              1.00 s|")
      })

      it("converts actual total time to minutes when ≥60s", () => {
        const results = [{ name: "y", code: 0, retries: 0, durationMs: 1000 }]
        const lines = printSummary(results, 120000)
          .split("\n")
          .filter((l) => l)
        const penult = lines[lines.length - 2]
        const terzult = lines[lines.length - 3]
        assert.strictEqual(penult, "| Actual Total Time:               2.00 min|")
        assert.strictEqual(terzult, "| Estimated Total Time:              1.00 s|")
      })
    })
  })

  describe("[print-summary]", () => {
    describe("should not print anything when no tasks are provided", () => {
      it("Node API ", async () => {
        await nodeApi([], { printSummaryTable: true })
        const lines = stdout.value.split("\n").filter((l) => l)

        assert.strictEqual(lines.length, 0)
      })
      it("npm-run-all command ", async () => {
        await runAll("--print-summary-table")
        const lines = stdout.value.split("\n").filter((l) => l)

        assert.strictEqual(lines.length, 0)
      })
      it("run-p command ", async () => {
        await runPar("--print-summary-table")
        const lines = stdout.value.split("\n").filter((l) => l)

        assert.strictEqual(lines.length, 0)
      })
      it("run-s command ", async () => {
        await runSeq("--print-summary-table")
        const lines = stdout.value.split("\n").filter((l) => l)

        assert.strictEqual(lines.length, 0)
      })
    })

    describe("styles a successful task row in white", () => {
      const runners = [
        ["Node API", async () => nodeApi(["test-task:fast a"], { printSummaryTable: true, stdout })],
        ["npm-run-all command", async () => runAll(["test-task:fast a", "--print-summary-table"], stdout)],
        ["run-p command", async () => runPar(["test-task:fast a", "--print-summary-table"], stdout)],
        ["run-s command", async () => runSeq(["test-task:fast a", "--print-summary-table"], stdout)],
      ]

      function assertSuccessRow() {
        const row = getTableRaw(stdout.value, "test-task:fast a")
        assert(row.startsWith(ansiStyles.white.open))
        assert(row.endsWith(ansiStyles.white.close))
        assert(row.includes("0"))
      }

      runners.forEach(([name, runFn]) => {
        it(name, async () => {
          await runFn()
          assertSuccessRow()
        })
      })
    })

    describe("styles a failing task row in red", () => {
      const runners = [
        ["Node API", async () => nodeApi(["test-task:fastError"], { printSummaryTable: true, stdout })],
        ["npm-run-all cmd", async () => runAll(["test-task:fastError", "--print-summary-table"], stdout)],
        ["run-p cmd", async () => runPar(["test-task:fastError", "--print-summary-table"], stdout)],
        ["run-s cmd", async () => runSeq(["test-task:fastError", "--print-summary-table"], stdout)],
      ]

      function assertFailRow() {
        const row = getTableRaw(stdout.value, "test-task:fastError")
        assert(row.startsWith(ansiStyles.red.open))
        assert(row.includes("1"))
      }

      runners.forEach(([name, runFn]) => {
        it(name, async () => {
          try {
            await runFn()
          } catch (_) {
            // ignore error
          }
          assertFailRow()
        })
      })
    })

    describe("styles a successful task row in white", () => {
      const runners = [
        ["Node API", async () => nodeApi(["test-task:fast a"], { printSummaryTable: true, stdout })],
        ["npm-run-all command", async () => runAll(["test-task:fast a", "--print-summary-table"], stdout)],
        ["run-p command", async () => runPar(["test-task:fast a", "--print-summary-table"], stdout)],
        ["run-s command", async () => runSeq(["test-task:fast a", "--print-summary-table"], stdout)],
      ]

      function assertSuccessRow() {
        const row = getTableRaw(stdout.value, "test-task:fast a")
        assert(row.startsWith(ansiStyles.white.open))
        assert(row.endsWith(ansiStyles.white.close))
        assert(row.includes("0"))
      }

      runners.forEach(([name, runFn]) => {
        it(name, async () => {
          await runFn()
          assertSuccessRow()
        })
      })
    })
  })

  describe("[print-summary + sequential]", () => {
    describe("should print lines based on script number", () => {
      const runners = [
        ["Node API", async () => nodeApi(["test-task:fast a", "test-task:fastError"], { printSummaryTable: true, stdout })],
        ["npm-run-all", async () => runAll(["--print-summary-table", "test-task:fast a", "test-task:fastError"], stdout)],
        ["run-p", async () => runPar(["--print-summary-table", "test-task:fast a", "test-task:fastError"], stdout)],
        ["run-s", async () => runSeq(["--print-summary-table", "test-task:fast a", "test-task:fastError"], stdout)],
      ]

      function assertSummaryRows() {
        assert(stdout.value.includes("Summary"))
        const rowSuccess = getTableRaw(stdout.value, "test-task:fast a")
        assert(rowSuccess.includes("0"))
        const rowFail = getTableRaw(stdout.value, "test-task:fastError")
        assert(rowFail.includes("1"))
      }

      runners.forEach(([name, runFn]) => {
        it(name, async () => {
          try {
            await runFn()
          } catch (_) {}
          assertSummaryRows()
        })
      })
    })

    describe("aligns columns correctly for mixed-length task names", () => {
      const runners = [
        ["Node API", async () => nodeApi(["test-task:fast a", "test-task:fastError"], { printSummaryTable: true, stdout })],
        ["npm-run-all command", async () => runAll(["test-task:fast a", "test-task:fastError", "--print-summary-table"], stdout)],
        ["run-p command", async () => runPar(["test-task:fast a", "test-task:fastError", "--print-summary-table"], stdout)],
        ["run-s command", async () => runSeq(["test-task:fast a", "test-task:fastError", "--print-summary-table"], stdout)],
      ]

      const stripAnsi = (str) => str.replace(/\u001b\[[0-9;]*m/g, "")
      function assertAlign() {
        const lines = stdout.value
          .split("\n")
          .filter((l) => l)
          .map(stripAnsi)
        const headerCols = lines
          .find((l) => l.includes("Task") && l.includes("FinalExitCode"))
          .split("|")
          .slice(1, -1)
        lines
          .filter((l) => /test-task:fast|longName/.test(l))
          .forEach((line) => {
            const cols = line.split("|").slice(1, -1)
            cols.forEach((cell, i) => {
              assert.strictEqual(cell.length, headerCols[i].length)
            })
          })
      }

      runners.forEach(([name, runFn]) => {
        it(name, async () => {
          try {
            await runFn()
          } catch (_) {}
          assertAlign()
        })
      })
    })
  })

  describe("[print-summary + retries + parallel]", () => {
    describe("should print summary table after parallel execution (succeed):", () => {
      const retries = 1

      const runners = [
        [
          "Node API",
          async () => nodeApi(["test-task:fast a", "test-task:fast b"], { retries: retries, parallel: true, printSummaryTable: true, stdout }),
        ],
        [
          "npm-run-all command",
          async () => runAll(["--print-summary-table", "--retries", retries, "--parallel", "test-task:fast a", "test-task:fast b"], stdout),
        ],
        ["run-p command", async () => runPar(["--print-summary-table", "--retries", retries, "test-task:fast a", "test-task:fast b"], stdout)],
      ]

      function assertParallelSuccess() {
        const [, taskName1, exitCode1, retries1] = getTableRawElements(stdout.value, "test-task:fast a")
        const [, taskName2, exitCode2, retries2] = getTableRawElements(stdout.value, "test-task:fast b")

        assert.strictEqual(exitCode1, "0")
        assert.strictEqual(exitCode2, "0")
        assert.strictEqual(taskName1, "test-task:fast a")
        assert.strictEqual(taskName2, "test-task:fast b")
        assert.strictEqual(retries1, "0")
        assert.strictEqual(retries2, "0")
      }

      runners.forEach(([name, runFn]) => {
        it(name, async () => {
          await runFn()
          assertParallelSuccess()
        })
      })
    })

    describe("should print summary table after parallel execution (flaky + fail):", () => {
      const retries = 4
      const threshold = 2

      const runners = [
        [
          "Node API",
          async () =>
            nodeApi([`test-task:flaky ${threshold}`, "test-task:append1Error b"], {
              retries: retries,
              parallel: true,
              printSummaryTable: true,
              stdout,
            }),
        ],
        [
          "npm-run-all command",
          async () =>
            runAll(["--print-summary-table", "--retries", retries, "--parallel", `test-task:flaky ${threshold}`, "test-task:append1Error b"], stdout),
        ],
        [
          "run-p command",
          async () => runPar(["--print-summary-table", "--retries", retries, `test-task:flaky ${threshold}`, "test-task:append1Error b"], stdout),
        ],
      ]

      function assertFlakyFail() {
        const [open1, task1, exit1, retries1, duration1, close1] = getTableRawElements(stdout.value, `test-task:flaky ${threshold}`)
        const [open2, task2, exit2, retries2, duration2, close2] = getTableRawElements(stdout.value, "test-task:append1Error b")

        assert.strictEqual(exit1, "137 (Killed)")
        assert.strictEqual(exit2, "1")
        assert.strictEqual(task1, `test-task:flaky ${threshold}`)
        assert.strictEqual(task2, "test-task:append1Error b")
        assert.strictEqual(retries2, `${retries}`)
      }

      runners.forEach(([name, runFn]) => {
        it(name, async () => {
          try {
            await runFn()
          } catch (_) {
            assertFlakyFail()
          }
        })
      })
    })

    describe("should print summary table after parallel execution (flaky + succeed):", () => {
      const retries = 4
      const threshold = 2

      const runners = [
        [
          "Node API",
          async () =>
            nodeApi([`test-task:flaky ${threshold}`, "test-task:fast b"], { retries: retries, parallel: true, printSummaryTable: true, stdout }),
        ],
        [
          "npm-run-all command",
          async () =>
            runAll(["--print-summary-table", "--retries", retries, "--parallel", `test-task:flaky ${threshold}`, "test-task:fast b"], stdout),
        ],
        [
          "run-p command",
          async () => runPar(["--print-summary-table", "--retries", retries, `test-task:flaky ${threshold}`, "test-task:fast b"], stdout),
        ],
      ]

      function assertFlakySucceed() {
        const [, task1, exit1, retries1] = getTableRawElements(stdout.value, `test-task:flaky ${threshold}`)
        const [, task2, exit2, retries2] = getTableRawElements(stdout.value, "test-task:fast b")

        assert.strictEqual(exit1, "0")
        assert.strictEqual(exit2, "0")
        assert.strictEqual(task1, `test-task:flaky ${threshold}`)
        assert.strictEqual(task2, "test-task:fast b")
        assert.strictEqual(retries1, `${threshold}`)
        assert.strictEqual(retries2, "0")
      }

      runners.forEach(([name, runFn]) => {
        it(name, async () => {
          await runFn()
          assertFlakySucceed()
        })
      })
    })

    describe("should print summary table after execution with jobs limit (succeed):", () => {
      const retries = 4
      const threshold = 1
      const jobs = 2

      const runners = [
        [
          "Node API",
          async () => {
            await nodeApi([`test-task:flaky ${threshold}`, "test-task:fast a", "test-task:fast a"], {
              retries: retries,
              parallel: true,
              jobs,
              printSummaryTable: true,
              stdout,
            })
          },
        ],
        [
          "npm-run-all command",
          async () => {
            await runAll(
              [
                "--print-summary-table",
                "--retries",
                retries,
                "--parallel",
                "--jobs",
                jobs,
                `test-task:flaky ${threshold}`,
                "test-task:fast a",
                "test-task:fast a",
              ],
              stdout
            )
          },
        ],
        [
          "run-p command",
          async () => {
            await runPar(
              ["--print-summary-table", "--retries", retries, "--jobs", jobs, `test-task:flaky ${threshold}`, "test-task:fast a", "test-task:fast a"],
              stdout
            )
          },
        ],
      ]

      function assertjobsSucceed() {
        const [, task1, exit1, retries1] = getTableRawElements(stdout.value, `test-task:flaky ${threshold}`)
        const [, task2, exit2, retries2] = getTableRawElements(stdout.value, "test-task:fast a")
        const [, task3, exit3, retries3] = getTableRawElements(stdout.value, "test-task:fast a")

        assert.strictEqual(exit1, "0")
        assert.strictEqual(exit2, "0")
        assert.strictEqual(exit3, "0")
        assert.strictEqual(task1, `test-task:flaky ${threshold}`)
        assert.strictEqual(task2, "test-task:fast a")
        assert.strictEqual(task3, "test-task:fast a")
        assert.strictEqual(retries1, `${threshold}`)
        assert.strictEqual(retries2, "0")
        assert.strictEqual(retries3, "0")
      }

      runners.forEach(([name, runFn]) => {
        it(name, async () => {
          await runFn()
          assertjobsSucceed()
        })
      })
    })

    describe("should print summary table after execution with jobs limit (fail):", () => {
      const retries = 3
      const threshold = 1
      const jobs = 2

      const runners = [
        [
          "Node API",
          async () => {
            try {
              await nodeApi(
                [
                  "test-task:fastError",
                  `test-task:flaky ${threshold}`,
                  "test-task:fast a",
                  "test-task:removeResult",
                  `test-task:flaky ${threshold + 1}`,
                ],
                {
                  retries: retries,
                  parallel: true,
                  jobs: jobs,
                  printSummaryTable: true,
                  continueOnError: true,
                  stdout,
                }
              )
            } catch (_) {
              /* ignore */
            }
          },
        ],
        [
          "npm-run-all command",
          async () => {
            try {
              await runAll(
                [
                  "--print-summary-table",
                  "--retries",
                  retries,
                  "--parallel",
                  "--jobs",
                  jobs,
                  "--continue-on-error",
                  "test-task:fastError",
                  `test-task:flaky ${threshold}`,
                  "test-task:fast a",
                  "test-task:removeResult",
                  `test-task:flaky ${threshold + 1}`,
                ],
                stdout
              )
            } catch (_) {
              /* ignore */
            }
          },
        ],
        [
          "run-p command",
          async () => {
            try {
              await runPar(
                [
                  "--print-summary-table",
                  "--retries",
                  retries,
                  "--jobs",
                  jobs,
                  "--continue-on-error",
                  "test-task:fastError",
                  `test-task:flaky ${threshold}`,
                  "test-task:fast a",
                  "test-task:removeResult",
                  `test-task:flaky ${threshold + 1}`,
                ],
                stdout
              )
            } catch (_) {
              /* ignore */
            }
          },
        ],
      ]

      function assertjobsFail() {
        const [, t1, e1, r1] = getTableRawElements(stdout.value, "test-task:fastError")
        const [, t2, e2, r2] = getTableRawElements(stdout.value, `test-task:flaky ${threshold}`)
        const [, t3, e3, r3] = getTableRawElements(stdout.value, "test-task:fast a")
        const [, t4, e4, r4] = getTableRawElements(stdout.value, "test-task:removeResult")
        const [, t5, e5, r5] = getTableRawElements(stdout.value, `test-task:flaky ${threshold + 1}`)

        assert.strictEqual(t1, "test-task:fastError")
        assert.strictEqual(t2, `test-task:flaky ${threshold}`)
        assert.strictEqual(t3, "test-task:fast a")
        assert.strictEqual(t4, "test-task:removeResult")
        assert.strictEqual(t5, `test-task:flaky ${threshold + 1}`)

        assert.strictEqual(e1, "1")
        assert.strictEqual(e2, "0")
        assert.strictEqual(e3, "0")
        assert.strictEqual(e4, "0")
        assert.strictEqual(e5, "0")

        assert.strictEqual(r1, `${retries}`)
        assert.strictEqual(r2, `${threshold}`)
        assert.strictEqual(r3, "0")
        assert.strictEqual(r4, "0")
        assert.strictEqual(r5, `${threshold + 1}`)
      }

      runners.forEach(([name, runFn]) => {
        it(name, async () => {
          await runFn()
          assertjobsFail()
        })
      })
    })
  })
  describe("should print summary table correctly when running in parallel", () => {
    it("Node API", async () => {
      await nodeApi(["test-task:append a", "test-task:append b"], { parallel: 2, printSummaryTable: true, stdout })
      const [, taskName1, exitCode1, retries1] = getTableRawElements(stdout.value, "test-task:append a")
      const [, taskName2, exitCode2, retries2] = getTableRawElements(stdout.value, "test-task:append b")
      assert.strictEqual(taskName1, "test-task:append a")
      assert.strictEqual(exitCode1, "0")
      assert.strictEqual(retries1, "0")
      assert.strictEqual(taskName2, "test-task:append b")
      assert.strictEqual(exitCode2, "0")
      assert.strictEqual(retries2, "0")
    })
  })
  describe("should print summary table correctly when running in sequential", () => {
    it("Node API", async () => {
      await nodeApi(["test-task:append a", "test-task:append b"], { singleMode: true, printSummaryTable: true, stdout })
      const [, taskName1, exitCode1, retries1] = getTableRawElements(stdout.value, "test-task:append a")
      const [, taskName2, exitCode2, retries2] = getTableRawElements(stdout.value, "test-task:append b")
      assert.strictEqual(taskName1, "test-task:append a")
      assert.strictEqual(exitCode1, "0")
      assert.strictEqual(retries1, "0")
      assert.strictEqual(taskName2, "test-task:append b")
      assert.strictEqual(exitCode2, "0")
      assert.strictEqual(retries2, "0")
    })
  })
})
