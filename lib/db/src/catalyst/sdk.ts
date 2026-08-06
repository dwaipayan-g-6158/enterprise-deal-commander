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

// ---------------------------------------------------------------- Error shape

/**
 * Normalized view of a Data Store rejection.
 *
 * The Node SDK rejects with a PLAIN OBJECT — `{statusCode, code, message}` —
 * not an `Error` instance. Confirmed live against the deployed app: the value
 * reaching Express's error handler stringifies to "[object Object]" and fails
 * `instanceof Error`. Every `err instanceof Error && /…/.test(err.message)`
 * guard written against these rejections is therefore dead code that silently
 * takes the wrong branch, which is exactly how duplicate-value handling ended
 * up never firing. Route all inspection of a Data Store failure through here.
 */
export interface CatalystErrorInfo {
  message: string;
  code: string;
  statusCode: number | null;
}

export function catalystErrorInfo(err: unknown): CatalystErrorInfo {
  const source = (err ?? {}) as Record<string, unknown>;
  const message =
    typeof source["message"] === "string"
      ? source["message"]
      : err instanceof Error
        ? err.message
        : String(err);
  return {
    message,
    code: typeof source["code"] === "string" ? source["code"] : "",
    statusCode:
      typeof source["statusCode"] === "number" ? (source["statusCode"] as number) : null,
  };
}

/**
 * A unique-column violation, in either rejection shape. Shared by every repo
 * that turns a duplicate into a domain error (a 409 rather than a 500) —
 * previously copy-pasted into four modules, all four `instanceof`-gated and
 * all four dead.
 */
export function isDuplicateValueError(err: unknown): boolean {
  return /DUPLICATE_VALUE|Duplicate value/i.test(catalystErrorInfo(err).message);
}

/** The platform's own back-pressure signal — see `withDataStoreSlot` below. */
function isConcurrencyLimitError(err: unknown): boolean {
  const { statusCode, code, message } = catalystErrorInfo(err);
  return (
    statusCode === 429 ||
    code === "TOO_MANY_REQUESTS" ||
    /concurrency limit reached/i.test(message)
  );
}

// -------------------------------------------------- Concurrency + retry

/**
 * Catalyst enforces a Data Store concurrency limit per app and rejects the
 * overflow outright:
 *
 *   {statusCode: 429, code: "TOO_MANY_REQUESTS",
 *    message: "Concurrency limit reached for the feature COMPONENT"}
 *
 * It is a hard rejection, not a queue — the call simply fails, and because the
 * failure is instant it surfaces as a fast 500 rather than a slow one, which
 * makes it read like a logic bug instead of back-pressure. Two endpoints hit
 * this in production (the deal list and the whole dashboard fan-out) once the
 * store had real data in it.
 *
 * So the app does the queueing the platform won't: at most `MAX_INFLIGHT`
 * Data Store operations are in flight per process, and anything the platform
 * still rejects is retried with exponential backoff and jitter. The cap is
 * deliberately below whatever the real ceiling is — AppSail runs up to 5
 * instances that each get their own limiter but share one platform budget, so
 * leaving headroom matters more than saturating it from one instance.
 */
const MAX_INFLIGHT = Number(process.env["CATALYST_MAX_CONCURRENT_DATASTORE"]) || 6;
const MAX_RETRIES = 4;

let inFlight = 0;
const waiting: Array<() => void> = [];

function acquire(): Promise<void> | null {
  if (inFlight < MAX_INFLIGHT) {
    inFlight++;
    return null;
  }
  return new Promise<void>((resolve) => waiting.push(resolve));
}

function release(): void {
  const next = waiting.shift();
  if (next) {
    // Hand the slot straight over rather than decrementing: releasing and
    // re-acquiring would let a caller that arrives in between jump the queue.
    // Because the slot is TRANSFERRED, `inFlight` is deliberately left alone
    // here and the woken caller must not increment it either — counting it on
    // both sides inflates `inFlight` by one per handoff, which quietly
    // degrades the limiter to serial execution under sustained load. (That
    // exact bug shipped once: a 20-endpoint cold fan-out went from 429s to
    // three 112-second timeouts, which reads like slowness rather than a
    // counting error. `holds every slot it is given` below pins it.)
    next();
    return;
  }
  inFlight--;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function withDataStoreSlot<T>(op: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const queued = acquire();
    // No `inFlight++` on this path — see `release()`: being woken IS the slot.
    if (queued) await queued;
    try {
      return await op();
    } catch (err) {
      if (attempt >= MAX_RETRIES || !isConcurrencyLimitError(err)) throw err;
    } finally {
      release();
    }
    // Backoff happens OUTSIDE the slot — holding one while sleeping would
    // starve the very callers whose completion frees up the platform budget.
    await sleep(100 * 2 ** attempt + Math.floor(Math.random() * 50));
  }
}

