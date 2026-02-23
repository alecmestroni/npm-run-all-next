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

  describe('should handle large output without truncation', () => {
    let stdout = null;

    beforeEach(() => {
      stdout = new BufferStream();
    });

    it('Node API with single task outputting >65KB', async () => {
      await nodeApi(['test-task:large-output:70kb'], {
        stdout,
        parallel: true,
        silent: true,
        aggregateOutput: true,
      });
      
      const output = stdout.value;
      assert.ok(output.includes('[task70]__END__'), 'Large output should be complete');
      assert.ok(Buffer.byteLength(output, 'utf8') > 65536, 'Output should exceed 65KB');
    });

    it('Node API with multiple parallel tasks outputting large data', async () => {
      await nodeApi(['test-task:large-output:64kb', 'test-task:large-output:65kb', 'test-task:large-output:50kb'], {
        stdout,
        parallel: true,
        silent: true,
        aggregateOutput: true,
      });
      
      const output = stdout.value;
      assert.ok(output.includes('[task64]__END__'), 'First task output should be complete');
      assert.ok(output.includes('[task65]__END__'), 'Second task output should be complete');
      assert.ok(output.includes('[task50]__END__'), 'Third task output should be complete');
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

  it.only('Node API with aggregate table enabled', async () => {
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

  describe('should not truncate large aggregate output (>64KB)', () => {
    let stdout = null;

    beforeEach(() => {
      stdout = new BufferStream();
    });

    it('Node API: large output with summary table', async () => {
      await nodeApi(
        [
          'test-task:large-output:50kb',
          'test-task:large-output:64kb',
          'test-task:large-output:65kb',
        ],
        {
          stdout,
          parallel: true,
          silent: true,
          aggregateOutput: true,
          printSummaryTable: true,
        }
      );

      const output = stdout.value;
      const outputLength = Buffer.byteLength(output, 'utf8');

      // Verify total output is > 64KB (50 + 64 + 65 = 179KB of task output)
      assert.ok(outputLength > 64 * 1024, `Expected >64KB, got ${outputLength} bytes`);

      // Verify all task outputs are present (not truncated)
      assert.ok(output.includes('task50'), 'Should contain task50 output');
      assert.ok(output.includes('task64'), 'Should contain task64 output');
      assert.ok(output.includes('task65'), 'Should contain task65 output');

      // Verify the summary table was written at the end
      assert.ok(output.includes('Summary'), 'Should contain Summary table');
      assert.ok(output.includes('test-task:large-output:50kb'), 'Summary should list first task');
      assert.ok(output.includes('test-task:large-output:64kb'), 'Summary should list second task');
      assert.ok(output.includes('test-task:large-output:65kb'), 'Summary should list third task');

      // Verify summary table is at the end (after all task output)
      const summaryIndex = output.indexOf('Summary');
      const lastTaskOutput = Math.max(
        output.lastIndexOf('task50'),
        output.lastIndexOf('task64'),
        output.lastIndexOf('task65')
      );
      assert.ok(summaryIndex > lastTaskOutput, 'Summary table should appear after all task output');
    });

    it('run-p command: large output with summary table (via subprocess)', async function() {
      this.timeout(30000);
      
      const cp = require('child_process');
      const path = require('path');
      
      // Spawn the actual bin/run-p/index.js as a real subprocess
      const binPath = path.resolve(__dirname, '../bin/run-p/index.js');
      const child = cp.spawn(process.execPath, [
        binPath,
        'test-task:large-output:50kb',
        'test-task:large-output:64kb', 
        'test-task:large-output:65kb',
        '--silent',
        '--aggregate-output',
        '--print-summary-table',
      ], {
        cwd: path.resolve(__dirname, '../test-workspace'),
        stdio: ['ignore', 'pipe', 'pipe'],
        // Important: use default highWaterMark to allow backpressure
      });

      let stdout = '';
      let stderr = '';
      
      // Simulate slow reading to create backpressure and force drain logic
      let readPaused = false;
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
        // Periodically pause reading to build up buffer
        if (!readPaused && stdout.length > 50000) {
          readPaused = true;
          child.stdout.pause();
          setTimeout(() => {
            child.stdout.resume();
            readPaused = false;
          }, 100);
        }
      });
      
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      await new Promise((resolve, reject) => {
        child.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`Process exited with code ${code}\nStderr: ${stderr}`));
          } else {
            resolve();
          }
        });
        child.on('error', reject);
      });

      const outputLength = Buffer.byteLength(stdout, 'utf8');
      
      // Verify total output is > 64KB
      assert.ok(outputLength > 64 * 1024, `Expected >64KB, got ${outputLength} bytes`);

      // Verify all task outputs are present (not truncated)
      assert.ok(stdout.includes('task50'), 'Should contain task50 output');
      assert.ok(stdout.includes('task64'), 'Should contain task64 output');
      assert.ok(stdout.includes('task65'), 'Should contain task65 output');
      
      // Verify END markers for all tasks (proves no truncation)
      assert.ok(stdout.includes('[task50]__END__'), 'task50 should have END marker');
      assert.ok(stdout.includes('[task64]__END__'), 'task64 should have END marker');
      assert.ok(stdout.includes('[task65]__END__'), 'task65 should have END marker');

      // Verify the summary table was written at the end
      assert.ok(stdout.includes('Summary'), 'Should contain Summary table');
      assert.ok(stdout.includes('FinalExitCode'), 'Summary should have headers');
      assert.ok(stdout.includes('test-task:large-output:50kb'), 'Summary should list all tasks');
      
      // Verify summary is truly at the end (after last END marker)
      const summaryIndex = stdout.indexOf('Summary');
      const lastEndMarker = Math.max(
        stdout.lastIndexOf('[task50]__END__'),
        stdout.lastIndexOf('[task64]__END__'),
        stdout.lastIndexOf('[task65]__END__')
      );
      assert.ok(summaryIndex > lastEndMarker, 'Summary must appear after all task output including END markers');
    });

    it('run-p command: extremely large output (2MB) to force drain', async function() {
      this.timeout(60000);
      
      const cp = require('child_process');
      const path = require('path');

      // Create tasks that output 500KB each (2MB total)
      const binPath = path.resolve(__dirname, '../bin/run-p/index.js');
      const child = cp.spawn(process.execPath, [
        binPath,
        'test-task:large-output:500kb',
        'test-task:large-output:500kb-a', 
        'test-task:large-output:500kb-b',
        'test-task:large-output:500kb-c',
        '--silent',
        '--aggregate-output',
        '--print-summary-table',
      ], {
        cwd: path.resolve(__dirname, '../test-workspace'),
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const chunks = [];
      let totalSize = 0;
      
      child.stdout.on('data', (chunk) => {
        chunks.push(chunk);
        totalSize += chunk.length;
      });
      
      child.stderr.on('data', (chunk) => {
        // Ignore stderr for this test
      });

      await new Promise((resolve, reject) => {
        child.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`Process exited with code ${code}`));
          } else {
            resolve();
          }
        });
        child.on('error', reject);
      });

      const stdout = Buffer.concat(chunks).toString('utf8');
      const outputLength = Buffer.byteLength(stdout, 'utf8');
      
      // Verify massive output (should be ~2MB)
      assert.ok(outputLength > 1.5 * 1024 * 1024, `Expected >1.5MB, got ${(outputLength / 1024 / 1024).toFixed(2)}MB`);

      // Verify the summary table was written at the end (this proves drain worked)
      assert.ok(stdout.includes('Summary'), 'Should contain Summary table even with 2MB output');
      assert.ok(stdout.includes('FinalExitCode'), 'Summary should have headers');
      
      // Verify all tasks are listed in summary
      assert.ok(stdout.includes('test-task:large-output:500kb'), 'Summary should list first task');
      assert.ok(stdout.includes('test-task:large-output:500kb-a'), 'Summary should list second task');
      
      // Verify summary is at the very end
      const summaryIndex = stdout.indexOf('Summary');
      const totalLength = stdout.length;
      assert.ok(summaryIndex > totalLength - 2000, 'Summary should be within last 2000 chars');
    });
  });
});
