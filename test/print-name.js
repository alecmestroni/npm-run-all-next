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
const createHeader = require('../lib/create-header')
const readPackageJson = require('../lib/read-package-json')
const BufferStream = require('./lib/buffer-stream')
const util = require('./lib/util')
const runAll = util.runAll
const runPar = util.runPar
const runSeq = util.runSeq
const path = require('path')
const fs = require('fs')

//------------------------------------------------------------------------------
// Test
//------------------------------------------------------------------------------

describe('[print-name] npm-run-all', () => {
  let packageInfo = null

  before(() => {
    process.chdir('test-workspace')
    return readPackageJson().then((info) => {
      packageInfo = info.packageInfo
    })
  })
  after(() => process.chdir('..'))

  describe('should print names before running tasks:', () => {
    it('Node API', async () => {
      const stdout = new BufferStream()
      await nodeApi('test-task:echo abc', { stdout, silent: true, printName: true })
      const header = createHeader('test-task:echo abc', packageInfo, false)
      assert.strictEqual(stdout.value.slice(0, header.length), header)
    })

    it('npm-run-all command (--print-name)', async () => {
      const stdout = new BufferStream()
      await runAll(['test-task:echo abc', '--silent', '--print-name'], stdout)
      const header = createHeader('test-task:echo abc', packageInfo, false)
      assert.strictEqual(stdout.value.slice(0, header.length), header)
    })

    it('run-s command (--print-name)', async () => {
      const stdout = new BufferStream()
      await runSeq(['test-task:echo abc', '--silent', '--print-name'], stdout)
      const header = createHeader('test-task:echo abc', packageInfo, false)
      assert.strictEqual(stdout.value.slice(0, header.length), header)
    })

    it('run-p command (--print-name)', async () => {
      const stdout = new BufferStream()
      await runPar(['test-task:echo abc', '--silent', '--print-name'], stdout)
      const header = createHeader('test-task:echo abc', packageInfo, false)
      assert.strictEqual(stdout.value.slice(0, header.length), header)
    })

    it('npm-run-all command (-n)', async () => {
      const stdout = new BufferStream()
      await runAll(['test-task:echo abc', '--silent', '-n'], stdout)
      const header = createHeader('test-task:echo abc', packageInfo, false)
      assert.strictEqual(stdout.value.slice(0, header.length), header)
    })

    it('run-s command (-n)', async () => {
      const stdout = new BufferStream()
      await runSeq(['test-task:echo abc', '--silent', '-n'], stdout)
      const header = createHeader('test-task:echo abc', packageInfo, false)
      assert.strictEqual(stdout.value.slice(0, header.length), header)
    })

    it('run-p command (-n)', async () => {
      const stdout = new BufferStream()
      await runPar(['test-task:echo abc', '--silent', '-n'], stdout)
      const header = createHeader('test-task:echo abc', packageInfo, false)
      assert.strictEqual(stdout.value.slice(0, header.length), header)
    })

    it('run-p command (-n)', async () => {
      const stdout = new BufferStream()
      await runPar(['test-task:echo abc', '--silent', '-n'], stdout)
      const header = createHeader('test-task:echo abc', packageInfo, false)
      assert.strictEqual(stdout.value.slice(0, header.length), header)
    })
  })

  describe('should handle error when missing package.json', () => {
    const pkgPath = path.join(process.cwd(), 'test-workspace', 'package.json')
    let originalContent

    before(() => {
      originalContent = fs.readFileSync(pkgPath, 'utf8')
      fs.unlinkSync(pkgPath)
    })
    after(() => {
      fs.writeFileSync(pkgPath, originalContent)
    })
    it('Node API', async () => {
      const stdout = new BufferStream()
      try {
        await nodeApi('test-task:echo abc', { stdout, silent: true, printName: true })
      } catch (err) {
        assert.ok(/No package.json found in the current directory/i.test(err.message))
        return
      }
      assert.fail('Expected an error about missing package.json')
    })
  })

  describe('createHeader function should handle missing packageInfo', () => {
    it('should return task name when packageInfo is missing', () => {
      const header = createHeader('test-task:echo abc', undefined, false)
      assert.strictEqual(header, '\n> test-task:echo abc\n\n')
    })
  })
})
