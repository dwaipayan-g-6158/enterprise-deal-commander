// Temporary local-dev drizzle config (Windows-safe forward-slash schema path).
// drizzle-kit's glob treats backslashes as escapes, so path.join(__dirname,...)
// fails on Windows. Safe to delete; not used by the deployed pipeline.
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  // Manage both the public schema and the Phase 2 edc_v2 durable-history schema
  // (drizzle-kit defaults to ["public"] only).
  schemaFilter: ["public", "edc_v2"],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
