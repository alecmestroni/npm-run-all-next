/**
 * @author Toru Nagashima (2015)
 * @author Alec Mestroni (2025)
 * @copyright 2016 Toru Nagashima.
 * @copyright 2025 Alec Mestroni.
 * See LICENSE file in root directory for full license.
 */
'use strict'

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const assert = require('assert')
const nodeApi = require('../lib')
const spawnWithKill = require('./lib/spawn-with-kill')
const util = require('./lib/util')
const delay = util.delay
const result = util.result
const removeResult = util.removeResult

const fs = require('fs')
const path = require('path')
const os = require('os')
const { readRuntimes, updateRuntimesFile, updateHistoryFromResults, queueReorganizer, queueBalancer } = require('../lib/queue-balancer')
//------------------------------------------------------------------------------
// Test
//------------------------------------------------------------------------------

describe('[queue-balancer]', () => {
  const HISTORY_FILE = "./runtimes/file.json" 

  describe('[parallel]', () => {
    before(() => process.chdir('test-workspace'))
    after(() => process.chdir('..'))

    beforeEach(() => delay(1000).then(removeResult))

    describe('should be able to detect script sub-weight using tasks.length:', () => {
      it('Node API', async () => {
        const results = await nodeApi(['test-task:nest-parallel'], { parallel: true, balancer: true })
        assert.strictEqual(results.length, 1)
        assert.strictEqual(results[0].name, 'test-task:nest-parallel')
        assert.strictEqual(results[0].code, 0)
        assert.ok(
          ['acadacad', 'acadadac', 'adacacad', 'adacadac'].includes(result()),
          `Expected result to be one of 'acadacad', 'adacacad', 'adacadac', 'acadadac' but got "${result()}"`
        )
      })
    })
    describe('should be able to detect script sub-weight using --jobs:', () => {
      it('Node API', async () => {
        const results = await nodeApi(['test-task:nest-parallel:max'], { parallel: true, balancer: true })
        assert.strictEqual(results.length, 1)
        assert.strictEqual(results[0].name, 'test-task:nest-parallel:max')
        assert.strictEqual(results[0].code, 0)
        assert.ok(
          ['acadacad', 'acadadac', 'adacacad', 'adacadac'].includes(result()),
          `Expected result to be one of 'acadacad', 'adacacad', 'adacadac', 'acadadac' but got "${result()}"`
        )
      })
    })
  })

  describe('NodeAPI', () => {
    let tmpDir

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qb-'))
      process.chdir(tmpDir)
    })

    afterEach(() => {
      process.chdir(path.resolve(__dirname))
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })

    after(() => process.chdir('..'))
    describe('readRuntimes()', () => {
      it('returns {} when history file does not exist', () => {
        assert.deepStrictEqual(readRuntimes(), {})
      })

      it('warns and returns {} on invalid JSON', () => {
        fs.writeFileSync(HISTORY_FILE, '{not: "json"}', 'utf8')
        let warned = ''
        const originalWarn = console.warn
        console.warn = (msg) => {
          warned += msg
        }
        const result = readRuntimes()
        console.warn = originalWarn
        assert.deepStrictEqual(result, {})
        assert.ok(warned.includes('Could not parse runtime history file'))
      })

      it('reads valid JSON correctly', () => {
        const data = { foo: { measurements: [1.23], avgRuntime: 1.23, count: 1 } }
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(data), 'utf8')
        const result = readRuntimes()
        assert.deepStrictEqual(result, data)
      })

      it('reads from custom file when specified', () => {
        const customFile = '.test-custom-read.json'
        const data = { bar: { measurements: [4.56], avgRuntime: 4.56, count: 1 } }
        fs.writeFileSync(customFile, JSON.stringify(data), 'utf8')
        const result = readRuntimes(customFile)
        assert.deepStrictEqual(result, data)
        // Clean up
        fs.unlinkSync(customFile)
      })

      it('converts old format to new format', () => {
        const oldData = { foo: { count: 3, avgRuntime: 1.23 } }
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(oldData), 'utf8')
        const result = readRuntimes()
        const expected = { foo: { measurements: [1.23], avgRuntime: 1.23, count: 1 } }
        assert.deepStrictEqual(result, expected)
      })
    })

    describe('updateRuntimesFile()', () => {
      it('merges new measurements into empty history', () => {
        const oldMap = {}
        const measurements = { a: [1, 2, 3] }
        updateRuntimesFile(oldMap, measurements)
        const out = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'))
        // avg = (1+2+3)/3 = 2, count = 1 (one execution with avg 2)
        assert.deepStrictEqual(out, { 
          a: { measurements: [2], avgRuntime: 2, count: 1 } 
        })
      })

      it('merges into existing history correctly', () => {
        const old = { 
          a: { measurements: [2], avgRuntime: 2, count: 1 }, 
          b: { measurements: [5], avgRuntime: 5, count: 1 } 
        }
        const meas = { a: [2, 4], c: [3] }
        updateRuntimesFile(old, meas)
        const out = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'))
        // a: add new measurement 3 (avg of [2,4]), then avg of [2,3] = 2.5, count=2
        assert.deepStrictEqual(out.a, { measurements: [2, 3], avgRuntime: 2.5, count: 2 })
        // b untouched
        assert.deepStrictEqual(out.b, old.b)
        // c added: measurements=[3], avg=3, count=1
        assert.deepStrictEqual(out.c, { measurements: [3], avgRuntime: 3, count: 1 })
      })

      it('maintains sliding window with max measurements', () => {
        // Create history with MAX_MEASUREMENTS entries
        const measurements = Array.from({ length: 14 }, (_, i) => i + 1) // [1,2,3,...,14]
        const old = { a: { measurements, avgRuntime: 7.5, count: 14 } }
        
        // Add new measurement
        const newMeas = { a: [15] }
        updateRuntimesFile(old, newMeas)
        const out = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'))
        
        // Should keep last 14 measurements: [2,3,4,...,14,15]
        const expectedMeasurements = Array.from({ length: 14 }, (_, i) => i + 2) // [2,3,4,...,15]
        assert.deepStrictEqual(out.a.measurements, expectedMeasurements)
        assert.strictEqual(out.a.count, 14)
        assert.strictEqual(out.a.avgRuntime, 8.5) // avg of [2,3,4,...,15]
      })

      it('writes to custom file when specified', () => {
        const customFile = '.test-custom-runtimes.json'
        const oldMap = {}
        const measurements = { custom: [5] }
        updateRuntimesFile(oldMap, measurements, customFile)
        const out = JSON.parse(fs.readFileSync(customFile, 'utf8'))
        assert.deepStrictEqual(out, { 
          custom: { measurements: [5], avgRuntime: 5, count: 1 } 
        })
        // Clean up
        fs.unlinkSync(customFile)
      })
    })

    describe('updateHistoryFromResults()', () => {
      it('records only successful runs and merges with existing file', () => {
        // prepare existing in new format
        const initial = { x: { measurements: [1], avgRuntime: 1, count: 1 } }
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(initial), 'utf8')
        // call with mixed results
        const results = [
          { name: 'x', durationMs: 2000, code: 0 },
          { name: 'y', durationMs: 3000, code: 0 },
          { name: 'z', durationMs: 1000, code: 1 },
          { name: 'w', durationMs: 'bad', code: 0 },
        ]
        updateHistoryFromResults(results)
        const out = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'))
        // x: add 2s measurement, now measurements=[1,2], avg=1.5, count=2
        assert.deepStrictEqual(out.x, { measurements: [1, 2], avgRuntime: 1.5, count: 2 })
        // y added: measurements=[3], avg=3, count=1
        assert.deepStrictEqual(out.y, { measurements: [3], avgRuntime: 3, count: 1 })
        // z,w ignored
        assert.ok(!out.z && !out.w)
      })
    })

    describe('queueReorganizer()', () => {
      it('attaches estimatedRuntime and sorts descending', () => {
        // write history file in new format
        const history = { 
          slow: { measurements: [5], avgRuntime: 5, count: 1 }, 
          fast: { measurements: [1], avgRuntime: 1, count: 1 } 
        }
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history), 'utf8')
        const tasks = [{ name: 'fast', foo: 10 }, { name: 'none' }, { name: 'slow' }]
        const out = queueReorganizer(tasks)
        assert.strictEqual(out[0].name, 'slow')
        assert.strictEqual(out[0].estimatedRuntime, 5)
        assert.strictEqual(out[1].name, 'fast')
        assert.strictEqual(out[1].estimatedRuntime, 1)
        assert.strictEqual(out[2].name, 'none')
        assert.strictEqual(out[2].estimatedRuntime, 0)
        // original props preserved
        assert.strictEqual(out[0].foo, undefined)
        assert.strictEqual(out[1].foo, 10)
      })
    })

    describe('queueBalancer()', () => {
      it('returns unchanged if queue[0].weight <= freeThreads', () => {
        const q = [
          { name: 'a', weight: 2 },
          { name: 'b', weight: 3 },
          { name: 'c', weight: 1 },
        ]
        const out = queueBalancer(q.slice(), 3)
        assert.strictEqual(out[0].name, 'a')
        assert.strictEqual(out[1].name, 'b')
        assert.strictEqual(out[2].name, 'c')
      })

      it('only moves the first matching task when duplicates exist', () => {
        const q = [
          { name: 'p', weight: 2 },
          { name: 'q', weight: 1 },
          { name: 'r', weight: 3 },
        ]
        const out = queueBalancer(q.slice(), 1)
        assert.strictEqual(out[0].name, 'q')
        // r stays after p
        assert.strictEqual(out[2].name, 'r')
      })

      it('default freeThreads equals queue.length', () => {
        const q = [
          { name: 'u', weight: 3 },
          { name: 'v', weight: 2 },
          { name: 'w', weight: 3 },
        ]
        const out = queueBalancer(q.slice())
        // freeThreads = 3
        assert.strictEqual(out[0].name, 'u')
      })

      it('throws if no task has weight <= freeThreads', () => {
        const q = [
          { name: 'a', weight: 5 },
          { name: 'b', weight: 6 },
        ]
        assert.throws(() => queueBalancer(q.slice(), 3), /No task found with weight <= 3 in queue:/)
      })
    })
  })
})
