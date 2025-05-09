/**
 * @module spawn
 * @author Toru Nagashima
 * @copyright 2015 Toru Nagashima. All rights reserved.
 * See LICENSE file in root directory for full license.
 */
"use strict"

// ------------------------------------------------------------------------------
// Public Interface
// ------------------------------------------------------------------------------

/**
 * Launches a new process with the given command.
 * This is {@link ./spawn-posix.js:spawn} or {@link ./spawn-win32.js:spawn}
 * @private
 */
module.exports = process.platform === "win32" ? require("./spawn-win32") : require("./spawn-posix")
