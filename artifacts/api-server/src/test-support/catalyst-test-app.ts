/**
 * An in-memory Catalyst Data Store, good enough to run the real routes against.
 *
 * Why this exists: after the Catalyst migration ~94 route tests were skipped
 * with the note "Data Store isn't reachable from localhost". That diagnosis was
 * wrong. Nothing in a route test needs to reach Catalyst — routes only ever
 * touch the platform through `catalystApp.datastore().table(name)`. What
 * actually broke them is narrower and entirely fixable: `initCatalystApp(req)`
 * calls `require("zcatalyst-sdk-node")`, a package that resolves only from
 * `lib/db` and not from this package, via a `require` that does not exist in
 * Vitest's ESM context. Injecting a stand-in through
 * `__setCatalystSdkForTests` removes the whole problem, and the tests then
 * exercise the real handlers, the real repositories and the real row coercion.
 *
 * Fidelity notes — these matter, because a fake that is too forgiving tests
 * nothing:
 *  - Rows are stored exactly as Data Store returns them: a flat map of STRING
 *    values (plus `ROWID`). Anything a repo writes goes through `String()`, so
 *    a repo that forgets to serialise gets the same wrong answer it would in
 *    production rather than a conveniently-typed object.
 *  - `initialize()` hands back a NEW app object each call while sharing one
 *    store, mirroring production: `sdk.ts` keys its per-request read cache on a
 *    `WeakMap` over that object, so a fresh object per call is what makes each
 *    simulated request get its own cache — exactly as a real request does.
 *  - Unknown column names are REJECTED with Data Store's own error shape. This
 *    is deliberate: writing to a column that does not exist is precisely the
 *    bug that made every autopsy save 500 in production
 *    (`v2_deal_memory.key_lessons`), and it was invisible locally. A fake that
 *    accepts any key would keep it invisible. Columns are learned from whatever
 *    is seeded, so a table seeded with at least one row is schema-checked.
 *  - Errors are thrown as PLAIN OBJECTS, never `Error` instances, matching the
 *    real SDK (see catalystErrorInfo in sdk.ts).
 */
import { __setCatalystSdkForTests } from "@workspace/db/catalyst";
import { DATASTORE_COLUMNS } from "./datastore-columns.generated";

export type FakeRow = Record<string, string>;

/** A Data Store rejection: a plain object, deliberately not an Error. */
function rejection(statusCode: number, code: string, message: string): unknown {
  return { statusCode, code, message };
}

interface FakeTable {
  rows: FakeRow[];
  /** Known column names; null means "not schema-checked" (nothing seeded yet). */
  columns: Set<string> | null;
  uniques: Set<string>;
}

export interface RecordedInvite {
  email: string;
  firstName: string;
  lastName: string;
  redirectUrl: string;
}

export class CatalystTestStore {
  private tables = new Map<string, FakeTable>();
  private nextRowId = 1;

  /**
   * Catalyst's own user directory (`userManagement()`), recorded rather than
   * called. This is what makes POST /users testable at all: the real handler
   * invites through Catalyst before it writes the commanders row, and a real
   * invite provisions an account and sends mail to a real address — not
   * something a test may do. Everything else about the handler (duplicate
   * detection, the invite-fails-so-no-row-is-written ordering, the audit entry)
   * is exercised for real.
   */
  readonly invites: RecordedInvite[] = [];
  readonly deletedUserIds: string[] = [];
  private nextUserId = 1;
  private inviteFailure: unknown = null;

  /** Make the next `registerUser` reject, the way Catalyst does on a bad email. */
  failNextInvite(err: unknown = rejection(400, "INVALID_INPUT", "Email already registered")): void {
    this.inviteFailure = err;
  }

  private table(name: string): FakeTable {
    let t = this.tables.get(name);
    if (!t) {
      t = { rows: [], columns: null, uniques: new Set() };
      this.tables.set(name, t);
    }
    return t;
  }

  /**
   * Declare a table's columns (and optionally its unique columns) without
   * inserting rows, so an empty table is still schema-checked on write.
   */
  declare(name: string, columns: string[], uniques: string[] = []): void {
    const t = this.table(name);
    t.columns = new Set([...columns, "ROWID"]);
    for (const u of uniques) t.uniques.add(u);
  }

  /**
   * Mark columns unique so inserts/updates raise Data Store's `DUPLICATE_VALUE`.
   * Opt-in per test: uniqueness is not derivable from the column dump, and
   * declaring it everywhere would make unrelated fixtures fail on collisions
   * they don't care about.
   */
  declareUnique(name: string, columns: string[]): void {
    const t = this.table(name);
    for (const c of columns) t.uniques.add(c);
  }

