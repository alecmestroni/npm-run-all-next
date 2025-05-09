/**
 * @author Toru Nagashima (2015)
 * @author Alec Mestroni (2025)
 * @copyright 2016 Toru Nagashima.
 * @copyright 2025 Alec Mestroni.
 * See LICENSE file in root directory for full license.
 */
"use strict"

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const spawn = require("../../lib/spawn")

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

module.exports = function spawnWithKill(command, args) {
  return new Promise((resolve, reject) => {
    const cp = spawn(command, args, {})
    cp.on("exit", resolve)
    cp.on("error", reject)

    setTimeout(() => cp.kill(), 1000)
  })
}
