import { defineConfig } from "vitest/config";

/**
 * Vitest setup for the Candle backend.
 *
 * - `environment: "node"` because everything we test is server-side.
 * - `globals: true` lets the test files use describe/it/expect without
 *   importing them.
 * - `setupFiles` injects fake env vars so modules that read process.env at
 *   import time (notably `agent/llm.ts`) don't throw under test.
 * - `passWithNoTests: false` so an empty suite is treated as a failure —
 *   we never want CI to pass silently because tests didn't load.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    passWithNoTests: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/__tests__/**"],
    },
  },
});
