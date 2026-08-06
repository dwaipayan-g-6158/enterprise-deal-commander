import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Catalyst migration bridge (see docs/catalyst-datastore-constraints.md in
// Deal-Commander's repo, and lib/db/src/catalyst/sdk.ts for the Data Store
// access layer that's replacing this file's call sites incrementally).
// AppSail has no DATABASE_URL — Data Store is the datastore there — so the
// fail-fast throw below is skipped specifically when running on AppSail
// (detected the same way the server's port shim does: the env var Catalyst
// injects only in that runtime). Local dev and CI are unaffected; they still
// throw immediately on a missing DATABASE_URL, same as before. pg's Pool is
// lazy regardless (it only opens a connection on the first query), so
// skipping the throw lets the process boot and serve non-DB routes (the SPA,
// /api/healthz) even with nothing reachable at this connection string; only
// a route that actually queries the DB fails, which is the intended,
// visible state until Slice 3 finishes moving call sites onto Data Store.
const isAppSail = Boolean(process.env["X_ZOHO_CATALYST_LISTEN_PORT"]);

if (!process.env.DATABASE_URL && !isAppSail) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
