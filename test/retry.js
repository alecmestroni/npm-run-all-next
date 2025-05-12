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
const BufferStream = require('./lib/buffer-stream')
const spawnWithKill = require('./lib/spawn-with-kill')
const util = require('./lib/util')

const delay = util.delay
const result = util.result
const removeResult = util.removeResult
const runAll = util.runAll
const runPar = util.runPar
const runSeq = util.runSeq

/**
 * create expected text
 * @param {string} term  the term to use when creating a line
 * @returns {string} the complete line
 */
function createExpectedOutput(term, times = 1) {
  return new Array(times).fill(`[${term}]__[${term}]`)
}

describe('[retry] npm-run-all', () => {
  before(() => process.chdir('test-workspace'))
  after(() => process.chdir('..'))

  // Clean up workspace before each test
  beforeEach(() => removeResult())
  describe('[retry]', () => {
    describe('should not retries when task succeeds on first attempt:', () => {
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

    describe('should retries a task up to N times before giving up:', () => {
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

    describe('should eventually succeed if failures < retry count:', () => {
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

    describe('should error on invalid retry count:', () => {
      it('Node API', async () => {
        try {
          await nodeApi(['test-task:append a', 'test-task:append b', 'test-task:append c'], { parallel: true, retry: 'a' })
        } catch (err) {
          assert.ok(/Invalid options.retry/i.test(err.message))
        }
      })
      it("npm-run-all command --retry '-1'", async () => {
        try {
          await runAll(['--retry', '-1', 'test-task:append1 a'])
        } catch (err) {
          assert.ok(/ERROR: Invalid Option: --retry/i.test(err.message))
          return
        }
        assert.fail('Expected an error about invalid retry count')
      })
      it('npm-run-all command --retry -1', async () => {
        try {
          await runAll(['--retry', -1, 'test-task:append1 a'])
        } catch (err) {
          assert.ok(/ERROR: Invalid Option: --retry/i.test(err.message))
          return
        }
        assert.fail('Expected an error about invalid retry count')
      })
      it('npm-run-all command --retry a', async () => {
        try {
          await runAll(['--retry', 'a', 'test-task:append1 a'])
        } catch (err) {
          assert.ok(/ERROR: Invalid Option: --retry/i.test(err.message))
          return
        }
        assert.fail('Expected an error about invalid retry count')
      })
      it('npm-run-all command --retry 0', async () => {
        try {
          await runAll(['--retry', 0, 'test-task:append1 a'])
        } catch (err) {
          assert.ok(/ERROR: Invalid Option: --retry/i.test(err.message))
          return
        }
        assert.fail('Expected an error about invalid retry count')
      })
    })

    describe('should kill child processes when killed during retries:', () => {
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

  describe('[retry + race]', () => {
    describe('should combine retries with race execution (flaky + succeed):', () => {
      const retries = 4
      const threshold = 2
      it('Node API', async () => {
        const results = await nodeApi([`test-task:flaky ${threshold}`, `test-task:append1 b`], { retry: retries, parallel: true, race: true })
        assert.strictEqual(results[0].code, 130)
        assert.strictEqual(results[1].code, 0)
        assert.strictEqual(results[0].name, `test-task:flaky ${threshold}`)
        assert.strictEqual(results[1].name, 'test-task:append1 b')
        assert.strictEqual(results[0].retries, 0)
        assert.strictEqual(results[1].retries, 0)
        assert.ok(['fb', 'bf'].includes(result()), `Expected result to be one of 'fb', 'bf' but got "${result()}"`)
      })

      it('npm-run-all command', async () => {
        await runAll(['--retry', retries, '--parallel', '--race', `test-task:flaky ${threshold}`, `test-task:append1 b`])
        assert.ok(['fb', 'bf'].includes(result()), `Expected result to be one of 'fb', 'bf' but got "${result()}"`)
      })

      it('run-p command', async () => {
        await runPar(['--retry', retries, '--race', `test-task:flaky ${threshold}`, `test-task:append1 b`])
        assert.ok(['fb', 'bf'].includes(result()), `Expected result to be one of 'fb', 'bf' but got "${result()}"`)
      })
    })

    describe('should combine retries with race execution (abort):', () => {
      const retries = 1
      it('Node API', async () => {
        try {
          await nodeApi([`test-task:append1Error a`, `test-task:append2Error b`], { retry: retries, parallel: true, race: true })
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
          assert.strictEqual(err.results[1].retries, 0)
          await delay(1500)
          assert.ok(['aba', 'baa'].includes(result()), `Expected result to be one of 'aba', 'baa' but got "${result()}"`)
          return
        }
        assert.fail('Expected task to fail after retries')
      })

      it('npm-run-all command', async () => {
        try {
          await runAll(['--retry', retries, '--race', '--parallel', `test-task:append1Error a`, 'test-task:append2Error b'])
        } catch (err) {
          await delay(1500)
          assert.ok(['aba', 'baa'].includes(result()), `Expected result to be one of 'aba', 'baa' but got "${result()}"`)
          return
        }
        assert.fail('Expected command to fail after retries')
      })
      it('npm-p command', async () => {
        try {
          await runPar(['--retry', retries, '--race', `test-task:append1Error a`, 'test-task:append2Error b'])
        } catch (err) {
          await delay(1500)
          assert.ok(['aba', 'baa'].includes(result()), `Expected result to be one of 'aba', 'baa' but got "${result()}"`)
          return
        }
        assert.fail('Expected command to fail after retries')
      })
    })
  })

  describe('[retry + sequential]', () => {
    describe('should combine retries with race execution (abort):', () => {
      const retries = 1
      it('Node API', async () => {
        try {
          await nodeApi([`test-task:append1Error a`, `test-task:append2Error b`], { retry: retries, parallel: true, race: true })
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
          assert.strictEqual(err.results[1].retries, 0)
          await delay(1500)
          assert.ok(['aba', 'baa'].includes(result()), `Expected result to be one of 'aba', 'baa' but got "${result()}"`)
          return
        }
        assert.fail('Expected task to fail after retries')
      })

      it('npm-run-all command', async () => {
        try {
          await runAll(['--retry', retries, '--race', '--parallel', `test-task:append1Error a`, 'test-task:append2Error b'])
        } catch (err) {
          await delay(1500)
          assert.ok(['aba', 'baa'].includes(result()), `Expected result to be one of 'aba', 'baa' but got "${result()}"`)
          return
        }
        assert.fail('Expected command to fail after retries')
      })
      it('npm-p command', async () => {
        try {
          await runPar(['--retry', retries, '--race', `test-task:append1Error a`, 'test-task:append2Error b'])
        } catch (err) {
          await delay(1500)
          assert.ok(['aba', 'baa'].includes(result()), `Expected result to be one of 'aba', 'baa' but got "${result()}"`)
          return
        }
        assert.fail('Expected command to fail after retries')
      })
    })

    describe('should combine retries with sequential execution (flaky):', () => {
      const retries = 4
      const threshold = 2
      it('Node API', async () => {
        const results = await nodeApi([`test-task:flaky ${threshold}`, `test-task:append1 b`], { retry: retries, parallel: false })
        assert.strictEqual(results[0].code, 0)
        assert.strictEqual(results[1].code, 0)
        assert.strictEqual(results[0].name, `test-task:flaky ${threshold}`)
        assert.strictEqual(results[1].name, 'test-task:append1 b')
        assert.strictEqual(results[0].retries, threshold)
        assert.strictEqual(results[1].retries, 0)
        assert.strictEqual(result(), 'fffb')
      })

      it('npm-run-all command', async () => {
        await runAll(['--retry', retries, `test-task:flaky ${threshold}`, `test-task:append1 b`])
        assert.strictEqual(result(), 'fffb')
      })

      it('run-s command', async () => {
        await runSeq(['--retry', retries, `test-task:flaky ${threshold}`, `test-task:append1 b`])
        assert.strictEqual(result(), 'fffb')
      })
    })

    describe('should combine retries with sequential execution (abort):', () => {
      const retries = 1
      it('Node API', async () => {
        try {
          await nodeApi([`test-task:append1Error a`, `test-task:append1Error b`], { retry: retries, parallel: false })
        } catch (err) {
          assert.strictEqual(err.results.length, 2)
          assert.strictEqual(err.results[0].name, 'test-task:append1Error a')
          assert.strictEqual(err.results[1].name, 'test-task:append1Error b')
          assert.strictEqual(err.results[0].code, 1)
          assert.strictEqual(err.results[1].code, undefined)
          assert.strictEqual(err.results[0].retries, retries)
          assert.strictEqual(err.results[1].retries, 0)
          assert.strictEqual(result(), 'aa')
          return
        }
        assert.fail('Expected task to fail after retries')
      })

      it('npm-run-all command', async () => {
        try {
          await runAll(['--retry', retries, `test-task:append1Error a`, `test-task:append1Error b`])
        } catch (err) {
          assert.strictEqual(result(), 'aa')
          return
        }
        assert.fail('Expected command to fail after retries')
      })
      it('npm-s command', async () => {
        try {
          await runSeq(['--retry', retries, `test-task:append1Error a`, `test-task:append1Error b`])
        } catch (err) {
          assert.strictEqual(result(), 'aa')
          return
        }
        assert.fail('Expected command to fail after retries')
      })
    })

    describe('should combine retries with sequential execution with continueOnError flag:', () => {
      const retries = 1
      it('Node API', async () => {
        try {
          await nodeApi([`test-task:append1Error a`, `test-task:append1Error b`], { retry: retries, parallel: false, continueOnError: true })
        } catch (err) {
          assert.strictEqual(err.results.length, 2)
          assert.strictEqual(err.results[0].name, 'test-task:append1Error a')
          assert.strictEqual(err.results[1].name, 'test-task:append1Error b')
          assert.strictEqual(err.results[0].code, 1)
          assert.strictEqual(err.results[1].code, 1)
          assert.strictEqual(err.results[0].retries, retries)
          assert.strictEqual(err.results[1].retries, retries)
          assert.strictEqual(result(), 'aabb')
          return
        }
        assert.fail('Expected task to fail after retries')
      })

      it('npm-run-all command', async () => {
        try {
          await runAll(['--retry', retries, '--continue-on-error', `test-task:append1Error a`, `test-task:append1Error b`])
        } catch (err) {
          assert.strictEqual(result(), 'aabb')
          return
        }
        assert.fail('Expected command to fail after retries')
      })
      it('npm-s command', async () => {
        try {
          await runSeq(['--retry', retries, '--continue-on-error', `test-task:append1Error a`, `test-task:append1Error b`])
        } catch (err) {
          assert.strictEqual(result(), 'aabb')
          return
        }
        assert.fail('Expected command to fail after retries')
      })
    })
  })

  describe('[retry + parallel]', () => {
    describe('should combine retries with parallel execution (succeed):', () => {
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

    describe('should combine retries with parallel execution (flaky + fail):', () => {
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
          assert.ok(err.results[0].retries <= 1, 'First task should be retried max one time. Retries: ' + err.results[0].retries)
          assert.strictEqual(err.results[1].retries, retries)
          await delay(1500)
          assert.strictEqual((result().match(/b/g) || []).length, retries + 1)
          assert((result().match(/f/g) || []).length <= retries)
        }
      })

      it('npm-run-all command', async () => {
        try {
          await runAll(['--retry', retries, '--parallel', `test-task:flaky ${threshold}`, `test-task:append1Error b`])
        } catch (err) {
          await delay(1500)
          assert.strictEqual((result().match(/b/g) || []).length, retries + 1)
          assert((result().match(/f/g) || []).length <= retries)
        }
      })

      it('run-p command', async () => {
        try {
          await runPar(['--retry', retries, `test-task:flaky ${threshold}`, `test-task:append1Error b`])
        } catch (err) {
          await delay(1500)
          assert.strictEqual((result().match(/b/g) || []).length, retries + 1)
          assert((result().match(/f/g) || []).length <= retries)
        }
      })
    })

    describe('should combine retries with parallel execution (flaky + succeed):', () => {
      const retries = 4
      const threshold = 2
      it('Node API', async () => {
        const results = await nodeApi([`test-task:flaky ${threshold}`, `test-task:append1 b`], { retry: retries, parallel: true })
        assert.strictEqual(results[0].code, 0)
        assert.strictEqual(results[1].code, 0)
        assert.strictEqual(results[0].name, `test-task:flaky ${threshold}`)
        assert.strictEqual(results[1].name, 'test-task:append1 b')
        assert.strictEqual(results[0].retries, threshold)
        assert.strictEqual(results[1].retries, 0)
        assert.ok(['fbff', 'bfff'].includes(result()), `Expected result to be one of 'fbff', 'bfff' but got "${result()}"`)
      })

      it('npm-run-all command', async () => {
        await runAll(['--retry', retries, '--parallel', `test-task:flaky ${threshold}`, `test-task:append1 b`])
        assert.ok(['fbff', 'bfff'].includes(result()), `Expected result to be one of 'fbff', 'bfff' but got "${result()}"`)
      })

      it('run-p command', async () => {
        await runPar(['--retry', retries, `test-task:flaky ${threshold}`, `test-task:append1 b`])
        assert.ok(['fbff', 'bfff'].includes(result()), `Expected result to be one of 'fbff', 'bfff' but got "${result()}"`)
      })
    })

    describe('should combine retries with parallel execution and maxParallel:', () => {
      const retries = 4
      const threshold = 1
      const maxParallel = 2
      it('Node API', async () => {
        const results = await nodeApi([`test-task:flaky ${threshold}`, `test-task:append1 a`, `test-task:append2 b`], {
          retry: retries,
          parallel: true,
          maxParallel: maxParallel
        })
        assert.strictEqual(results[0].code, 0)
        assert.strictEqual(results[1].code, 0)
        assert.strictEqual(results[2].code, 0)
        assert.strictEqual(results[0].name, `test-task:flaky ${threshold}`)
        assert.strictEqual(results[1].name, 'test-task:append1 a')
        assert.strictEqual(results[2].name, 'test-task:append2 b')
        assert.strictEqual(results[0].retries, threshold)
        assert.strictEqual(results[1].retries, 0)
        assert.strictEqual(results[2].retries, 0)
        assert.ok(['fabfb', 'afbfb'].includes(result()), `Expected one of fabfb|afbfb but got "${result()}"`)
      })

      it('npm-run-all command', async () => {
        await runAll([
          '--retry',
          retries,
          '--parallel',
          '--max-parallel',
          maxParallel,
          `test-task:flaky ${threshold}`,
          `test-task:append1 a`,
          `test-task:append2 b`
        ])
        assert.ok(['fabfb', 'afbfb'].includes(result()), `Expected one of fabfb|afbfb but got "${result()}"`)
      })

      it('run-p command', async () => {
        await runPar([
          '--retry',
          retries,
          '--max-parallel',
          maxParallel,
          `test-task:flaky ${threshold}`,
          `test-task:append1 a`,
          `test-task:append2 b`
        ])
        assert.ok(['fabfb', 'afbfb'].includes(result()), `Expected one of fabfb|afbfb but got "${result()}"`)
      })
    })
  })

  describe('[retry + aggregated-output]', () => {
    const retry = 3
    const EXPECTED = [
      ...createExpectedOutput('second', retry),
      ...createExpectedOutput('third', retry),
      ...createExpectedOutput('first', retry),
      ''
    ].join('\n')

    let stdout

    beforeEach(() => {
      stdout = new BufferStream()
    })
    describe('should not intermingle output of various commands:', () => {
      it('Node API', async () => {
        // Anche se ritentiamo fino a 3 volte, delayed non fallisce, quindi esegue 1 volta
        await nodeApi(['test-task:delayed:flaky first 500', 'test-task:delayed:flaky second 100', 'test-task:delayed:flaky third 300'], {
          stdout,
          retry: retry,
          parallel: true,
          silent: true,
          aggregateOutput: true
        })
        assert.strictEqual(stdout.value, EXPECTED)
      })
      it('npm-run-all command', async () => {
        await runAll(
          [
            '--retry',
            retry,
            '--parallel',
            '--aggregate-output',
            '--silent',
            'test-task:delayed:flaky first 500',
            'test-task:delayed:flaky second 100',
            'test-task:delayed:flaky third 300'
          ],
          stdout
        )
        assert.strictEqual(stdout.value, EXPECTED)
      })
      it('run-p command', async () => {
        await runPar(
          [
            '--retry',
            retry,
            '--aggregate-output',
            '--silent',
            'test-task:delayed:flaky first 500',
            'test-task:delayed:flaky second 100',
            'test-task:delayed:flaky third 300'
          ],
          stdout
        )
        assert.strictEqual(stdout.value, EXPECTED)
      })
    })

    describe('should fail without parallel flag:', () => {
      it('Node API', async () => {
        try {
          await nodeApi(['test-task:delayed:flaky first 500'], { stdout, retry: 2, silent: true, aggregateOutput: true })
        } catch (err) {
          // ci aspettiamo un errore di invalid option per aggregate-output senza parallel
          assert.ok(/Invalid options.aggregateOutput; It requires parallel/.test(err.message))
          return
        }
        assert.fail('Expected aggregate-output senza parallel to error')
      })
      it('npm-run-all command', async () => {
        try {
          await runAll(['--retry', '2', '--aggregate-output', '--silent', 'test-task:delayed:flaky first 100'], stdout)
        } catch (err) {
          assert.ok(/aggregate-output/.test(err.message))
          return
        }
        assert.fail('Expected aggregate-output senza parallel to error')
      })
      it('run-s command', async () => {
        try {
          await runSeq(['--retry', '2', '--aggregate-output', '--silent', 'test-task:delayed:flaky first 100'], stdout)
        } catch (err) {
          assert.ok(/aggregate-output/.test(err.message))
          return
        }
        assert.fail('Expected aggregate-output senza parallel to error')
      })
    })
  })

  describe('[retry + silent]', () => {
    describe('"should not print log if silent option was given:', () => {
      const retries = 3
      it('Node API command', async () => {
        try {
          await nodeApi(['test-task:append1Error b'], { retry: retries, silent: true })
        } catch (err) {
          // ha tentato esattamente `retries` volte
          assert.strictEqual(err.results[0].retries, retries)
          // il file di output contiene 'b' per ogni tentativo
          assert.strictEqual((result().match(/b/g) || []).length, retries + 1)
          return
        }
        assert.fail('Expected task to fail after retries')
      })

      it('npm-run-all command', async () => {
        try {
          await runAll(['--silent', '--retry', retries, 'test-task:append1Error d'])
        } catch (err) {
          assert.strictEqual((result().match(/d/g) || []).length, retries + 1)
          return
        }
        assert.fail('Expected command to fail after retries')
      })

      it('run-p command', async () => {
        try {
          await runPar(['--silent', '--retry', retries, 'test-task:append1Error e'])
        } catch (err) {
          assert.strictEqual((result().match(/e/g) || []).length, retries + 1)
          return
        }
        assert.fail('Expected command to fail after retries')
      })

      it('run-s command', async () => {
        try {
          await runSeq(['--silent', '--retry', retries, 'test-task:append1Error f'])
        } catch (err) {
          assert.strictEqual((result().match(/f/g) || []).length, retries + 1)
          return
        }
        assert.fail('Expected command to fail after retries')
      })
    })
  })
})
