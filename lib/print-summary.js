/**
 * Stampa a console una tabella ASCII con colonne Task, FinalExitCode, Retries, Time(s),
 * preceduta da un header "Summary".
 * @param {Array<{name:string,code:number,retries:number,durationMs:number}>} results
 */
module.exports = function printSummaryTable(results) {
  const headers = ["Task", "FinalExitCode", "Retries", "Time(s)"]
  const rows = results.map(({ name, code, retries, durationMs }) => [name, String(code), String(retries), (durationMs / 1000).toFixed(2)])
  const table = [headers, ...rows]
  const colWidths = headers.map((_, i) => Math.max(...table.map((row) => row[i].length)))
  const divider = "+" + colWidths.map((w) => "-".repeat(w + 2)).join("+") + "+"

  console.log("\n" + divider)
  const totalInner = divider.length - 2
  const summaryText = "Summary"
  console.log("|" + " " + summaryText + " ".repeat(totalInner - summaryText.length) + "|")
  console.log(divider)

  const headerLine = "|" + headers.map((h, i) => " " + h.padEnd(colWidths[i]) + " ").join("|") + "|"
  const separator = "|" + colWidths.map((w) => " " + "-".repeat(w).padEnd(w) + " ").join("|") + "|"

  console.log(headerLine)
  console.log(separator)
  rows.forEach((row) => {
    console.log("|" + row.map((cell, i) => " " + cell.padEnd(colWidths[i]) + " ").join("|") + "|")
  })
  console.log(divider)
}
