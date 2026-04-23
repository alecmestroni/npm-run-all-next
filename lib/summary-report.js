/**
 * @module summary-report
 * @author Alec Mestroni (2026)
 * @copyright 2026 Alec Mestroni
 * See LICENSE file in root directory for full license.
 */
"use strict"

const fs = require("fs")

const ENV_FILE = "NPM_RUN_ALL_NEXT_SUMMARY_FILE"
const ENV_ROOT = "NPM_RUN_ALL_NEXT_SUMMARY_ROOT_ID"
const ENV_PARENT = "NPM_RUN_ALL_NEXT_SUMMARY_PARENT_INVOCATION"
const ENV_RETRIES = "NPM_RUN_ALL_NEXT_INHERITED_RETRIES"

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function appendRows(filePath, rows) {
  if (!filePath || !Array.isArray(rows) || rows.length === 0) return
  const payload = rows.map((row) => JSON.stringify(row)).join("\n") + "\n"
  fs.appendFileSync(filePath, payload, "utf8")
}

function readRows(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return []
  const content = fs.readFileSync(filePath, "utf8")
  if (!content) return []
  return content
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch (_) {
        return null
      }
    })
    .filter(Boolean)
}

function safeUnlink(filePath) {
  if (!filePath) return
  try {
    fs.unlinkSync(filePath)
  } catch (_) {
    // ignore cleanup failures for temporary files.
  }
}

module.exports = {
  ENV_FILE,
  ENV_ROOT,
  ENV_PARENT,
  ENV_RETRIES,
  createId,
  appendRows,
  readRows,
  safeUnlink,
}
