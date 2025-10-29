/**
 * @author Toru Nagashima (2015)
 * @author Alec Mestroni (2025)
 * @copyright 2016 Toru Nagashima.
 * @copyright 2025 Alec Mestroni.
 * See LICENSE file in root directory for full license.
 */
"use strict"

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const OVERWRITE_OPTION = /^--([^:]+?):([^=]+?)(?:=(.+))?$/
const CONFIG_OPTION = /^--([^=]+?)(?:=(.+))$/
const PACKAGE_CONFIG_PATTERN = /^npm_package_config_(.+)$/
const CONCAT_OPTIONS = /^-[clnprs]+$/

/**
 * Overwrites a specified package config.
 */
function overwriteConfig(config, packageName, variable, value) {
  const scope = config[packageName] || (config[packageName] = {})
  scope[variable] = value
}

/**
 * Creates packageConfig from env.
 */
function createPackageConfig() {
  const retv = {}
  const pkgName = process.env.npm_package_name
  if (!pkgName) return retv
  for (const key of Object.keys(process.env)) {
    const m = PACKAGE_CONFIG_PATTERN.exec(key)
    if (m) {
      overwriteConfig(retv, pkgName, m[1], process.env[key])
    }
  }
  return retv
}

/**
 * Adds a new group into `groups`.
 */
function addGroup(groups, initialValues) {
  groups.push(Object.assign({ parallel: false, patterns: [] }, initialValues || {}))
}

/**
 * Holds parsed CLI arguments.
 */
class ArgumentSet {
  constructor(initialValues, options) {
    this.config = {}
    this.continueOnError = false
    this.groups = []
    this.jobs = 0
    this.npmPath = null
    this.packageConfig = createPackageConfig()
    this.printLabel = false
    this.printName = false
    this.balancer = false
    this.race = false
    this.rest = []
    this.silent = process.env.npm_config_loglevel === "silent"
    this.singleMode = Boolean(options && options.singleMode)
    this.retries = (initialValues && initialValues.retries) || 0
    this.printSummaryTable = (initialValues && initialValues.printSummaryTable) || false
    this.runtimeFile = (initialValues && initialValues.runtimeFile) || null

    addGroup(this.groups, initialValues)
  }

  get lastGroup() {
    return this.groups[this.groups.length - 1]
  }

  get parallel() {
    return this.groups.some((g) => g.parallel)
  }
}

function parseCLIArgsCore(set, args) {
  LOOP: for (let i = 0; i < args.length; ++i) {
    const arg = args[i]
    switch (arg) {
      case "--":
        set.rest = args.slice(i + 1)
        break LOOP

      case "-a":
      case "--aggregate-output":
        set.aggregateOutput = true
        break

      case "-b":
      case "--balancer":
        set.balancer = true
        break

      case "--color":
      case "--no-color":
        break

      case "-c":
      case "--continue-on-error":
        set.continueOnError = true
        break

      case "-l":
      case "--print-label":
        set.printLabel = true
        break

      case "-n":
      case "--print-name":
        set.printName = true
        break

      case "-r":
      case "--race":
        set.race = true
        break

      case "-k":
      case "--kill-others-on-fail":
        set.killOthersOnFail = true
        break

      case "--retries":
        set.retries = parseInt(args[++i], 10)
        if (!Number.isFinite(set.retries) || set.retries <= 0) {
          throw new Error(`Invalid Option: --retries ${args[i]}`)
        }
        break

      case "-t":
      case "--print-summary-table":
        set.printSummaryTable = true
        break

      case "--silent":
        set.silent = true
        break

      case "-j":
      case "--jobs":
        set.jobs = parseInt(args[++i], 10)
        if (!Number.isFinite(set.jobs) || set.jobs <= 0) {
          throw new Error(`Invalid Option: --jobs ${args[i]}`)
        }
        break

      case "-s":
      case "--sequential":
      case "--serial":
        if (set.singleMode && arg === "-s") {
          set.silent = true
          break
        }
        if (set.singleMode) {
          throw new Error(`Invalid Option: ${arg}`)
        }
        addGroup(set.groups)
        break

      case "-p":
      case "--parallel":
        if (set.singleMode) {
          throw new Error(`Invalid Option: ${arg}`)
        }
        addGroup(set.groups, { parallel: true })
        break

      case "--npm-path":
        set.npmPath = args[++i] || null
        break

      case "--runtime-file":
        set.runtimeFile = args[++i] || null
        break

      default: {
        let m = null
        if ((m = OVERWRITE_OPTION.exec(arg))) {
          overwriteConfig(set.packageConfig, m[1], m[2], m[3] || args[++i])
        } else if ((m = CONFIG_OPTION.exec(arg))) {
          set.config[m[1]] = m[2]
        } else if (CONCAT_OPTIONS.test(arg)) {
          parseCLIArgsCore(
            set,
            arg
              .slice(1)
              .split("")
              .map((c) => `-${c}`)
          )
        } else if (arg[0] === "-") {
          throw new Error(`Invalid Option: ${arg}`)
        } else {
          set.lastGroup.patterns.push(arg)
        }
      }
    }
  }

  const invalidWithoutParallel = [
    { prop: "aggregateOutput", long: "--aggregate-output", short: "-a" },
    { prop: "race", long: "--race", short: "-r" },
    { prop: "killOthersOnFail", long: "--kill-others-on-fail", short: "-k" },
    { prop: "balancer", long: "--balancer", short: "-b" },
    { prop: "jobs", long: "--jobs", short: "-j", zeroCheck: true },
  ]

  invalidWithoutParallel.forEach(({ prop, long, short, zeroCheck }) => {
    const isSet = zeroCheck ? set[prop] !== 0 : Boolean(set[prop])
    if (!set.parallel && isSet) {
      const flag = args.includes(long) ? long : short
      throw new Error(`Invalid Option: ${flag} (without parallel)`)
    }
  })

  return set
}

/**
 * Parses CLI arguments.
 *
 * @param {string[]} args
 * @param {object} initialValues
 * @param {object} options
 * @returns {ArgumentSet}
 */
module.exports = function parseCLIArgs(args, initialValues, options) {
  return parseCLIArgsCore(new ArgumentSet(initialValues, options), args)
}
