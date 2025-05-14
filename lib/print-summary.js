const ansiStyles = require('ansi-styles')

// Funzione modificata: restituisce la tabella di riepilogo come stringa
module.exports = function printSummaryTable(results) {
  const headers = ['Task', 'FinalExitCode', 'Retries', 'Time(s)']
  const rows = results.map(({ name, code, retries, durationMs }) => {
    code = code == 130 ? code + ' (Killed)' : code
    return [name, String(code), String(retries), (durationMs / 1000).toFixed(2)]
  })
  const table = [headers, ...rows]
  const colWidths = headers.map((_, i) => Math.max(...table.map((row) => row[i].length)))
  const divider = '+' + colWidths.map((w) => '-'.repeat(w + 2)).join('+') + '+'

  let output = '\n' + divider + '\n'
  const totalInner = divider.length - 2
  const summaryText = ' Summary'
  output += '|' + summaryText + ' '.repeat(totalInner - summaryText.length) + '|' + '\n'
  output += divider + '\n'

  // Header della tabella
  const headerLine = '|' + headers.map((h, i) => ' ' + h.padEnd(colWidths[i]) + ' ').join('|') + '|'
  output += headerLine + '\n'
  const separator = '|' + colWidths.map((w) => ' ' + '-'.repeat(w).padEnd(w) + ' ').join('|') + '|'
  output += separator + '\n'

  // Righe dei risultati con colorazione ANSI
  rows.forEach((row) => {
    const rowString = '|' + row.map((cell, i) => ' ' + cell.padEnd(colWidths[i]) + ' ').join('|') + '|'
    if (row[1] == 0) {
      output += ansiStyles.white.open + rowString + ansiStyles.white.close + '\n'
    } else if (row[1].includes('130')) {
      output += ansiStyles.gray.open + rowString + ansiStyles.gray.close + '\n'
    } else {
      output += ansiStyles.red.open + rowString + ansiStyles.red.close + '\n'
    }
  })
  output += divider
  return output
}
