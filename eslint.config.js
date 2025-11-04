// eslint.config.js
const js = require("@eslint/js")

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2021, // Support for optional chaining, nullish coalescing, logical assignment, etc.
      sourceType: "commonjs",
      globals: {
        // Node.js globals
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        exports: "writable",
        module: "readonly",
        require: "readonly",
        global: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setImmediate: "readonly",
        clearImmediate: "readonly",
      },
    },
    rules: {
      "prefer-rest-params": "off",
      "prefer-spread": "off",
      "no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_",
        },
      ],
      "no-case-declarations": "off",
      "no-async-promise-executor": "off",
    },
  },
  // Configuration for test files
  {
    files: ["test/**/*.js", "test-workspace/**/*.js"],
    languageOptions: {
      globals: {
        // Mocha globals
        describe: "readonly",
        xdescribe: "readonly",
        it: "readonly",
        xit: "readonly",
        before: "readonly",
        after: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
      },
    },
    rules: {
      // Relax some rules for test files
      "no-unused-vars": "off", // Ignore all unused vars in tests
      "no-empty": "off",
      "no-control-regex": "off",
    },
  },
]
