/**
 * @author Alec Mestroni (2025)
 * @copyright 2025 Alec Mestroni.
 * @license MIT
 *
 * Unit tests for the matchTasks module — verifies all minimatch glob patterns
 * documented in the cheat sheet (docs/npm-run-all.md).
 */
"use strict"

const assert = require("assert")
const matchTasks = require("../lib/match-tasks")

/**
 * Helper: extract matched task names from matchTasks result.
 * @param {string[]} taskList - Available tasks.
 * @param {string[]} patterns - Patterns to match.
 * @returns {string[]} Matched task names.
 */
function matched(taskList, patterns) {
  return matchTasks(taskList, patterns).map((t) => t.name)
}

// A realistic task list that covers all cheat sheet scenarios.
const TASKS = [
  "test",
  "test:unit",
  "test:e2e",
  "test:ci",
  "test:api",
  "test:watch",
  "test:",
  "test:unit:api",
  "test:unit:db",
  "test:e2e:smoke",
  "test:ai:process",
  "test:top:process",
  "test:perf:api",
  "lint",
  "build",
  "build:lib",
  "build:docs",
]

describe("[match-tasks] minimatch pattern cheat sheet", () => {
  // ── 1. Exact match ────────────────────────────────────────────────────
  describe("exact task name", () => {
    it('"test" matches "test" (and "test:" which is minimatch equivalent)', () => {
      const result = matched(TASKS, ["test"])
      assert.ok(result.includes("test"))
      assert.ok(!result.includes("test:unit"))
    })

    it('"lint" matches only "lint"', () => {
      const result = matched(TASKS, ["lint"])
      assert.deepStrictEqual(result, ["lint"])
    })
  })

  // ── 2. Single-segment wildcard (*) ────────────────────────────────────
  describe("single-segment wildcard: test:*", () => {
    it("matches one segment after test:", () => {
      const result = matched(TASKS, ["test:*"])
      assert.ok(result.includes("test:unit"))
      assert.ok(result.includes("test:e2e"))
      assert.ok(result.includes("test:ci"))
    })

    it("does not cross : boundaries", () => {
      const result = matched(TASKS, ["test:*"])
      assert.ok(!result.includes("test:unit:api"))
      assert.ok(!result.includes("test:e2e:smoke"))
      assert.ok(!result.includes("test"))
    })
  })

  // ── 3. Globstar (**) ──────────────────────────────────────────────────
  describe("globstar: test:**", () => {
    it("matches any depth after test:", () => {
      const result = matched(TASKS, ["test:**"])
      assert.ok(result.includes("test:unit"))
      assert.ok(result.includes("test:unit:api"))
      assert.ok(result.includes("test:e2e:smoke"))
      assert.ok(result.includes("test:ai:process"))
    })

    it("does not match unrelated tasks", () => {
      const result = matched(TASKS, ["test:**"])
      assert.ok(!result.includes("lint"))
      assert.ok(!result.includes("build"))
    })

    it("also matches the immediate level (trailing ** fix)", () => {
      const result = matched(TASKS, ["test:**"])
      assert.ok(result.includes("test:unit"), "should match test:unit (one level)")
      assert.ok(result.includes("test:unit:api"), "should match test:unit:api (two levels)")
    })
  })

  // ── 4. Character wildcard (??) ────────────────────────────────────────
  describe("character wildcard: test:??", () => {
    it("matches exactly two characters in that segment", () => {
      const result = matched(TASKS, ["test:??"])
      assert.ok(result.includes("test:ci"))
      assert.ok(result.includes("test:e2e") === false, "e2e is 3 chars, should not match")
    })
  })

  // ── 5. Brace expansion ────────────────────────────────────────────────
  describe("brace expansion: test:{unit,e2e}", () => {
    it("matches listed values", () => {
      const result = matched(TASKS, ["test:{unit,e2e}"])
      assert.deepStrictEqual(result.sort(), ["test:e2e", "test:unit"])
    })

    it("does not match other values", () => {
      const result = matched(TASKS, ["test:{unit,e2e}"])
      assert.ok(!result.includes("test:api"))
      assert.ok(!result.includes("test:ci"))
    })
  })

  // ── 6. Brace + globstar ───────────────────────────────────────────────
  describe("brace + globstar: test:{unit,e2e}:**", () => {
    it("matches nested tasks under listed prefixes", () => {
      const result = matched(TASKS, ["test:{unit,e2e}:**"])
      assert.ok(result.includes("test:unit"))
      assert.ok(result.includes("test:unit:api"))
      assert.ok(result.includes("test:unit:db"))
      assert.ok(result.includes("test:e2e"))
      assert.ok(result.includes("test:e2e:smoke"))
    })

    it("does not match other prefixes", () => {
      const result = matched(TASKS, ["test:{unit,e2e}:**"])
      assert.ok(!result.includes("test:perf:api"))
      assert.ok(!result.includes("test:ai:process"))
    })
  })

  // ── 7. Extglob negation: !(ai) ───────────────────────────────────────
  describe("extglob negation: test:!(ai):**", () => {
    it("matches any segment except ai", () => {
      const result = matched(TASKS, ["test:!(ai):**"])
      assert.ok(result.includes("test:top:process"))
      assert.ok(result.includes("test:unit"))
      assert.ok(result.includes("test:unit:api"))
    })

    it("excludes ai segment", () => {
      const result = matched(TASKS, ["test:!(ai):**"])
      assert.ok(!result.includes("test:ai:process"))
    })

    it("works when only excluded tasks exist (throws not found)", () => {
      const aiOnly = ["test:ai:llm", "test:ai:vision"]
      assert.throws(() => matchTasks(aiOnly, ["test:!(ai):**"]), /not found/i)
    })
  })

  // ── 8. Extglob one-or-more: +(unit|e2e) ───────────────────────────────
  describe("extglob one-or-more: test:+(unit|e2e)", () => {
    it("matches one of the alternatives", () => {
      const result = matched(TASKS, ["test:+(unit|e2e)"])
      assert.ok(result.includes("test:unit"))
      assert.ok(result.includes("test:e2e"))
    })

    it("does not match other values", () => {
      const result = matched(TASKS, ["test:+(unit|e2e)"])
      assert.ok(!result.includes("test:api"))
    })
  })

  // ── 9. Extglob exactly-one: @(unit|e2e) ──────────────────────────────
  describe("extglob exactly-one: test:@(unit|e2e)", () => {
    it("matches exactly one of the alternatives", () => {
      const result = matched(TASKS, ["test:@(unit|e2e)"])
      assert.ok(result.includes("test:unit"))
      assert.ok(result.includes("test:e2e"))
    })

    it("does not match other values", () => {
      const result = matched(TASKS, ["test:@(unit|e2e)"])
      assert.ok(!result.includes("test:api"))
    })
  })

  // ── 10. Extglob optional: ?(watch) ────────────────────────────────────
  describe("extglob optional: test:?(watch)", () => {
    it('matches "test:watch"', () => {
      const result = matched(TASKS, ["test:?(watch)"])
      assert.ok(result.includes("test:watch"))
    })

    it('matches "test:" (empty segment)', () => {
      const result = matched(TASKS, ["test:?(watch)"])
      assert.ok(result.includes("test:"))
    })

    it('does not match "test:build"', () => {
      const result = matched(TASKS, ["test:?(watch)"])
      assert.ok(!result.includes("test:build"))
    })
  })

  // ── Additional edge cases ─────────────────────────────────────────────
  describe("edge cases", () => {
    it("nonegate: leading ! is treated literally", () => {
      const tasks = ["!test", "test"]
      const result = matched(tasks, ["!test"])
      assert.deepStrictEqual(result, ["!test"])
    })

    it("multiple patterns combine results in order", () => {
      const result = matched(TASKS, ["lint", "build:*"])
      assert.deepStrictEqual(result, ["lint", "build:lib", "build:docs"])
    })

    it("duplicates are removed across patterns", () => {
      const result = matched(TASKS, ["test:unit", "test:*"])
      // test:unit only appears once (from first pattern), rest from test:*
      const unitCount = result.filter((n) => n === "test:unit").length
      assert.strictEqual(unitCount, 1)
    })

    it("throws when no task matches", () => {
      assert.throws(() => matchTasks(TASKS, ["nonexistent"]), /not found/i)
    })

    it("** in the middle matches zero or more segments", () => {
      const tasks = ["a:b", "a:x:b", "a:x:y:b"]
      const result = matched(tasks, ["a:**:b"])
      assert.ok(result.includes("a:b"))
      assert.ok(result.includes("a:x:b"))
      assert.ok(result.includes("a:x:y:b"))
    })

    it("trailing ** matches the parent level itself", () => {
      // This is the key fix: test:unit should match test:**
      const tasks = ["test:unit", "test:unit:api"]
      const result = matched(tasks, ["test:**"])
      assert.ok(result.includes("test:unit"), "should match immediate child")
      assert.ok(result.includes("test:unit:api"), "should match deeper child")
    })

    it("arguments are preserved with glob patterns", () => {
      const tasks = ["test:unit", "test:e2e"]
      const result = matchTasks(tasks, ["test:* --verbose"])
      assert.deepStrictEqual(result, [
        { name: "test:unit --verbose" },
        { name: "test:e2e --verbose" },
      ])
    })
  })
})
