/**
 * @module signals
 * @author Alec Mestroni (2025)
 * @copyright 2025 Alec Mestroni
 * See LICENSE file in root directory for full license.
 */

/**
 * Maps signal names to their numeric codes.
 */
const signals = {
  SIGABRT: 6,
  SIGALRM: 14,
  SIGBUS: 10,
  SIGCHLD: 20,
  SIGCONT: 19,
  SIGFPE: 8,
  SIGHUP: 1,
  SIGILL: 4,
  SIGINT: 2,
  SIGKILL: 9,
  SIGPIPE: 13,
  SIGQUIT: 3,
  SIGSEGV: 11,
  SIGSTOP: 17,
  SIGTRAP: 5,
  SIGTSTP: 18,
  SIGTTIN: 21,
  SIGTTOU: 22,
  SIGUSR1: 30,
  SIGUSR2: 31,
}

/**
 * Converts a signal name into its numeric exit code.
 * @param {string} signal - The signal name (e.g., 'SIGINT').
 * @returns {number} The corresponding numeric code, or 0 if not found.
 */
module.exports = function convertSignal(signal) {
  return signals[signal] || 0
}
