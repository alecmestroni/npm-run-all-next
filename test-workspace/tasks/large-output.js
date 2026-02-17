/**
 * Task that generates large output (>65KB) to test buffer handling
 */
'use strict';

const taskName = process.argv[2] || 'default';
const targetKB = parseInt(process.argv[3]) || 100;

// Generate specified KB of output
// Each line is exactly 100 bytes (including newline)
const lineSize = 99; // 99 chars + 1 newline = 100 bytes
const linesNeeded = (targetKB * 1024) / 100;

for (let i = 0; i < linesNeeded; i++) {
  // Create a line with the task name and line number padded to reach lineSize
  const lineNumber = String(i).padStart(6, '0');
  const content = `[${taskName}] Line ${lineNumber} `;
  const padding = 'x'.repeat(Math.max(0, lineSize - content.length));
  console.log(content + padding);
}

// Final marker to verify all output was captured
console.log(`[${taskName}]__END__`);
