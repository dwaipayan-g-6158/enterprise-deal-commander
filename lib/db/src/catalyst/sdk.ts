// Catalyst Data Store access layer for Deal Commander's Catalyst port.
//
// Modeled directly on the sibling Customer-Insight-Engine ("Periscope")
// project's lib/db/src/sdk.ts, which has been running this exact pattern in
// production for months. See ../../../docs/catalyst-datastore-constraints.md
// (in the Deal-Commander repo root) for why this deliberately does NOT use
// ZCQL for routine reads: the Data Store Row API's `getIterableRows()` pages
// internally with no row cap, sidestepping ZCQL's 20-column/300-row SELECT
// limits entirely. Filtering, sorting, joining, and aggregating all happen
// in-memory in the repository layer (Slice 3), which is fine at Deal
// Commander's actual scale (tens to low hundreds of rows per table).
//
// This module is additive during the migration: lib/db/src/index.ts still
// exports the Drizzle/pg client for call sites Slice 3 hasn't migrated yet.
// Nothing here is wired into any route until Slice 3.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CatalystApp = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CatalystTable = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let catalystSdk: any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadSdk(): any {
  // Lazy require so this module can be imported (e.g. for typechecking, or
  // by call sites that don't exist yet) without zcatalyst-sdk-node needing
  // to resolve eagerly. At runtime inside the bundled server, `require` is
  // available globally via the esbuild banner in artifacts/api-server/build.mjs.
  catalystSdk ??= require("zcatalyst-sdk-node");
  return catalystSdk;
}

export interface CatalystRequestLike {
  headers: Record<string, string | string[] | undefined>;
}

function buildInitObject(req: CatalystRequestLike): { headers: Record<string, unknown> } {
  // Copy — never mutate the live Express req.headers object.
  return { headers: { ...req.headers } };
}

/** Initialize a per-request Catalyst app scoped to the calling user's own permissions. */
export function initCatalystApp(req: CatalystRequestLike): CatalystApp {
  return loadSdk().initialize(buildInitObject(req));
}

/**
 * Initialize a per-request Catalyst app with admin scope — bypasses
 * table-level "App User" permissions. Use only for the tables that are
 * intentionally Select-only for ordinary users (roles, audit log, settings),
 * matching the pattern documented in catalyst-datastore-constraints.md.
 */
export function initCatalystAdminApp(req: CatalystRequestLike): CatalystApp {
  return loadSdk().initialize(buildInitObject(req), { scope: "admin" });
}

function getTable(catalystApp: CatalystApp, tableName: string): CatalystTable {
  return catalystApp.datastore().table(tableName);
}

/** Raw row shape as returned by the Data Store Row API — every value is a string. */
export type RawRow = Record<string, string>;

/**
 * Fetch every row in a table. Uses `getIterableRows()` (an async generator
 * that pages internally) rather than the deprecated `getAllRows()` (silently
 * capped at 200) or ZCQL (20-column/300-row SELECT caps). See the module
 * docstring above for why this is the primary access pattern, not a
 * fallback.
 */
export async function fetchAllRows(catalystApp: CatalystApp, tableName: string): Promise<RawRow[]> {
  const table = getTable(catalystApp, tableName);
  const all: RawRow[] = [];
  for await (const row of table.getIterableRows()) {
    all.push(row as RawRow);
  }
  return all;
}

export async function insertRow(
  catalystApp: CatalystApp,
  tableName: string,
  values: Record<string, unknown>,
): Promise<RawRow> {
  return getTable(catalystApp, tableName).insertRow(values);
}

/**
 * Insert many rows in ONE Data Store call.
 *
 * The seed writes ~400 rows across 31 tables; one insertRow() per row would be
 * ~118 sequential HTTP round-trips and would blow AppSail's 30-second request
 * timeout on its own. Chunked at 100 because the Row API caps a bulk insert at
 * 200 — half that leaves headroom and keeps any single failing call small
 * enough to reason about.
 *
 * Returns the inserted rows in call order. Not transactional: Data Store has no
 * transactions, so a mid-way failure leaves earlier chunks written. Every seed
 * phase is therefore written to be re-runnable.
 */
export async function insertRows(
  catalystApp: CatalystApp,
  tableName: string,
  rows: Array<Record<string, unknown>>,
): Promise<RawRow[]> {
  if (rows.length === 0) return [];
  const table = getTable(catalystApp, tableName);
  const CHUNK = 100;
  const inserted: RawRow[] = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const result = (await table.insertRows(chunk)) as RawRow[];
    inserted.push(...result);
  }
  return inserted;
}

export async function updateRow(
  catalystApp: CatalystApp,
  tableName: string,
  rowId: string,
  values: Record<string, unknown>,
): Promise<RawRow> {
  return getTable(catalystApp, tableName).updateRow({ ROWID: rowId, ...values });
}

export async function deleteRow(catalystApp: CatalystApp, tableName: string, rowId: string): Promise<void> {
  await getTable(catalystApp, tableName).deleteRow(rowId);
}

