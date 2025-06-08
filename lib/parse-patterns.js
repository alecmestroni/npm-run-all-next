//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

// Utility to handle shell-quoting of command-line arguments
const shellQuote = require('shell-quote')

// Regular expression for matching argument placeholders in patterns
const ARGS_PATTERN = /\{(!)?([*@]|\d+)([^}]+)?}/g

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

/**
 * Ensures the input is always an array
 * @param {string|string[]|null|undefined} x
 * @returns {string[]}
 */
function toArray(x) {
  if (x == null) {
    return []
  }
  return Array.isArray(x) ? x : [x]
}

/**
 * Replaces placeholders in patterns with the provided arguments
 * Supports positional ({1}, {2}), all-args ({@}), and joined ({*})
 * Also handles default values with ":=" and ":-" syntax
 * @param {string[]} patterns
 * @param {string[]} args
 * @returns {string[]}
 */
function applyArguments(patterns, args) {
  const defaults = Object.create(null)
  return patterns.map((pattern) =>
    pattern.replace(ARGS_PATTERN, (whole, indirectionMark, id, options) => {
      if (indirectionMark != null) {
        throw new Error(`Invalid Placeholder: ${whole}`)
      }
      if (id === '@') {
        return shellQuote.quote(args)
      }
      if (id === '*') {
        return shellQuote.quote([args.join(' ')])
      }
      const position = parseInt(id, 10)
      if (position >= 1 && position <= args.length) {
        return shellQuote.quote([args[position - 1]])
      }
      if (options != null) {
        const prefix = options.slice(0, 2)
        if (prefix === ':=') {
          defaults[id] = shellQuote.quote([options.slice(2)])
          return defaults[id]
        }
        if (prefix === ':-') {
          return shellQuote.quote([options.slice(2)])
        }
        throw new Error(`Invalid Placeholder: ${whole}`)
      }
      if (defaults[id] != null) {
        return defaults[id]
      }
      return ''
    })
  )
}

/**
 * Parses the given patterns and applies argument substitutions if needed
 * @param {string|string[]} patternOrPatterns
 * @param {string[]} args
 * @returns {string[]}
 */
module.exports = function parsePatterns(patternOrPatterns, args) {
  const patterns = toArray(patternOrPatterns)
  const hasPlaceholder = patterns.some((pattern) => ARGS_PATTERN.test(pattern))
  return hasPlaceholder ? applyArguments(patterns, args) : patterns
}
