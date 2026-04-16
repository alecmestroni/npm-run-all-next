/**
 * @module print-summary
 * @author Alec Mestroni (2025)
 * @copyright 2025 Alec Mestroni
 * See LICENSE file in root directory for full license.
 */

const ansiStyles = require("ansi-styles")

/**
 * Formats a duration in seconds to a human-readable string.
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatTime(totalSeconds) {
  if (totalSeconds < 60) {
    return totalSeconds.toFixed(2) + " s"
  }
  const mins = Math.floor(totalSeconds / 60)
  const secs = Math.round(totalSeconds % 60)
  if (mins < 60) {
    return `${mins}m ${secs}s`
  }
  const hours = Math.floor(mins / 60)
  const remainMins = mins % 60
  return `${hours}h ${remainMins}m ${secs}s`
}

function byCompletion(a, b) {
  const aTime = a.completedAtMs ?? Infinity
  const bTime = b.completedAtMs ?? Infinity
  if (aTime !== bTime) return aTime - bTime
  return (a.completionOrder ?? Infinity) - (b.completionOrder ?? Infinity)
}

function withModeLabel(name, mode, includeMode) {
  if (!includeMode || !mode) return name
  const shortMode = mode === "parallel" ? "P" : "S"
  return `[${shortMode}] ${name}`
}

function buildHierarchicalRows(results, options) {
  const opts = options || {}
  const nodes = [...results]
  const byInvocation = new Map()

  nodes.forEach((node) => {
    if (node.invocationId) {
      byInvocation.set(node.invocationId, node)
    }
  })

  const childrenByParent = new Map()
  nodes.forEach((node) => {
    const parentId = node.parentInvocationId || null
    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, [])
    }
    childrenByParent.get(parentId).push(node)
  })

  for (const list of childrenByParent.values()) {
    list.sort(byCompletion)
  }

  const roots = []
  nodes.forEach((node) => {
    if (!node.parentInvocationId || !byInvocation.has(node.parentInvocationId)) {
      roots.push(node)
    }
  })
  roots.sort(byCompletion)

  const ordered = []
  const seen = new Set()

  function visit(node, depth) {
    if (seen.has(node)) return
    seen.add(node)
    const indent = depth > 0 ? `${"  ".repeat(depth - 1)}|-- ` : ""
    ordered.push({
      name: `${indent}${withModeLabel(node.name, node.mode, Boolean(opts.showMode))}`,
      code: node.code,
      retries: node.retries,
      durationMs: node.durationMs,
    })

    const children = childrenByParent.get(node.invocationId) || []
    children.forEach((child) => visit(child, depth + 1))
  }

  roots.forEach((node) => visit(node, 0))

  // Include any dangling rows (defensive fallback).
  nodes.forEach((node) => {
    if (!seen.has(node)) {
      ordered.push({
        name: withModeLabel(node.name, node.mode, Boolean(opts.showMode)),
        code: node.code,
        retries: node.retries,
        durationMs: node.durationMs,
      })
    }
  })

  return ordered
}

/**
 * Generates a summary table as a string for task results.
 * @param {Array} results - Array of task result objects ({ name, code, retries, durationMs, completionOrder? }).
 *   Rows are sorted by `completionOrder` (ascending) when present; results without `completionOrder` appear last.
 * @param {number} [totalTime] - Optional total execution time in milliseconds.
 * @param {number} [jobs] - Optional number of parallel jobs/threads used.
 * @returns {string} Formatted summary table.
 */
module.exports = function printSummaryTable(results, totalTime, jobs, options) {
  const opts = options || {}
  const sorted = opts.hierarchical
    ? buildHierarchicalRows(results, opts)
    : [...results].sort((a, b) => (a.completionOrder ?? Infinity) - (b.completionOrder ?? Infinity))
  const headers = ["Task", "FinalExitCode", "Retries", "Time(s)"]
  const rows = sorted.map(({ name, code, retries, durationMs }) => {
    code = code == 137 ? code + " (Killed)" : code
    return [name, String(code), String(retries), (durationMs / 1000).toFixed(2)]
  })
  const table = [headers, ...rows]
  const colWidths = headers.map((_, i) => Math.max(...table.map((row) => row[i].length)))
  const divider = "+" + colWidths.map((w) => "-".repeat(w + 2)).join("+") + "+"

  let output = "\n" + divider + "\n"
  const totalInner = divider.length - 2
  const summaryText = " Summary"
  output += "|" + summaryText + " ".repeat(totalInner - summaryText.length) + "|" + "\n"
  output += divider + "\n"

  // Table header
  const headerLine = "|" + headers.map((h, i) => " " + h.padEnd(colWidths[i]) + " ").join("|") + "|"
  output += headerLine + "\n"
  const separator = "|" + colWidths.map((w) => " " + "-".repeat(w).padEnd(w) + " ").join("|") + "|"
  output += separator + "\n"

  // Result rows with ANSI coloring
  rows.forEach((row) => {
    const rowString = "|" + row.map((cell, i) => " " + cell.padEnd(colWidths[i]) + " ").join("|") + "|"
    if (row[1] == 0) {
      output += ansiStyles.white.open + rowString + ansiStyles.white.close + "\n"
    } else if (row[1].includes("137")) {
      output += ansiStyles.gray.open + rowString + ansiStyles.gray.close + "\n"
    } else {
      output += ansiStyles.red.open + rowString + ansiStyles.red.close + "\n"
    }
  })

  // Close the table
  output += divider + "\n"

  // Estimated and actual total time inside the table
  const innerWidth = divider.length - 2

  // Jobs (threads) row, if provided
  if (typeof jobs === "number" && jobs > 0) {
    const jobsLabel = " Jobs (threads): "
    const jobsStr = String(jobs)
    output += "|" + jobsLabel + " ".repeat(innerWidth - jobsLabel.length - jobsStr.length) + jobsStr + "|\n"
  }

  // Estimated Total Time
  const estTotalMs = results.reduce((sum, r) => sum + r.durationMs, 0)
  const estTimeStr = formatTime(estTotalMs / 1000)
  const estLabel = " Estimated Total Time: "
  output += "|" + estLabel + " ".repeat(innerWidth - estLabel.length - estTimeStr.length) + estTimeStr + "|\n"

  // Actual Total Time, if present
  if (typeof totalTime === "number") {
    const actualTimeStr = formatTime(totalTime / 1000)
    const actLabel = " Actual Total Time:    "
    output += "|" + actLabel + " ".repeat(innerWidth - actLabel.length - actualTimeStr.length) + actualTimeStr + "|\n"
  }

  // Final table closure
  output += divider + "\n"

  return output
}
