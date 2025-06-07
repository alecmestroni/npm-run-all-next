/**
 * @module read-package-json
 * @author Alec Mestroni (2025)
 * @copyright 2025 Alec Mestroni
 * See LICENSE file in root directory for full license.
 */
'use strict'

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const joinPath = require('path').join
const readPkg = require('read-pkg')
const fs = require('fs')
//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

/**
 * Reads the package.json in the current directory.
 *
 * @returns {Promise<{taskList: string[], packageInfo: { path: string, body: object }}>}
 * Resolves with an object containing the list of npm scripts and package.json info.
 * @throws {Error} If package.json is not found in the current directory.
 */
module.exports = function readPackageJson() {
  const path = joinPath(process.cwd(), 'package.json')
  try {
    fs.readFileSync(path, 'utf8')
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error('No package.json found in the current directory: ' + process.cwd())
    }
  }

  return readPkg(path).then((body) => ({
    taskList: Object.keys(body.scripts || {}),
    packageInfo: { path, body },
  }))
}
