/**
 * @module print-summary
 * @author Alec Mestroni (2025)
 * @copyright 2025 Alec Mestroni
 * See LICENSE file in root directory for full license.
 */

const ansiStyles = require("ansi-styles")

/**
 * Generates a summary table as a string for task results.
 * @param {Array} results - Array of task result objects ({ name, code, retries, durationMs }).
 * @param {number} [totalTime] - Optional total execution time in milliseconds.
 * @returns {string} Formatted summary table.
 */
module.exports = function printSummaryTable(results, totalTime) {
  const headers = ["Task", "FinalExitCode", "Retries", "Time(s)"]
  const rows = results.map(({ name, code, retries, durationMs }) => {
    code = code == 130 ? code + " (Killed)" : code
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
    } else if (row[1].includes("130")) {
      output += ansiStyles.gray.open + rowString + ansiStyles.gray.close + "\n"
    } else {
      output += ansiStyles.red.open + rowString + ansiStyles.red.close + "\n"
    }
  })

  // Close the table
  output += divider + "\n"

  // Estimated and actual total time inside the table
  const innerWidth = divider.length - 2

  // Estimated Total Time
  const estTotalMs = results.reduce((sum, r) => sum + r.durationMs, 0)
  const estSec = estTotalMs / 1000
  const estTimeStr = estSec > 60 ? (estSec / 60).toFixed(2) + " min" : estSec.toFixed(2) + " s"
  const estLabel = " Estimated Total Time: "
  output += "|" + estLabel + " ".repeat(innerWidth - estLabel.length - estTimeStr.length) + estTimeStr + "|\n"

  // Actual Total Time, if present
  if (typeof totalTime === "number") {
    const actualSec = totalTime / 1000
    const actualTimeStr = actualSec > 60 ? (actualSec / 60).toFixed(2) + " min" : actualSec.toFixed(2) + " s"
    const actLabel = " Actual Total Time:    "
    output += "|" + actLabel + " ".repeat(innerWidth - actLabel.length - actualTimeStr.length) + actualTimeStr + "|\n"
  }

  // Final table closure
  output += divider + "\n"

  return output
}
