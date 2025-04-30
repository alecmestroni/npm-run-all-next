/**
 * @module run-tasks-in-parallel
 * @author Toru Nagashima
 * @copyright 2015 Toru Nagashima. All rights reserved.
 * See LICENSE file in root directory for full license.
 */
"use strict"

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const MemoryStream = require("memorystream")
const chalk = require("chalk")
const NpmRunAllError = require("./npm-run-all-error")
const runTask = require("./run-task")

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Rimuove il valore x dall'array.
 * @template T
 * @param {T[]} array
 * @param {T} x
 */
function remove(array, x) {
  const idx = array.indexOf(x)
  if (idx !== -1) array.splice(idx, 1)
}

/**
 * Stampa a console una tabella ASCII con colonne Task, FinalExitCode, Retries, Time(s),
 * preceduta da un header "Summary".
 * @param {Array<{name:string,code:number,retries:number,durationMs:number}>} results
 */
function printSummaryTable(results) {
  const headers = ["Task", "FinalExitCode", "Retries", "Time(s)"]
  const rows = results.map(({ name, code, retries, durationMs }) => [name, String(code), String(retries), (durationMs / 1000).toFixed(2)])
  const table = [headers, ...rows]

  // calcola la larghezza di ciascuna colonna
  const colWidths = headers.map((_, i) => Math.max(...table.map((row) => row[i].length)))

  // linea di separazione esterna
  const divider = "+" + colWidths.map((w) => "-".repeat(w + 2)).join("+") + "+"

  // stampa header "Summary" centrato/left-aligned nella larghezza totale
  console.log("\n" + divider)
  const totalInnerWidth = divider.length - 2
  const summaryText = "Summary"
  const padding = totalInnerWidth - summaryText.length
  console.log("|" + " " + summaryText + " ".repeat(padding) + "|")
  console.log(divider)

  // righe di intestazione colonne
  const headerLine = "|" + headers.map((h, i) => " " + h.padEnd(colWidths[i]) + " ").join("|") + "|"
  // linea di separazione sotto le intestazioni
  const separator = "|" + colWidths.map((w) => " " + "-".repeat(w).padEnd(w) + " ").join("|") + "|"

  console.log(headerLine)
  console.log(separator)

  // righe dei dati
  rows.forEach((row) => {
    console.log("|" + row.map((cell, i) => " " + cell.padEnd(colWidths[i]) + " ").join("|") + "|")
  })

  // linea di chiusura
  console.log(divider)
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

/**
 * Esegue in parallelo i task con supporto retry e poi, se options.summary è true,
 * stampa un riepilogo tabellare.
 *
 * @param {string[]} tasks
 * @param {object} options include options.retry, options.continueOnError,
 *   options.summary (boolean), options.parallel, ecc.
 * @returns {Promise<object[]>}
 */
module.exports = function runTasks(tasks, options) {
  const showSummary = Boolean(options.summary)

  return new Promise((resolve, reject) => {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      if (showSummary) {
        printSummaryTable([])
      }
      resolve([])
      return
    }

    const results = tasks.map((name) => ({
      name,
      code: undefined,
      retries: 0,
      durationMs: 0
    }))
    const queue = tasks.map((name, idx) => ({ name, index: idx }))
    const promises = []
    let error = null
    let aborted = false
    const maxRetries = Number(options.retry) || 0

    async function attemptRun(name, opts) {
      const start = Date.now()
      let lastResult = { name, code: 1 }
      let retries = 0

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          lastResult = await runTask(name, opts)
        } catch {
          lastResult = { name, code: 1 }
        }

        if (lastResult.code === 0) {
          const durationMs = Date.now() - start
          return { name, code: 0, retries, durationMs }
        }

        // log fallimento
        opts.stderr.write(chalk.yellow("›") + ` ${chalk.bold(name)} failed with exit code ${lastResult.code}\n`)

        // se posso riprovare, incremento retries e stampo retry
        if (attempt < maxRetries) {
          retries += 1
          opts.stderr.write(chalk.yellow("›") + ` retrying ${chalk.bold(name)} (${retries}/${maxRetries})\n`)
        }
      }

      // Exhausted retries
      const durationMs = Date.now() - start
      const msg = `Task "${name}" failed after ${maxRetries + 1} attempts (code: ${lastResult.code})`

      if (opts.continueOnError) {
        return { name, code: lastResult.code, retries, durationMs }
      }

      const err = new Error(msg)
      err.retries = retries
      err.durationMs = durationMs
      throw err
    }

    function abort() {
      if (aborted) return
      aborted = true
      if (promises.length === 0) {
        done()
      } else {
        for (const p of promises) {
          if (typeof p.abort === "function") p.abort()
        }
        Promise.all(promises).then(done, reject)
      }
    }

    function done() {
      if (showSummary) {
        printSummaryTable(results)
      }

      if (error != null) {
        reject(error)
      } else {
        const failures = results.filter((r) => r.code !== 0)
        if (failures.length > 0) {
          const msgs = failures.map((r) => `"${r.name}" exited with ${r.code}`)
          reject(new Error(msgs.join(" & ")))
        } else {
          resolve(results)
        }
      }
    }

    function next() {
      if (aborted) return
      if (queue.length === 0) {
        if (promises.length === 0) done()
        return
      }

      const { name, index } = queue.shift()
      const opts = Object.assign({}, options)
      let writer = null

      if (opts.aggregateOutput && opts.stdout) {
        // Bufferizziamo sia stdout che stderr per questo task
        writer = new MemoryStream(null, { readable: false })
        opts.stdout = writer
        opts.stderr = writer
      }

      const p = attemptRun(name, opts)
      promises.push(p)

      p.then((result) => {
        remove(promises, p)
        if (aborted) return

        // Appena il task finisce, svuotiamo il buffer e lo scriviamo tutto
        if (writer && options.stdout) {
          options.stdout.write(writer.toString())
        }

        // Aggiorniamo i dati per il riepilogo
        results[index].code = result.code
        results[index].retries = result.retries
        results[index].durationMs = result.durationMs

        if (result.code) {
          if (!options.continueOnError) {
            error = new NpmRunAllError(result, results)
            abort()
            return
          }
        }

        if (options.race && result.code === 0) {
          error = null
          abort()
          return
        }

        next()
      }).catch((err) => {
        remove(promises, p)
        if (!options.continueOnError || options.race) {
          error = err
          abort()
        } else {
          next()
        }
      })
    }

    // Avvio parallelo fino a maxParallel
    const max = options.maxParallel
    const initial = typeof max === "number" && max > 0 ? Math.min(tasks.length, max) : tasks.length

    for (let i = 0; i < initial; i++) {
      next()
    }
  })
}