/**
 * Upsert by a single-column "natural key". Data Store has no composite
 * UNIQUE constraint and no `ON CONFLICT` — every Postgres upsert call site
 * being ported (see catalyst-datastore-constraints.md) goes through this: a
 * lookup by a synthesized natural_key column, then insert-or-update. A
 * duplicate insert against a unique column rejects cleanly with
 * DUPLICATE_VALUE (verified live against the Data Store API), so the
 * retry-once path below is a defensive backstop for a genuine race between
 * the lookup and the insert, not the common case.
 */
export async function upsert(
  catalystApp: CatalystApp,
  tableName: string,
  naturalKeyColumn: string,
  naturalKeyValue: string,
  values: Record<string, unknown>,
): Promise<RawRow> {
  const rows = await fetchAllRows(catalystApp, tableName);
  const existing = rows.find((r) => r[naturalKeyColumn] === naturalKeyValue);
  if (existing) {
    return updateRow(catalystApp, tableName, existing["ROWID"], values);
  }
  try {
    return await insertRow(catalystApp, tableName, {
      [naturalKeyColumn]: naturalKeyValue,
      ...values,
    });
  } catch (err) {
    const isDuplicate = err instanceof Error && /DUPLICATE_VALUE|Duplicate value/i.test(err.message);
    if (!isDuplicate) throw err;
    const retryRows = await fetchAllRows(catalystApp, tableName);
    const retryExisting = retryRows.find((r) => r[naturalKeyColumn] === naturalKeyValue);
    if (!retryExisting) throw err;
    return updateRow(catalystApp, tableName, retryExisting["ROWID"], values);
  }
}

/**
 * Allocate the next sequential app-managed integer id for a table whose
 * Postgres original used `serial().primaryKey()` — Data Store has no
 * auto-increment integer type, and its own `ROWID` is a bigint unsafe to
 * expose as a JS `number` (see docs/CATALYST_SCHEMA.md's Identity section).
 * A max+1 read immediately before insert is a small, accepted race — fine at
 * this app's scale (lookup tables with dozens of rows, single-instance
 * AppSail), matching the identical pattern in the sibling
 * Customer-Insight-Engine project.
 */
export function nextAppId(rows: RawRow[]): number {
  let max = 0;
  for (const row of rows) {
    const id = Number(row["id"]);
    if (Number.isFinite(id) && id > max) max = id;
  }
  return max + 1;
}

// ---- Coercion helpers — every Data Store row value is a string ----

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function fromJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

/**
 * Data Store's Row API was verified (early in this migration) to return every
 * column value as a string, regardless of the column's declared data_type —
 * a `boolean` column's value coming back as the literal string "true"/"false",
 * not a JS boolean. That held for the tables checked at the time, but this
 * one (`commanders.is_active`) was live-caught returning an actual JS
 * boolean via `getIterableRows()` — an inconsistency in the Node SDK/Data
 * Store's own JSON serialization across tables or SDK versions, not
 * something this migration controls. A strict `raw === "true"` check silently
 * treats a boolean `true` row as inactive, which is exactly how an
 * unmistakably-active commander got treated as deactivated (`resolveCommander`
 * returning null, `requireAuth` collapsing that to a 401) during Slice 4's
 * live sign-in verification. Accept either representation rather than
 * re-litigate which one is "correct" — `unknown` in the signature is the
 * honest type given the runtime has shown both.
 */
export function parseBoolean(raw: unknown): boolean {
  return raw === true || raw === "true";
}

export function formatBoolean(value: boolean): string {
  return value ? "true" : "false";
}

/**
 * Parse a nullable numeric Data Store column. An unset numeric column can
 * echo back the literal string "NaN" on the row returned immediately after
 * an insert/update that omitted it — a non-empty, truthy string that
 * `Number()` still turns into a real NaN, so a naive truthy check isn't
 * enough. `Number.isFinite` catches that case explicitly.
 */
export function parseNullableNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Data Store DateTime columns (CREATEDTIME/MODIFIEDTIME and any custom
 * DateTime column) come back as "YYYY-MM-DD HH:MM:SS:mmm" — space-separated
 * date/time, colon (not period) before the millisecond component. Not valid
 * ISO 8601 as-is; this rewrites the last colon to a period before parsing.
 */
export function parseCatalystDateTime(raw: string | null | undefined): Date {
  if (!raw) return new Date(0);
  const spaceIdx = raw.indexOf(" ");
  let isoLike = raw;
  if (spaceIdx !== -1 && !raw.includes("T")) {
    const datePart = raw.slice(0, spaceIdx);
    const timePart = raw.slice(spaceIdx + 1);
    const lastColon = timePart.lastIndexOf(":");
    const colonCount = (timePart.match(/:/g) ?? []).length;
    const fixedTime =
      colonCount >= 3 && lastColon !== -1
        ? `${timePart.slice(0, lastColon)}.${timePart.slice(lastColon + 1)}`
        : timePart;
    isoLike = `${datePart}T${fixedTime}`;
  }
  const direct = new Date(isoLike);
  if (!Number.isNaN(direct.getTime())) return direct;
  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? new Date(0) : fallback;
}

/**
 * Inverse of parseCatalystDateTime, for WRITES to a custom DateTime column
 * (CREATEDTIME/MODIFIEDTIME are auto-managed and never written directly).
 * The Row API's accepted write format is "YYYY-MM-DD HH:MM:SS" — distinct
 * from the millisecond, colon-delimited shape it returns on reads.
 */
export function formatCatalystDateTime(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}
