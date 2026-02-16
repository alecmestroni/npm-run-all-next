/**
 * @author Toru Nagashima (2015)
 * @author Alec Mestroni (2025)
 * @copyright 2016 Toru Nagashima.
 * @copyright 2025 Alec Mestroni.
 * See LICENSE file in root directory for full license.
 */
'use strict';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const assert = require('assert');
const nodeApi = require('../lib');
const BufferStream = require('./lib/buffer-stream');
const util = require('./lib/util');
const runAll = util.runAll;
const runPar = util.runPar;
const runSeq = util.runSeq;

/**
 * create expected text
 * @param {string} term  the term to use when creating a line
 * @returns {string} the complete line
 */
function createExpectedOutput(term) {
  return `[${term}]__[${term}]`;
}

const EXPECTED_PARALLELIZED_TEXT = [
  createExpectedOutput('second'),
  createExpectedOutput('third'),
  createExpectedOutput('first'),
  '',
].join('\n');

//------------------------------------------------------------------------------
// Test
//------------------------------------------------------------------------------

describe('[aggregated] output', () => {
  before(() => process.chdir('test-workspace'));
  after(() => process.chdir('..'));

  describe('should not intermingle output of various commands', () => {
    let stdout = null;

    beforeEach(() => {
      stdout = new BufferStream();
    });

    it('Node API with parallel', async () => {
      await nodeApi(['test-task:delayed first 5000', 'test-task:delayed second 1000', 'test-task:delayed third 3000'], {
        stdout,
        parallel: true,
        silent: true,
        aggregateOutput: true,
      });
      assert.strictEqual(stdout.value, EXPECTED_PARALLELIZED_TEXT);
    });

    it('Node API without parallel should fail', async () => {
      try {
        await nodeApi(
          ['test-task:delayed first 5000', 'test-task:delayed second 1000', 'test-task:delayed third 3000'],
          {
            stdout,
            silent: true,
            aggregateOutput: true,
            parallel: false,
          },
        );
      } catch (err) {
        assert.ok(/Invalid options.aggregateOutput; It requires parallel/i.test(err.message));
        return;
      }
      assert.fail('should fail');
    });

    it('npm-run-all command with parallel', async () => {
      await runAll(
        [
          '--parallel',
          'test-task:delayed first 5000',
          'test-task:delayed second 1000',
          'test-task:delayed third 3000',
          '--silent',
          '--aggregate-output',
        ],
        stdout,
      );
      assert.strictEqual(stdout.value, EXPECTED_PARALLELIZED_TEXT);
    });

    it('npm-run-all command without parallel should fail', async () => {
      try {
        await runAll(
          [
            'test-task:delayed first 5000',
            'test-task:delayed second 1000',
            'test-task:delayed third 3000',
            '--silent',
            '--aggregate-output',
          ],
          stdout,
        );
      } catch (_err) {
        return;
      }
      assert.fail('should fail');
    });

    it('run-s command should fail', async () => {
      try {
        await runSeq(
          [
            'test-task:delayed first 5000',
            'test-task:delayed second 1000',
            'test-task:delayed third 3000',
            '--silent',
            '--aggregate-output',
          ],
          stdout,
        );
      } catch (_err) {
        return;
      }
      assert.fail('should fail');
    });

    it('run-p command', async () => {
      await runPar(
        [
          'test-task:delayed first 5000',
          'test-task:delayed second 1000',
          'test-task:delayed third 3000',
          '--silent',
          '--aggregate-output',
        ],
        stdout,
      );
      assert.strictEqual(stdout.value, EXPECTED_PARALLELIZED_TEXT);
    });
  });
});

describe('[aggregate] table', () => {
  before(() => process.chdir('test-workspace'));
  after(() => process.chdir('..'));

  let stdout = null;

  beforeEach(() => {
    stdout = new BufferStream();
  });

  it('Node API with aggregate table enabled', async () => {
    await nodeApi(['test-task:delayed first 5000', 'test-task:delayed second 1000', 'test-task:delayed third 3000'], {
      stdout,
      parallel: true,
      aggregateOutput: true,
      aggregateTable: true,
    });
    assert.ok(stdout.value.includes('THREAD STATUS'));
    assert.ok(stdout.value.includes('Task Num'));
  });

  it('validates exact table format and progression', async () => {
    await runPar(
      [
        'test-task:delayed first 5000',
        'test-task:delayed second 1000',
        'test-task:delayed third 3000',
        '--silent',
        '--aggregate-output',
        '--aggregate-table',
      ],
      stdout,
    );

    const output = stdout.value;

    // Validate initial table structure
    assert.ok(output.includes('┌──────────'));
    assert.ok(output.includes('Task Num'));
    
    // Validate all three tasks appear in initial state
    assert.ok(output.includes('test-task:delayed first 5000'));
    assert.ok(output.includes('test-task:delayed second 1000'));
    assert.ok(output.includes('test-task:delayed third 3000'));
    
    // Validate table updates appear for completion
    assert.ok(output.includes('COMPLETED -'));
    
    // Validate final state
    assert.ok(output.includes('No active threads'));
    
    // Validate task output appears
    assert.ok(output.includes('[first]'));
    assert.ok(output.includes('[second]'));
    assert.ok(output.includes('[third]'));
    
    // Validate structure: should have multiple table renders (initial + updates)
    const tableStarts = (output.match(/┌──────────┬/g) || []).length;
    assert.ok(tableStarts > 1, `Expected multiple table renders, got ${tableStarts}`);
    
    // Validate thread count progression (3 active → 2 → 1 → 0)
    assert.ok(output.includes('Threads running: 3/3'), 'Should show 3 active threads initially');
    assert.ok(output.includes('Threads running: 2/3'), 'Should show 2 active threads after first completion');
    assert.ok(output.includes('Threads running: 1/3'), 'Should show 1 active thread after second completion');
  });
});
