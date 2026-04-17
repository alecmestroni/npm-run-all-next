/**
 * @author Toru Nagashima (2015)
 * @author Alec Mestroni (2025)
 * @copyright 2015 Toru Nagashima
 * @copyright 2025 Alec Mestroni
 * See LICENSE file in root directory for full license.
 */
"use strict"

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const runAll = require("../../lib")
const parseCLIArgs = require("../common/parse-cli-args")
const os = require("os")
const path = require("path")
const printSummaryTable = require("../../lib/print-summary")
const { createId, readRows, safeUnlink } = require("../../lib/summary-report")

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

/**
 * Parses arguments, then runs specified npm-scripts.
 *
 * @param {string[]} args - Arguments to parse.
 * @param {stream.Writable} stdout - A writable stream to print logs.
 * @param {stream.Writable} stderr - A writable stream to print errors.
 * @returns {Promise} A promise which fulfills when all npm-scripts are done.
 * @private
 */
module.exports = function npmRunAllNext(args, stdout, stderr) {
	try {
		const stdin = process.stdin
		const argv = parseCLIArgs(args)
		const startTime = Date.now()
		const summaryRootId = createId("root")
		const summaryReportFile = path.join(os.tmpdir(), `npm-run-all-next-summary-${summaryRootId}-${process.pid}.jsonl`)

		const promise = argv.groups.reduce((prev, group) => {
			if (!group || !group.patterns || group.patterns.length === 0) {
				return prev
			}

			return prev.then(() =>
				runAll(group.patterns, {
					stdout,
					stderr,
					stdin,
					parallel: group.parallel,
					jobs: group.parallel ? argv.jobs : 1,
					continueOnError: argv.continueOnError,
					printLabel: argv.printLabel,
					printName: argv.printName,
					config: argv.config,
					packageConfig: argv.packageConfig,
					silent: argv.silent,
					arguments: argv.rest,
					race: group.parallel && argv.race,
					npmPath: argv.npmPath,
					aggregateOutput: group.parallel && argv.aggregateOutput,
					aggregateTable: group.parallel && argv.aggregateTable,
					retries: group.parallel
						? (argv.retries || 0)
						: (argv.childRetries !== undefined ? argv.childRetries : (argv.retries || 0)),
					printSummaryTable: false,
					balancer: argv.balancer,
					runtimeFile: argv.runtimeFile,
					summaryReportFile,
					summaryRootId,
					summaryAutoCleanup: false,
				})
			)
		}, Promise.resolve(null))

		const withUnifiedSummary = promise
			.then((value) => {
				if (argv.printSummaryTable && stdout) {
					const reportRows = readRows(summaryReportFile).filter((row) => row.summaryRootId === summaryRootId)
					if (reportRows.length > 0) {
						const invocationIds = new Set(reportRows.map((row) => row.invocationId).filter(Boolean))
						const hasHierarchy = reportRows.some((row) => row.parentInvocationId && invocationIds.has(row.parentInvocationId))
						stdout.write(printSummaryTable(reportRows, Date.now() - startTime, argv.jobs || 1, { hierarchical: hasHierarchy, showMode: hasHierarchy }))
					}
				}
				return value
			})
			.catch((err) => {
				if (argv.printSummaryTable && stdout) {
					const reportRows = readRows(summaryReportFile).filter((row) => row.summaryRootId === summaryRootId)
					if (reportRows.length > 0) {
						const invocationIds = new Set(reportRows.map((row) => row.invocationId).filter(Boolean))
						const hasHierarchy = reportRows.some((row) => row.parentInvocationId && invocationIds.has(row.parentInvocationId))
						stdout.write(printSummaryTable(reportRows, Date.now() - startTime, argv.jobs || 1, { hierarchical: hasHierarchy, showMode: hasHierarchy }))
					}
				}
				if (err.detailMessage && stdout) {
					stdout.write('\n' + err.detailMessage)
					err.reported = true
				}
				throw err
			})
			.finally(() => {
				safeUnlink(summaryReportFile)
			})

		if (!argv.silent) {
			withUnifiedSummary.catch((err) => {
				if (!err.reported) {
					console.error("\nERROR:", err.message)
				}
			})
		}

		return withUnifiedSummary
	} catch (err) {
		console.error("\nERROR:", err.message)
		return Promise.reject(err)
	}
}