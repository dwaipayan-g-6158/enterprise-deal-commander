# Catalyst Data Store constraints (measured) + architecture decision

Written during Slice 1 of the Catalyst port (see the approved plan). Two sources feed this
doc: (1) a scratch-table spike run directly against the live EDC project
(`31210000000639013`, Development) via the Catalyst MCP tools, and (2) a full read of the
sibling **Customer-Insight-Engine ("Periscope")** project's Data Store layer, which has been
running the same kind of migration successfully in production for months. (2) turned out to
matter more than (1) — it changes the target architecture, not just a few numbers.

## Architecture decision: Row API + in-memory joins, not ZCQL

**Periscope uses zero ZCQL at runtime.** Its entire data layer (`lib/db/src/sdk.ts` +
`repo.ts`) is built on the Data Store **Row API**'s `getIterableRows()` — an async generator
that pages internally with no row cap — plus in-memory filter/sort/join/aggregate in
TypeScript. There is no query builder, no ZCQL `WHERE`, and critically **no 20-column /
300-row ZCQL SELECT limit to work around**, because ZCQL is never used for reads. ZCQL only
appears once in that whole codebase, as a one-off manual backfill run through the MCP
`Execute_Query` tool, with an explicit note that ZCQL would have needed `LIMIT offset, 300`
paging if it had been used for anything routine.

This is a materially safer approach than my original plan (ZCQL `SELECT` + a `fetchAll()`
pagination helper), because it has been proven in production against the same platform, at a
comparable table count, by the same team. **Slice 1b and Slice 3 adopt it as the primary data
access pattern for Deal Commander:**

- A `fetchAllRows(catalystApp, tableName)` helper wraps `table.getIterableRows()` (never the
  deprecated `getAllRows()`, which silently caps at 200).
- Every repository method does a full-table read + in-memory `.filter()`/`.sort()`/`.map()`,
  matching Deal Commander's actual scale (the seed data tops out at 12 demo deals, 108 gate
  rows, 33 competitors — all comfortably "tens to low hundreds of rows" territory, the same
  regime Periscope validated this pattern against).
- Joins become a `Map` built from a second `fetchAllRows()` call and looked up by key (see
  Periscope's `growth/pipeline` route for the canonical shape). Aggregates (`GROUP BY`,
  `COUNT`, `SUM`, percentiles) become `.reduce()`/`.filter().length` over the in-memory array
  — Deal Commander already computes percentiles in JS (`lib/memory-intel.ts`), so this is
  consistent with existing code, not a new style.
- ZCQL is reserved for the rare case a table's row count could plausibly exceed a few
  thousand (none currently do) — and if that ever changes, it goes through ZCQL with
  mandatory `LIMIT offset, 300` paging, exactly as originally planned as a fallback.

