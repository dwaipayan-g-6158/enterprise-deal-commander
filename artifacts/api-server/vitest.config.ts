import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    // The cache, event bus, and snapshot/health subscribers are process-wide
    // singletons that touch a single shared Postgres database. Run every test
    // file in one forked process, serially, so suites never race each other on
    // that shared state.
    pool: "forks",
    maxForks: 1,
    minForks: 1,
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
