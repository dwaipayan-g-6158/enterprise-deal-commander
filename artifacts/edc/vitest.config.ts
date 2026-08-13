import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Standalone Vitest config. A dedicated vitest.config.ts takes priority over
// vite.config.ts, so the app's Vite config (which throws unless PORT/BASE_PATH
// are set) is not loaded for tests. That is also why the alias below is
// duplicated here rather than imported from there.
export default defineConfig({
  // Needed only by the *.test.tsx files — the .ts suites are pure logic — but a
  // plugin that never sees JSX costs nothing.
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    // Deliberately still "node": the ~20 pure-logic .test.ts suites don't need a
    // DOM and shouldn't pay for one. Component tests opt in per file with a
    // `// @vitest-environment jsdom` docblock. For the same reason there is no
    // setupFiles entry — a setup file runs for EVERY test file, including the
    // node-environment ones where `window` doesn't exist, so DOM stubs live at
    // the top of the file that needs them.
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
