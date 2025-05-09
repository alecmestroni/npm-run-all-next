/**
 * @module read-package-json
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

const joinPath = require("path").join
const readPkg = require("read-pkg")

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

/**
 * Reads the package.json in the current directory.
 *
 * @returns {object} package.json's information.
 */
module.exports = function readPackageJson() {
  const path = joinPath(process.cwd(), "package.json")
  return readPkg(path).then((body) => ({
    taskList: Object.keys(body.scripts || {}),
    packageInfo: { path, body }
  }))
}