  /**
   * Insert raw rows exactly as Data Store would hold them.
   *
   * Column-checked like a real write. This originally was not, and a fixture
   * seeding `stage_order` (the column is `sort_order`) sailed through — the
   * route then read `undefined`, silently skipped its stage-advancement
   * guardrail, and the test "passed" while asserting nothing. A fake that
   * validates writes but not fixtures just moves the blind spot.
   */
  seedRaw(name: string, rows: Array<Record<string, unknown>>): void {
    const t = this.table(name);
    for (const row of rows) {
      this.assertColumns(name, row);
      const stored = this.toStored(row);
      if (!t.columns) t.columns = new Set([...Object.keys(stored), "ROWID"]);
      stored["ROWID"] ??= String(this.nextRowId++);
      t.rows.push(stored);
    }
  }

  rows(name: string): FakeRow[] {
    return this.table(name).rows.map((r) => ({ ...r }));
  }

  /**
   * Set columns on already-stored rows, for fixture state no repository method
   * exposes (a soft-deleted deal, say). Still column-checked, so a typo fails
   * rather than quietly creating a field nothing reads. Returns rows touched.
   */
  patchRaw(name: string, match: (row: FakeRow) => boolean, values: Record<string, unknown>): number {
    this.assertColumns(name, values);
    let touched = 0;
    for (const row of this.table(name).rows) {
      if (!match(row)) continue;
      touched++;
      for (const [k, v] of Object.entries(values)) {
        if (v === undefined || v === null) delete row[k];
        else row[k] = String(v);
      }
    }
    return touched;
  }

  count(name: string): number {
    return this.table(name).rows.length;
  }

  reset(): void {
    this.tables.clear();
    this.nextRowId = 1;
    this.invites.length = 0;
    this.deletedUserIds.length = 0;
    this.nextUserId = 1;
    this.inviteFailure = null;
    this.declareFromLiveSchema();
  }

  /**
   * Declare every table's real column set, so an unknown column is rejected
   * here exactly as Data Store rejects it. Unique columns are NOT derived —
   * declare those per-test where a test cares about duplicate handling.
   */
  declareFromLiveSchema(): void {
    for (const [table, columns] of Object.entries(DATASTORE_COLUMNS)) {
      this.declare(table, [...columns]);
    }
  }

  private toStored(values: Record<string, unknown>): FakeRow {
    const out: FakeRow = {};
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined || v === null) continue; // Data Store omits nulls
      out[k] = String(v);
    }
    return out;
  }

  private assertColumns(name: string, values: Record<string, unknown>): void {
    const t = this.table(name);
    if (!t.columns) return;
    for (const key of Object.keys(values)) {
      if (values[key] === undefined) continue;
      if (!t.columns.has(key)) {
        throw rejection(400, "INVALID_INPUT", `Invalid column name ${key}`);
      }
    }
  }

  private assertUnique(name: string, values: Record<string, unknown>, ignoreRowId?: string): void {
    const t = this.table(name);
    for (const col of t.uniques) {
      const incoming = values[col];
      if (incoming === undefined || incoming === null) continue;
      const clash = t.rows.some((r) => r["ROWID"] !== ignoreRowId && r[col] === String(incoming));
      if (clash) {
        throw rejection(400, "DUPLICATE_VALUE", `Duplicate value for column ${col}`);
      }
    }
  }

  /** The object `initCatalystApp(req)` resolves to. New per call, shared store. */
  createApp(): unknown {
    const store = this;
    return {
      userManagement: () => ({
        async registerUser(
          config: { platform_type: string; redirect_url: string },
          details: { first_name: string; last_name: string; email_id: string },
        ) {
          if (store.inviteFailure) {
            const err = store.inviteFailure;
            store.inviteFailure = null;
            throw err;
          }
          store.invites.push({
            email: details.email_id,
            firstName: details.first_name,
            lastName: details.last_name,
            redirectUrl: config.redirect_url,
          });
          return {
            user_details: {
              user_id: String(1000 + store.nextUserId++),
              email_id: details.email_id,
              first_name: details.first_name,
              last_name: details.last_name,
            },
          };
        },
        async deleteUser(userId: string) {
          store.deletedUserIds.push(String(userId));
        },
      }),
      datastore: () => ({
        table: (name: string) => ({
          async *getIterableRows(): AsyncGenerator<FakeRow> {
            for (const row of store.table(name).rows) yield { ...row };
          },
          async insertRow(values: Record<string, unknown>): Promise<FakeRow> {
            store.assertColumns(name, values);
            store.assertUnique(name, values);
            const t = store.table(name);
            const stored = store.toStored(values);
            stored["ROWID"] = String(store.nextRowId++);
            t.rows.push(stored);
            return { ...stored };
          },
          async updateRow(values: Record<string, unknown>): Promise<FakeRow> {
            const rowId = String(values["ROWID"]);
            const t = store.table(name);
            const existing = t.rows.find((r) => r["ROWID"] === rowId);
            if (!existing) throw rejection(404, "NOT_FOUND", `No row ${rowId} in ${name}`);
            const { ROWID: _ignored, ...rest } = values;
            store.assertColumns(name, rest);
            store.assertUnique(name, rest, rowId);
            for (const [k, v] of Object.entries(rest)) {
              if (v === undefined) continue;
              if (v === null) delete existing[k];
              else existing[k] = String(v);
            }
            return { ...existing };
          },
          async deleteRow(rowId: string | number): Promise<void> {
            const t = store.table(name);
            const idx = t.rows.findIndex((r) => r["ROWID"] === String(rowId));
            if (idx >= 0) t.rows.splice(idx, 1);
          },
        }),
      }),
    };
  }
}

