/**
 * @fileretries.test.js
 * @author Alec Mestroni
 * @copyright 2025 Alec Mestroni.
 * @license MIT
 *
 * Tests for the --retry N option. This flag makes a failing task be retried
 * up to N times before giving up.
 */

'use strict'

const assert = require('assert')
const nodeApi = require('../lib')
const spawnWithKill = require('./lib/spawn-with-kill')
const util = require('./lib/util')

const delay = util.delay
const result = util.result
const removeResult = util.removeResult
const runAll = util.runAll
const runPar = util.runPar
const runSeq = util.runSeq

describe.only('[retry]', () => {
  before(() => process.chdir('test-workspace'))
  after(() => process.chdir('..'))

  // Clean up workspace before each test
  beforeEach(() => delay(1000).then(removeResult))

  describe('should not retries when task succeeds on first attempt', () => {
    const retries = 3
    it('Node API', async () => {
      // even withretries:3, a successful task runs only once
      const results = await nodeApi(['test-task:append1 a'], { retry: retries })
      assert.strictEqual(results.length, 1)
      assert.strictEqual(results[0].name, 'test-task:append1 a')
      assert.strictEqual(results[0].code, 0)
      assert.strictEqual(result(), 'a')
    })

    it('npm-run-all command', async () => {
      await runAll(['--retry', retries, 'test-task:append1 a'])
      assert.strictEqual(result(), 'a')
    })

    it('run-p command', async () => {
      await runPar(['--retry', retries, 'test-task:append1 a'])
      assert.strictEqual(result(), 'a')
    })
  })

  describe('should retries a task up to N times before giving up', () => {
    const retries = 5
    it('Node API', async () => {
      try {
        await nodeApi([`test-task:append1Error a`], { retry: retries })
      } catch (err) {
        assert.strictEqual(err.results.length, 1)
        assert.strictEqual(err.results[0].name, 'test-task:append1Error a')
        assert.strictEqual(err.results[0].code, 1)
        assert.strictEqual(err.results[0].retries, retries)
        assert.strictEqual(result().length, retries + 1)
        return
      }
      assert.fail('Expected task to fail after retries')
    })

    it('npm-run-all command', async () => {
      try {
        await runAll(['--retry', retries, `test-task:append1Error a`])
      } catch (err) {
        assert.strictEqual(result().length, retries + 1)
        return
      }
      assert.fail('Expected command to fail after retries')
    })
    it('npm-p command', async () => {
      try {
        await runPar(['--retry', retries, `test-task:append1Error a`])
      } catch (err) {
        assert.strictEqual(result().length, retries + 1)
        return
      }
      assert.fail('Expected command to fail after retries')
    })
    it('run-s command', async () => {
      try {
        await runSeq(['--retry', retries, `test-task:append1Error a`])
      } catch (err) {
        assert.strictEqual(result().length, retries + 1)
        return
      }
      assert.fail('Expected command to fail after retries')
    })
  })

  describe('should eventually succeed if failures < retry count', () => {
    it('Node API', async () => {
      const threshold = 1
      const results = await nodeApi([`test-task:flaky ${threshold}`], { retry: 4 })
      assert.strictEqual(results[0].code, 0)
      assert.strictEqual(results[0].retries, threshold)
      assert.strictEqual(result().length, threshold + 1)
    })

    it('npm-run-all command', async () => {
      const threshold = 2
      await runAll(['--retry', '3', `test-task:flaky ${threshold}`])
      assert.strictEqual(result().length, threshold + 1)
    })

    it('run-p command', async () => {
      const threshold = 3
      await runPar(['--retry', '3', `test-task:flaky ${threshold}`])
      assert.strictEqual(result().length, threshold + 1)
    })

    it('run-s command', async () => {
      const threshold = 3
      await runSeq(['--retry', '3', `test-task:flaky ${threshold}`])
      assert.strictEqual(result().length, threshold + 1)
    })
  })

  describe('should combine retries with parallel execution (succeed)', () => {
    const retries = 1
    it('Node API', async () => {
      const results = await nodeApi([`test-task:append1 a`, `test-task:append1 b`], { retry: retries, parallel: true })
      assert.strictEqual(results[0].code, 0)
      assert.strictEqual(results[1].code, 0)
      assert.strictEqual(results[0].name, 'test-task:append1 a')
      assert.strictEqual(results[1].name, 'test-task:append1 b')
      assert.strictEqual(results[0].retries, 0)
      assert.strictEqual(results[1].retries, 0)
      assert.ok(['a', 'ab', 'ba'].includes(result()), `Expected result to be one of "a", "ab", "ba" but got "${result()}"`)
    })

    it('npm-run-all command', async () => {
      await runAll(['--retry', retries, '--parallel', `test-task:append1 a`, `test-task:append1 b`])
      assert.ok(['a', 'ab', 'ba'].includes(result()), `Expected result to be one of "a", "ab", "ba" but got "${result()}"`)
    })

    it('run-p command', async () => {
      await runPar(['--retry', retries, `test-task:append1 a`, `test-task:append1 b`])
      assert.ok(['a', 'ab', 'ba'].includes(result()), `Expected result to be one of "a", "ab", "ba" but got "${result()}"`)
    })
  })

  describe('should combine retries with parallel execution (flaky + fail)', () => {
    const retries = 4
    const threshold = 2
    it('Node API', async () => {
      try {
        await nodeApi([`test-task:flaky ${threshold}`, `test-task:append1Error b`], { retry: retries, parallel: true })
      } catch (err) {
        assert.strictEqual(err.results.length, 2)
        assert.strictEqual(err.results[0].name, `test-task:flaky ${threshold}`)
        assert.strictEqual(err.results[1].name, 'test-task:append1Error b')
        assert.ok(
          err.results[0].code === 130 && err.results[1].code === 1,
          'First task should be aborted, and second one failed. (1: ' + err.results[0].code + ', 2: ' + err.results[1].code + ')'
        )
        assert.strictEqual(err.results[0].retries, retries)
        assert.strictEqual(err.results[1].retries, retries)
        await delay(3000)
        assert.strictEqual((result().match(/b/g) || []).length, retries + 1)
        assert((result().match(/f/g) || []).length <= retries)
      }
    })

    it('npm-run-all command', async () => {
      try {
        await runAll(['--retry', retries, '--parallel', `test-task:flaky ${threshold}`, `test-task:append1Error b`])
      } catch (err) {
        await delay(3000)
        assert.strictEqual((result().match(/b/g) || []).length, retries + 1)
        assert((result().match(/f/g) || []).length <= retries)
      }
    })

    it('run-p command', async () => {
      try {
        await runPar(['--retry', retries, `test-task:flaky ${threshold}`, `test-task:append1Error b`])
      } catch (err) {
        await delay(3000)
        assert.strictEqual((result().match(/b/g) || []).length, retries + 1)
        assert((result().match(/f/g) || []).length <= retries)
      }
    })
  })

  describe.only('should combine retries with parallel execution (flaky + succeed)', () => {
    const retries = 4
    const threshold = 3
    it('Node API', async () => {
      const results = await nodeApi([`test-task:flaky ${threshold}`, `test-task:append1 b`], { retry: retries, parallel: true })
      assert.strictEqual(results[0].code, 0)
      assert.strictEqual(results[1].code, 0)
      assert.strictEqual(results[0].name, `test-task:flaky ${threshold}`)
      assert.strictEqual(results[1].name, 'test-task:append1 b')
      assert.strictEqual(results[0].retries, 1)
      assert.strictEqual(results[1].retries, 0)
      assert.ok(['a', 'ab', 'ba'].includes(result()), `Expected result to be one of "a", "ab", "ba" but got "${result()}"`)
    })

    it('npm-run-all command', async () => {
      await runAll(['--retry', retries, '--parallel', `test-task:flaky ${threshold}`, `test-task:append1 b`])
      assert.ok(['a', 'ab', 'ba'].includes(result()), `Expected result to be one of "a", "ab", "ba" but got "${result()}"`)
    })

    it('run-p command', async () => {
      await runPar(['--retry', retries, `test-task:flaky ${threshold}`, `test-task:append1 b`])
      assert.ok(['a', 'ab', 'ba'].includes(result()), `Expected result to be one of "a", "ab", "ba" but got "${result()}"`)
    })
  })

  describe('should combine retries with parallel execution (abort)', () => {
    const retries = 1
    it('Node API', async () => {
      try {
        await nodeApi([`test-task:append1Error a`, `test-task:append2Error b`], { retry: retries, parallel: true })
      } catch (err) {
        assert.strictEqual(err.results.length, 2)
        assert.strictEqual(err.results[0].name, 'test-task:append1Error a')
        assert.strictEqual(err.results[1].name, 'test-task:append2Error b')
        assert.ok(
          (err.results[0].code === 1 && err.results[1].code === 130) || (err.results[0].code === 130 && err.results[1].code === 1),
          'One of the tasks should have failed, and the other should have been aborted. (1: ' +
            err.results[0].code +
            ', 2: ' +
            err.results[1].code +
            ')'
        )
        assert.strictEqual(err.results[0].retries, retries)
        assert.strictEqual(err.results[1].retries, retries)
        assert.ok(
          ['abab', 'baba', 'abba', 'baab'].includes(result()),
          `Expected result to be one of "abab", "baba", "abba", "baab" but got "${result()}"`
        )
        return
      }
      assert.fail('Expected task to fail after retries')
    })

    it('npm-run-all command', async () => {
      try {
        await runAll(['--retry', retries, '--parallel', `test-task:append1Error a`, `test-task:append1Error b`])
      } catch (err) {
        await delay(3000)
        assert.ok(
          ['abab', 'baba', 'abba', 'baab'].includes(result()),
          `Expected result to be one of "abab", "baba", "abba", "baab" but got "${result()}"`
        )
        return
      }
      assert.fail('Expected command to fail after retries')
    })
    it('npm-p command', async () => {
      try {
        await runPar(['--retry', retries, `test-task:append1Error a`, `test-task:append1Error b`])
      } catch (err) {
        await delay(3000)
        assert.ok(
          ['abab', 'baba', 'abba', 'baab'].includes(result()),
          `Expected result to be one of "abab", "baba", "abba", "baab" but got "${result()}"`
        )
        return
      }
      assert.fail('Expected command to fail after retries')
    })
  })

  describe('should combine retries with sequential execution', () => {
    const retries = 1
    it('Node API', async () => {
      try {
        await nodeApi([`test-task:append1Error a`, `test-task:append1Error b`], { retry: retries, parallel: true })
      } catch (err) {
        assert.strictEqual(err.results.length, 2)
        assert.strictEqual(err.results[0].name, 'test-task:append1Error a')
        assert.strictEqual(err.results[1].name, 'test-task:append1Error b')
        assert.ok(
          (err.results[0].code === 1 && err.results[1].code === 130) || (err.results[0].code === 130 && err.results[1].code === 1),
          'One of the tasks should have failed, and the other should have been aborted'
        )
        assert.strictEqual(err.results[0].retries, retries)
        assert.strictEqual(err.results[1].retries, retries)
        await delay(3000)
        assert.ok(
          ['abab', 'baba', 'abba', 'baab'].includes(result()),
          `Expected result to be one of "abab", "baba", "abba", "baab" but got "${result()}"`
        )
        return
      }
      assert.fail('Expected task to fail after retries')
    })

    it('npm-run-all command', async () => {
      try {
        await runAll(['--retry', retries, '--parallel', `test-task:append1Error a`, `test-task:append1Error b`])
      } catch (err) {
        await delay(3000)
        assert.ok(
          ['abab', 'baba', 'abba', 'baab'].includes(result()),
          `Expected result to be one of "abab", "baba", "abba", "baab" but got "${result()}"`
        )
        return
      }
      assert.fail('Expected command to fail after retries')
    })
    it('npm-p command', async () => {
      try {
        await runPar(['--retry', retries, `test-task:append1Error a`, `test-task:append1Error b`])
      } catch (err) {
        await delay(3000)
        assert.ok(
          ['abab', 'baba', 'abba', 'baab'].includes(result()),
          `Expected result to be one of "abab", "baba", "abba", "baab" but got "${result()}"`
        )
        return
      }
      assert.fail('Expected command to fail after retries')
    })
  })

  describe('should error on invalid retry count', () => {
    it('npm-run-all command', async () => {
      try {
        await runAll(['--retry', '-1', 'test-task:append1 a'])
      } catch (err) {
        assert.ok(/ERROR: Invalid Option: --retry/i.test(err.message))
        return
      }
      assert.fail('Expected an error about invalid retry count')
    })
    it('npm-run-all command', async () => {
      try {
        await runAll(['--retry', -1, 'test-task:append1 a'])
      } catch (err) {
        assert.ok(/ERROR: Invalid Option: --retry/i.test(err.message))
        return
      }
      assert.fail('Expected an error about invalid retry count')
    })
    it('npm-run-all command', async () => {
      try {
        await runAll(['--retry', 'a', 'test-task:append1 a'])
      } catch (err) {
        assert.ok(/ERROR: Invalid Option: --retry/i.test(err.message))
        return
      }
      assert.fail('Expected an error about invalid retry count')
    })
    it('npm-run-all command', async () => {
      try {
        await runAll(['--retry', 0, 'test-task:append1 a'])
      } catch (err) {
        assert.ok(/ERROR: Invalid Option: --retry/i.test(err.message))
        return
      }
      assert.fail('Expected an error about invalid retry count')
    })
    it('npm-run-all command', async () => {
      try {
        await runAll(['--retry', '0', 'test-task:append1 a'])
      } catch (err) {
        assert.ok(/ERROR: Invalid Option: --retry/i.test(err.message))
        return
      }
      assert.fail('Expected an error about invalid retry count')
    })
  })

  describe('should kill child processes when killed during retries', () => {
    it('npm-run-all command', async () => {
      // spawn a long-running failing task with retries, then kill
      await spawnWithKill('node', ['../bin/npm-run-all/index.js', '--retry', '5', 'test-task:append2 a'])
      // should not leave behind partial writes
      assert.ok(result() === null || result() === 'a')
    })

    it('run-p command', async () => {
      await spawnWithKill('node', ['../bin/run-p/index.js', '--retry', '5', 'test-task:append2 a'])
      assert.ok(result() === null || result() === 'a')
    })
  })
})
