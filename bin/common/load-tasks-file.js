/**
 * Loads a list of tasks from a file.
 * Supports JSON files containing an array of strings.
 * @param {string} filePath - Path to the tasks file.
 * @returns {string[]} Array of task names.
 * @throws {Error} If the file cannot be read or is not a valid array of strings.
 */
const fs = require("fs")
const path = require("path")

function loadTasksFile(filePath) {
  const absPath = path.resolve(process.cwd(), filePath)
  let data
  try {
    data = fs.readFileSync(absPath, "utf8")
  } catch (_err) {
    throw new Error(`Cannot read tasks file: ${filePath}`)
  }
  let arr
  try {
    arr = JSON.parse(data)
  } catch (_err) {
    throw new Error(`Tasks file is not valid JSON: ${filePath}`)
  }
  if (!Array.isArray(arr) || !arr.every((x) => typeof x === "string")) {
    throw new Error(`Tasks file must be a JSON array of strings: ${filePath}`)
  }
  return arr
}

module.exports = loadTasksFile