// -------------------------------------------------- Per-request read cache

/**
 * Per-request memoization of whole-table reads.
 *
 * The Row API has no WHERE clause, so every `repo.list(dealId)` is a full-table
 * read filtered in memory (see the module docstring). Assembling one deal's
 * intelligence touches ~25 tables, and the deal list assembles every deal — so
 * a single request re-read the same lookup tables dozens of times and issued
 * hundreds of Data Store calls, which is what exhausted the concurrency limit
 * above. Memoizing per request collapses that to one read per distinct table.
 *
 * Keyed on the `catalystApp` object, which `initCatalystApp(req)` mints fresh
 * per request, so the cache's lifetime is the request's — no cross-request
 * staleness is possible, and no repository signature has to change. A WeakMap
 * (not a field on the app) keeps this invisible to the SDK and lets the entry
 * be collected with the request. Note `initCatalystAdminApp` returns a
 * different object and so gets its own cache — correct, since the two scopes
 * can legitimately see different rows.
 *
 * The PROMISE is cached, not the result: 8 concurrent workers all wanting the
 * same table then share one in-flight read instead of stampeding it.
 */
const readCache = new WeakMap<object, Map<string, Promise<RawRow[]>>>();

function cacheFor(catalystApp: CatalystApp): Map<string, Promise<RawRow[]>> | null {
  if (typeof catalystApp !== "object" || catalystApp === null) return null;
  let byTable = readCache.get(catalystApp as object);
  if (!byTable) {
    byTable = new Map();
    readCache.set(catalystApp as object, byTable);
  }
  return byTable;
}

/**
 * Drop a table's memoized read after writing to it, so a read-after-write
 * inside the same request sees the write. Every mutating helper below calls
 * this; a new one that doesn't would reintroduce stale reads.
 */
function invalidateTable(catalystApp: CatalystApp, tableName: string): void {
  cacheFor(catalystApp)?.delete(tableName);
}

/**
 * Fetch every row in a table. Uses `getIterableRows()` (an async generator
 * that pages internally) rather than the deprecated `getAllRows()` (silently
 * capped at 200) or ZCQL (20-column/300-row SELECT caps). See the module
 * docstring above for why this is the primary access pattern, not a
 * fallback.
 */
export async function fetchAllRows(catalystApp: CatalystApp, tableName: string): Promise<RawRow[]> {
  const byTable = cacheFor(catalystApp);
  if (!byTable) return readAllRows(catalystApp, tableName);

  let pending = byTable.get(tableName);
  if (!pending) {
    pending = readAllRows(catalystApp, tableName);
    byTable.set(tableName, pending);
    // A failed read must not be memoized — otherwise one transient rejection
    // poisons the table for the rest of the request. Compare identity before
    // deleting so a retry that already replaced this entry survives.
    pending.catch(() => {
      if (byTable.get(tableName) === pending) byTable.delete(tableName);
    });
  }

  // Hand each caller its own array. The cached promise is shared, and repos
  // are free to sort/splice what they get back; without this copy the first
  // in-place sort would silently reorder every other caller's view.
  return (await pending).slice();
}

async function readAllRows(catalystApp: CatalystApp, tableName: string): Promise<RawRow[]> {
  return withDataStoreSlot(async () => {
    const table = getTable(catalystApp, tableName);
    const all: RawRow[] = [];
    for await (const row of table.getIterableRows()) {
      all.push(row as RawRow);
    }
    return all;
  });
}

export async function insertRow(
  catalystApp: CatalystApp,
  tableName: string,
  values: Record<string, unknown>,
): Promise<RawRow> {
  invalidateTable(catalystApp, tableName);
  return withDataStoreSlot(() => getTable(catalystApp, tableName).insertRow(values));
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
  invalidateTable(catalystApp, tableName);
  const table = getTable(catalystApp, tableName);
  const CHUNK = 100;
  const inserted: RawRow[] = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const result = (await withDataStoreSlot(
      () => table.insertRows(chunk) as Promise<RawRow[]>,
    )) as RawRow[];
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
  invalidateTable(catalystApp, tableName);
  return withDataStoreSlot(() =>
    getTable(catalystApp, tableName).updateRow({ ROWID: rowId, ...values }),
  );
}

export async function deleteRow(catalystApp: CatalystApp, tableName: string, rowId: string): Promise<void> {
  invalidateTable(catalystApp, tableName);
  await withDataStoreSlot(() => getTable(catalystApp, tableName).deleteRow(rowId));
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
    if (!isDuplicateValueError(err)) throw err;
    // Drop the memoized read first: the whole point of this branch is that
    // somebody else inserted the row after our lookup, so re-reading the
    // request-cached snapshot would return the same pre-insert view and this
    // retry would throw for the wrong reason.
    invalidateTable(catalystApp, tableName);
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
