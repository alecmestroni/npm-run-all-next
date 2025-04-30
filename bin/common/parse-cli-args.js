/**
 * @author Toru Nagashima
 * @copyright 2016 Toru Nagashima. All rights reserved.
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
    this.maxParallel = 0
    this.npmPath = null
    this.packageConfig = createPackageConfig()
    this.printLabel = false
    this.printName = false
    this.race = false
    this.rest = []
    this.silent = process.env.npm_config_loglevel === "silent"
    this.singleMode = Boolean(options && options.singleMode)
    this.retry = (initialValues && initialValues.retry) || 0
    this.summary = (initialValues && initialValues.summary) || false

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

      case "--retry":
        set.retry = Number(args[++i]) || 0
        break

      case "--summary":
        set.summary = true
        break

      case "--silent":
        set.silent = true
        break

      case "--max-parallel":
        set.maxParallel = parseInt(args[++i], 10)
        if (!Number.isFinite(set.maxParallel) || set.maxParallel <= 0) {
          throw new Error(`Invalid Option: --max-parallel ${args[i]}`)
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

      case "--aggregate-output":
        set.aggregateOutput = true
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

  if (!set.parallel && set.aggregateOutput) {
    throw new Error("Invalid Option: --aggregate-output (without parallel)")
  }
  if (!set.parallel && set.race) {
    const flag = args.includes("--race") ? "--race" : "-r"
    throw new Error(`Invalid Option: ${flag} (without parallel)`)
  }
  if (!set.parallel && set.maxParallel !== 0) {
    throw new Error("Invalid Option: --max-parallel (without parallel)")
  }

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

 
