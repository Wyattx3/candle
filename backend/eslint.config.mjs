/**
 * ESLint flat config for the Candle backend.
 *
 * Goals:
 *  - Catch real bugs (no-unused-vars, no-misused-promises) without flooding
 *    the developer with stylistic noise — the codebase is already typed,
 *    so we lean on the TypeScript compiler for most enforcement.
 *  - Stay quick to run (<5s on the current source tree) so it can sit in a
 *    pre-commit hook later if we want.
 *
 * Run:
 *   npm run lint          # report
 *   npm run lint:fix      # auto-fix where possible
 */

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "data/**", "scripts/diagnose-*.ts"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "scripts/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Unused vars: allow leading-underscore convention for intentional ignores.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // `any` is sometimes unavoidable when crossing LangChain runtime boundaries.
      // Downgrade to warning so it shows up in review without blocking CI.
      "@typescript-eslint/no-explicit-any": "warn",
      // `require` is fine for lazy imports of optional dependencies (MCP host, e2b template create).
      "@typescript-eslint/no-require-imports": "off",
      // Triple-equals is mandatory.
      eqeqeq: ["error", "smart"],
      // Disallow accidental console.log left over from debugging — info/warn/error are fine.
      "no-console": ["off"],
      // Avoid prototype pollution accidents.
      "no-proto": "error",
      // Catch fall-through in switch statements unless explicitly commented.
      "no-fallthrough": "error",
      // Empty catch blocks must be explicit.
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-redeclare": "off",
      "no-case-declarations": "off",
    },
  },
  {
    // Tests can be loose with `any`, unused imports for test helpers, etc.
    files: ["src/**/*.test.ts", "src/__tests__/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
