import { defineConfig } from "vitest/config";

// Standalone Vitest config. A dedicated vitest.config.ts takes priority over
// vite.config.ts, so the app's Vite config (which throws unless PORT/BASE_PATH
// are set) is not loaded for tests.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
  },
});