export interface InstalledCatalystFake {
  store: CatalystTestStore;
  /** A request-like object routes can be handed; carries no real headers. */
  req: () => { headers: Record<string, string> };
}

/**
 * Point `initCatalystApp`/`initCatalystAdminApp` at an in-memory store for the
 * rest of the process. Call `store.reset()` between tests.
 */
/**
 * The lookup rows almost every route joins against, matching the real seeded
 * ids and names (verified against the deployed app, 2026-08-07). Most fixtures
 * want these and nothing else, and getting a stage name or id wrong makes a
 * test assert something subtly different from production.
 *
 * `engine_thresholds` is deliberately NOT seeded: `getThresholds` starts from
 * DEFAULT_THRESHOLDS and only overlays whatever rows exist, so an empty table
 * gives a test the same engine configuration a fresh install has.
 */
export const STAGES = {
  Discovery: 1,
  Validation: 2,
  Commercial: 3,
  Procurement: 4,
  "Closed-Won": 5,
  "Closed-Lost": 6,
} as const;

/**
 * The real pricing models and services tiers, ids included. Several tests
 * select one by NAME — "Multi-Year Committed" in particular, because it is the
 * one whose TCV is `productRevenue * contractTermYears + servicesRevenue`
 * rather than a flat sum — so seeding a single made-up row is not enough.
 */
export const PRICING_MODELS = {
  "Annual Subscription": 1,
  "Multi-Year Committed": 2,
  "Perpetual License": 3,
  "Usage-Based": 4,
} as const;

export const SERVICES_TIERS = {
  None: 1,
  "Professional Services Pitched": 2,
  "Premium Support Pitched": 3,
  "Combined SOW Shared": 4,
  "Online Onboarding": 5,
  "Onsite Onboarding": 6,
  "Product Training": 7,
} as const;

/** Convenience defaults for fixtures that don't care which one they get. */
export const PRICING_MODEL_ID = PRICING_MODELS["Annual Subscription"];
export const SERVICES_TIER_ID = SERVICES_TIERS.None;

export function seedStandardLookups(store: CatalystTestStore): void {
  store.seedRaw(
    "pipeline_stages",
    // `sort_order`, NOT `stage_order` — the stage-advancement guardrail reads
    // it, and getting the name wrong makes `isAdvancing` false, which silently
    // disables the guardrail instead of failing.
    Object.entries(STAGES).map(([stage_name, id]) => ({
      id: String(id),
      stage_name,
      sort_order: String(id),
      is_active: "true",
    })),
  );
  store.seedRaw(
    "pricing_models",
    Object.entries(PRICING_MODELS).map(([model_name, id]) => ({
      id: String(id),
      model_name,
      is_active: "true",
    })),
  );
  store.seedRaw(
    "services_tiers",
    Object.entries(SERVICES_TIERS).map(([tier_name, id]) => ({
      id: String(id),
      tier_name,
      is_active: "true",
    })),
  );
}

export function installCatalystFake(): InstalledCatalystFake {
  const store = new CatalystTestStore();
  store.declareFromLiveSchema();
  __setCatalystSdkForTests({
    initialize: () => store.createApp(),
  });
  return { store, req: () => ({ headers: {} }) };
}