This also **changes the FK-cascade plan**. Periscope does not rely on Data Store's native
`foreign key` column type for cascade behavior at all — every cascade delete is done as an
explicit, ordered, fail-fast JS sequence (children first, parent last, so a failure mid-cascade
leaves a re-runnable delete rather than an orphaned graph). Given that's the only
production-proven pattern available, Deal Commander's ~40 `ON DELETE CASCADE`/`SET NULL`
constraints will be ported the same way — as ordered cascade-delete functions in the
repository layer — rather than gambling on the native FK constraint's untested-at-scale
cascade behavior. (The native FK column type still exists and passed a quick smoke check;
we're simply choosing not to depend on it for correctness, matching the proven precedent.)

## Spike findings (measured directly against project 31210000000639013)

Scratch table `zzz_constraint_spike` (table_id `31210000000628019`), created and deleted in
this session.

| Question | Finding | Evidence |
|---|---|---|
| Reserved column names | **`priority` is rejected** (`INVALID_OPERATION: Column name cannot contain reserved keywords`). `amount` is fine. | Direct `Create_Column` calls |
| Text column length cap | **10,000 chars, enforced at schema declaration time** — creating a `text` column with no explicit length silently comes back with `"max_length": 10000` in the API response, matching Periscope's documented `INLINE_THRESHOLD` (9,800 bytes, kept under 10,000 to allow for UTF-8 multi-byte margin). | `Create_Column` response for `big_text` |
| Single-column UNIQUE enforcement | **Enforced cleanly** — a duplicate insert against a unique varchar rejects with `DUPLICATE_VALUE`, not silently. This is exactly what the `upsert()` helper (lookup-by-natural-key → insert-or-update) depends on. | Duplicate insert into `natural_key` |
| System columns on every table | `ROWID` (bigint), `CREATORID` (bigint, search-indexed by default), `CREATEDTIME` / `MODIFIEDTIME` (datetime, search-indexed by default) are added automatically — matches Periscope's documented `CREATEDTIME`/`MODIFIEDTIME` string format quirk (`"YYYY-MM-DD HH:MM:SS:mmm"`, colon not period before milliseconds) that its `parseCatalystDateTime()` helper works around. Deal Commander's DB seam will port that parser verbatim. | `Delete_Table` response (full column dump) |
| ZCQL 20-column / 300-row SELECT caps | **Not measured directly** — moot per the architecture decision above; Deal Commander's repository layer won't issue ZCQL SELECTs for routine reads. | — |
| Native FK `ON-DELETE-CASCADE` | Column type accepted by the schema API; **not load-tested**, and not depended upon — see architecture decision above. | `Create_Column` schema (discriminated union) |
| ZCQL OLAP `GROUP BY` | **Not measured** — superseded; aggregates are computed in JS over `fetchAllRows()` results, matching Periscope and Deal Commander's existing percentile code. | — |

## Other Periscope-proven patterns being adopted for the port

These aren't Slice 1 work, but are recorded here so Slice 2/3's design doesn't have to
rediscover them:

- **`jsonb`/`text[]` columns** → `*_json` Text columns via `toJson`/`fromJson(raw, fallback)`
  helpers (JSON.stringify/parse with a safe fallback on parse failure).
- **Numeric columns can echo back the literal string `"NaN"`** when a numeric column was
  never written on insert — `parseNullableNumber()` must check `Number.isFinite`, not just
  truthiness.
- **`""` is accepted as "no value" only for `varchar`/`text`.** `int`/`double`/`date`/
  `datetime` columns reject `""` outright with `INVALID_INPUT` — omit the key entirely
  instead of writing `""`, and use a three-way `undefined` (don't touch) / `null` (clear) /
  value (set) convention in every row-writer function.
- **Booleans** are encoded either as `Int` `0`/`1` or as a literal-string `varchar` ("true"/
  "false") depending on which the original Postgres boolean's usage pattern was — decide per
  column during Slice 2's schema manifest, not globally.
- **Large/unbounded text fields** (Deal Commander's biggest is `deal_snapshots.payload`, a
  full serialized deal+gates+governance blob) need the dual-column pattern:
  `<field>_inline` (Text, used when ≤ ~9,800 bytes) + `<field>_key` (Varchar, a Stratus object
  key, used above that threshold) — exactly one populated per row. This is Slice 5 (Stratus)
  work, flagged here because the schema manifest in Slice 2 needs to reserve both columns
  wherever a payload could plausibly exceed the inline threshold.
- **No transactions, no row locks.** Substitutes, in order of applicability: ordered
  cascade-delete + fail-fast (children first); compensating deletes for two-phase
  writes (e.g. Stratus-then-row); an in-process per-key async mutex (`withLock`) for
  read-modify-write races like `MAX(version)+1` allocation — explicitly only correct on a
  single AppSail instance, which is the assumption Slice 5's job-scheduling design already
  makes for the same reason (the in-process cache and event bus).
- **Local dev cannot reach the Data Store at all** — Catalyst Native Auth's session/iframe
  flow and the Data Store SDK both require a real `*.catalystappsail.in` domain. Periscope's
  answer was to make local dev a UI-only harness (a separate local route tree, disabled
  `/api/auth/me` query) and accept that data flows are only verified against the deployed
  app. Deal Commander will need the same trade-off — flagged here for Slice 3/6 planning, not
  resolved in Slice 1.
- **Freshly created Data Store tables default to Select-only for the App User role.** Any
  table the app needs to write to as an ordinary authenticated user needs an explicit Console
  permission grant (Insert/Update/Delete) per environment after creation — easy to forget and
  silently blocks writes with a 403. Slice 2's post-creation checklist must include this per
  table.
