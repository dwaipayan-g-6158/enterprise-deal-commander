# Catalyst Data Store schema — Deal Commander

Source of truth for how the 71-table Postgres/Drizzle schema
(`lib/db/src/schema/{auth,lookups,deals,edc_v2,edc_v2_intel,settings}.ts`) maps onto Zoho
Catalyst Data Store, created in project **EDC** (`31210000000639013`, org `60066539659`,
India DC, Development environment) during Slice 2 of the Catalyst port. See
`docs/catalyst-datastore-constraints.md` for the measured platform constraints this design
works around, and the approved plan
(`C:\Users\dGiri\.claude\plans\peppy-yawning-wilkinson.md`) for the overall migration.

Read the table lookup convention section before writing any repository code in Slice 3 —
several columns don't exist under the name you'd guess from the Drizzle schema.

## Naming convention

- Tables from the Postgres `public` schema (`auth.ts`, `lookups.ts`, `deals.ts`) keep their
  original name: `commanders`, `pipeline_stages`, `enterprise_deals`, etc. — 32 tables.
- Tables from the Postgres `edc_v2` schema (`edc_v2.ts`, `edc_v2_intel.ts`, `settings.ts`) are
  flattened with a `v2_` prefix, since Data Store has no schema/namespace concept: e.g.
  `edc_v2.deal_scores` → `v2_deal_scores`. — 39 tables.
- 32 + 39 = **71 tables total**, matching the Drizzle schema exactly. Look up a table by name
  via the Data Store SDK's `catalystApp.datastore().table(tableName)` (Periscope's pattern) —
  never hardcode a `table_id`; it differs across environments (Development vs. Production get
  different numeric IDs even for the same table name), same reasoning as
  `lib/db/src/catalystConfig.ts` in the sibling Customer-Insight-Engine project.

## Type mapping

| Postgres / Drizzle type | Data Store type | Notes |
|---|---|---|
| `uuid` (primary key) | `varchar(36)`, column named `id`, unique, mandatory | See "Identity" below — populated with `crypto.randomUUID()` at write time (Slice 3), not a DB-side default. |
| `uuid` (foreign key reference) | `varchar(36)`, plain (not unique) | Holds the referenced row's `id` (uuid tables) or `ROWID` string (serial-PK lookup tables) — see "Identity". |
| `serial` (primary key on lookup tables) | *(no explicit column)* | Data Store's own `ROWID` (bigint, auto-managed) is the identity. See "Identity" below. |
| `varchar(n)` | `varchar`, `max_length: n` | Carried over as-is; nothing in this schema exceeded Data Store's varchar ceiling. |
| `text` | `text` | **Hard 10,000-char cap**, enforced at schema-declaration time (confirmed live). `deal_snapshots` has a dual `payload_inline`/`payload_key` pair for the one field known to exceed this — see "Large text fields" below. |
| `integer` / `smallint` | `int` | |
| `numeric(p, s)` | `double`, `decimal_digits: s` | **`decimal_digits` silently clamps to 4** even if you request more (confirmed live: `fx_rates.rate`, originally `numeric(18,8)`, came back as `decimal_digits: 4`). Every other numeric column in this schema uses ≤4 decimal places, so this only affects FX rate precision. |
| `boolean` | `boolean` | Native boolean type — no int/varchar encoding needed (Data Store supports it directly, confirmed live). |
| `timestamp` (with tz) | `datetime` | Reads come back `"YYYY-MM-DD HH:MM:SS:mmm"` (colon before ms) — use `parseCatalystDateTime()`/`formatCatalystDateTime()` from `lib/db/src/catalyst/sdk.ts`. |
| `date` | `date` | |
| `jsonb` | `text` | JSON-serialized via `toJson()`/`fromJson()` — 10,000-char cap applies. |
| `text[]` (array) | `text` | JSON-serialized array, same helpers, same cap. |
| CHECK constraints | *(not represented)* | Enforced in Zod at the repository boundary in Slice 3 (e.g. `gate_group BETWEEN 1 AND 5`, `role IN ('admin','reader')`). |
| Composite UNIQUE / composite PK | synthesized `natural_key` `varchar`, unique | See "Natural keys" below. |
| `ON DELETE CASCADE` / `SET NULL` | *(not represented natively)* | **Deliberately not using Data Store's native `foreign key` column type** — see `docs/catalyst-datastore-constraints.md`'s architecture-pivot section. Cascades are explicit, ordered, fail-fast JS deletes in the Slice 3 repository layer (children before parent), matching the proven pattern in the sibling Customer-Insight-Engine project. |

## Identity: `id` column vs. `ROWID`

Two different identity strategies, matching how the original schema uses two different PK
styles:

- **UUID-PK tables** (the great majority — `enterprise_deals`, `deal_technical_gates`, every
  `v2_*` table, etc.) get an explicit `id varchar(36)` column, unique + mandatory, populated
  with `crypto.randomUUID()` when a row is inserted (Slice 3). This preserves the exact UUID
  contract the frontend, generated Zod schemas, and OpenAPI spec already expect — Data Store's
  own `ROWID` (bigint) exists on every table too, but stays purely internal (used only for
  `updateRow`/`deleteRow` calls), same separation Periscope uses.
- **Serial-PK lookup tables** (the 17 tables in `lookups.ts` originally declared
  `id: serial("id").primaryKey()` — `pipeline_stages`, `pricing_models`, `services_tiers`,
  `team_members`, `segments`, `deal_types`, `ad360_features`, `competitors`,
  `compliance_drivers`, `blocker_categories`, `blocker_severities`, `loss_archetypes`,
  `gate_definitions`, `engine_thresholds`, `fx_rates`, `competitor_battlecards`,
  `intervention_checklists`) get an explicit `id int`, unique + mandatory, populated via a
  **`nextAppId()`-style max+1 read before insert** (Periscope's proven pattern) —
  **correction from an earlier draft of this doc**, which proposed using Data Store's own
  `ROWID` directly as the identity. That doesn't work: `ROWID` is a bigint that routinely
  exceeds `Number.MAX_SAFE_INTEGER` (confirmed live — this project's own table/column/row IDs
  are ~17-digit numbers, `Number.MAX_SAFE_INTEGER` is 16 digits), and the generated API types
  declare these ids as `number` (e.g. `PricingModel.id: number`, confirmed in
  `lib/api-zod/src/generated/types/pricingModel.ts`) — exposing `ROWID` through that contract
  would silently corrupt ids via floating-point rounding. A small `nextAppId()` counter is
  safe at this app's scale (dozens of rows per lookup table) and preserves the numeric `id`
  contract exactly, with zero API/frontend changes needed. `int` unique columns don't count
  against the "max 2 unique varchar per table" cap either, so this was free to add.
  - `product_catalog` is the one exception in `lookups.ts` — it's `uuid`-PK in the original
    schema (not `serial`), so it follows the UUID-PK convention above (explicit `varchar(36)
    id` column).

Foreign-key-shaped columns (e.g. `enterprise_deals.sales_stage_id`) are plain `varchar`
columns holding whichever identity the referenced table uses — a `ROWID` string for the 17
serial-PK lookup tables, a uuid `id` string for everything else.

## Natural keys (composite UNIQUE / composite PK replacements)

Data Store has no composite UNIQUE constraint and no `ON CONFLICT`. Every table whose Drizzle
schema declared a composite `unique(...)` or a composite `primaryKey({ columns: [...] })` got
a synthesized `natural_key varchar`, unique, optional — populated at write time (Slice 3) by
joining the composite key's parts with `:`, and looked up via the shared `upsert()` helper in
`lib/db/src/catalyst/sdk.ts`. 22 tables have one:

| Table | Natural key composition | Original Drizzle constraint |
|---|---|---|
| `fx_rates` | `baseCurrency:quoteCurrency:asOf` | `fx_rates_unique` |
| `intervention_checklists` | `triggerPatternCode:name` | `intervention_unique` |
| `enterprise_deals` | `accountName:dealName` | `deals_account_deal_unique` |
| `deal_technical_gates` | `dealId:gateCode` | `gates_deal_gate_unique` |
| `deal_cross_sells` | `dealId:productId` | composite PK |
| `deal_compliance_drivers` | `dealId:complianceDriverId` | composite PK |
| `deal_product_interests` | `dealId:productId` | composite PK |
| `deal_ad360_features` | `dealId:featureId` | composite PK |
| `deal_alert_dispositions` | `dealId:patternCode` | `dispositions_deal_pattern_unique` |
| `v2_pipeline_transitions` | `dealId:transitionedAt` | `transitions_natural_key` |
| `v2_pipeline_targets` | `periodType:periodStart` | `targets_period_unique` |
| `v2_deal_competitors` | `dealId:competitorId` | `deal_competitor_uq` |
| `v2_custom_pattern_conditions` | `patternId:sortOrder` | `custom_condition_order_uq` |
| `v2_playbook_steps` | `playbookId:stepOrder` | `playbook_step_order_uq` |
| `v2_deal_playbook_assignments` | `dealId:playbookId` | `deal_playbook_assignment_uq` |
| `v2_deal_pricing_schedule` | `dealId:yearNumber` | `pricing_year_uq` |
| `v2_custom_field_values` | `dealId:fieldId` | `custom_field_value_uq` |
| `v2_deal_tags` | `dealId:tagId` | `deal_tag_pk` (composite PK) |
| `v2_deal_meddpicc_answers` | `dealId:questionId` | `deal_meddpicc_answer_uq` |
| `v2_automation_actions` | `ruleId:sortOrder` | `automation_actions_rule_sort_uq` |

Single-column uniques that Drizzle already declared (`commanders.username`,
`pipeline_stages.stage_name`, `meddpicc_questions.question_order`, `deal_review_markers.deal_id`,
`v2_deal_memory.deal_id`, `v2_tag_definitions.tag_name`, `v2_custom_field_definitions.field_key`,
every lookup table's name-ish column, etc.) map directly onto Data Store's native
`is_unique: true`, no synthesized key needed.

## Discovered platform limits that shaped this schema

Full detail in `docs/catalyst-datastore-constraints.md`; the two most consequential ones,
found live while creating this schema (not documented anywhere beforehand):

1. **Max 2 unique `varchar` columns per table.** A 3rd `is_unique: true` varchar column on
   the same table fails with `INVALID_OPERATION: Reached max number of columns of Unique
   varchar type` — confirmed by reproducing it on `product_catalog` (which needed `id` + `code`
   + `product_name` all unique). Resolution used throughout this schema: every table has at
   most 2 unique varchar columns (typically `id` + `natural_key`, or just `id`/just
   `natural_key` where only one is needed). Where a 3rd column would have been business-unique
   (`product_catalog.product_name`), its `is_unique` flag was dropped — enforce that rule in
   Zod at the repository boundary instead if it matters later. Unique columns of other types
   (e.g. `v2_meddpicc_questions.question_order`, an `int`) do **not** count against this cap.
2. **`decimal_digits` on `double` columns silently clamps to 4.** See the type-mapping table
   above.

## Large text fields (Stratus offload candidates)

`v2_deal_snapshots` has `payload_inline` (`text`) + `payload_key` (`varchar(255)`) instead of a
single `payload` column — `deal_snapshots.payload` is the one field flagged in
`docs/catalyst-datastore-constraints.md` as certain to exceed the 10,000-char cap (a full
serialized deal + gates + governance blob). Exactly one of the pair should be populated per
row, matching the proven pattern in the sibling Customer-Insight-Engine project: inline when
the serialized payload fits under the cap, else written to Stratus with the object key
recorded in `payload_key`. Wiring the actual Stratus read/write path is **Slice 5 scope** — the
columns exist now so Slice 3's snapshot-writing code doesn't need a later schema migration.

If any other field turns out to exceed 10,000 chars once real data flows through (Slice 6
testing), the same dual-column pattern applies — this schema doesn't attempt to predict every
such field in advance.

## Table permissions

Confirmed live: freshly created Data Store tables default to Select-only for the "App User"
role (App Administrator gets full CRUD by default) — same pattern the sibling
Customer-Insight-Engine project's docs warned about. **All 71 tables in this project have
since been granted full Select/Insert/Update/Delete for App User**, via
`PUT /baas/v1/project/{projectId}/table/{tableId}/permission` with body
`{"App User": ["SELECT","UPDATE","INSERT","DELETE"]}` (verified: persists across a hard
reload, spot-checked on `enterprise_deals` and `v2_deal_memory` in the console UI). This is a
uniform baseline chosen so Slice 3's write paths aren't blocked by spurious 403s — with the
one exception below, which Slice 4 closed out.

### `commanders` is Select-only for App User (Slice 4 closeout, done)

`commanders` holds the admin/reader role for every account, so it is the one table where
"any App User may write" is a genuine privilege-escalation shape: EDC's admin/reader split is
an *application* role stored in this table, and to Catalyst both kinds of user are the same
"App User" — table permissions cannot tell them apart. It is now
**Select / no Update / no Insert / no Delete** for App User (App Administrator keeps full
CRUD), verified persisted across a hard reload.

Every write to the table therefore goes through `initCatalystAdminApp` (`lib/auth.ts`'s
`resolveCommander`, all three handlers in `routes/users.ts`, and
`routes/auth.ts`'s dashboard-visit). Reads stay user-scoped and still work.

Two things worth knowing if this is ever revisited:

- `routes/auth.ts`'s `touchDashboardVisit` was the last user-scoped **write** on this table,
  and it is an UPDATE dressed up as a read-ish "record a visit" call. Under the old permissive
  baseline it worked anyway, so nothing surfaced until the permission was actually tightened.
  Grep for `initCatalystApp` against a restricted table's repo before assuming reads are all
  that's left.
- `v2_settings_change_log` was flagged alongside `commanders` in Slice 2 and is deliberately
  **not** tightened. Its writes come from `logSettingsChange`, which takes an already-built
  `catalystApp` (not a `req`) and is called with the user-scoped app from `routes/lookups.ts`,
  `routes/settings-audit.ts`, `routes/v2/config.ts`, and `routes/v2/crud.ts`. Tightening it
  means changing that helper's contract across all four, which is a larger change than the
  risk warrants right now — the RBAC gate already restricts who can reach those routes.

## Known open items for later slices

- **Full-text search fields — RESOLVED (2026-08-06): stays an in-memory JS scan.** The
  `Create_Column` API's `search_index_enabled` flag is only exposed for
  `varchar`/`int`/`double`/`bigint`/`date`/`datetime`, **not** for `text` — and
  `v2_deal_memory.win_loss_narrative`/`loss_narrative`, the fields `/v2/memory/search` and
  `/v2/memory/ask` exist to search, are `text`. Catalyst Search therefore cannot index the one
  thing that needs indexing, so it is not a candidate here regardless of data volume. The scan
  lives in `artifacts/api-server/src/lib/memory-search.ts`, which mirrors the tsvector's field
  list and A/B/C/D weights and is unit-tested. Revisit only if a future Catalyst release
  exposes the flag for `text`.
- **CHECK constraints — RESOLVED (2026-08-07), and smaller than the plan assumed.** There are
  **7**, not 10, and the right home for them is the **API boundary**, not the repository
  boundary: every write reaches Data Store through a Zod-validated route, so a repo-level
  check would only duplicate that one layer deeper.
  - Already enforced by `openapi.yaml` before any of this work: `product_revenue_nonneg` and
    `services_revenue_nonneg` (`minimum: 0`), `contract_term_min` (`minimum: 1`, and the spec
    is stricter with `maximum: 10`), and `disposition_state`
    (`enum: [acknowledge, accept, snooze]`).
  - `gate_group_range` needs no code: `gate_definitions` has **no write route** — it is
    seed-only.
  - The two real gaps, now closed in the spec: `win_probability_range`
    (`minimum: 0, maximum: 100`) and `fx_rate_positive` (`exclusiveMinimum: 0`). Covered by
    `artifacts/api-server/src/routes/deals.validation.test.ts`, which asserts both the
    rejections and the accepted boundaries.

## A table this document missed: `v2_deal_decisions`

The Decision Log's table was provisioned, is written by
`artifacts/api-server/src/routes/v2/crud.ts` and read by the Decisions panel on both shells, and
was documented nowhere here — it appears in neither the table count above nor the natural-key
list. Recorded now, because in a hand-maintained Data Store an undocumented table is one nobody
knows to create in a new environment.

Columns (introspected, and matching
`artifacts/api-server/src/test-support/datastore-columns.generated.ts`):
`id`, `deal_id`, `meeting_session_id`, `decision_text`, `rationale`, `owner`, `status`,
`decided_at`, `due_date`, `completed_at`, `commander_id`, `created_at`, `updated_at`.

Two things worth knowing before touching it:

- **No `natural_key`.** Unlike most child tables there is no uniqueness constraint — a decision
  is an event, and the same text can legitimately be logged twice.
- **`status` is free text in the contract**, typed `{ type: string }` in `openapi.yaml` with no
  enum. The repository writes `"Pending"` on create and stamps `completed_at` on exactly
  `"Completed"`, so the casing is load-bearing while nothing enforces it. The frontend now names
  the four values once in `artifacts/edc/src/lib/decision-status.ts`; use it rather than
  re-typing the literal. The mobile panel previously compared against lowercase `"completed"`,
  which no row has ever held, and its Completed section could therefore never populate.

Confirmed empty in Development on 2026-08-12 — which is why the Decisions panel showed nothing.
Nothing seeded it: `POST /admin/seed` skipped the table entirely and the desktop Decision Log
form was the only creator in the app. `seedDealsCatalyst` now writes it.

## Stratus offload and durable webhook retry — BOTH BUILT (2026-08-07)

Previously deferred as latent; both are now shipped and verified live. Kept here because the
reasoning that shaped them is not obvious from the code.

### Stratus offload for `v2_deal_snapshots.payload`

Bucket **`edc-deal-snapshots`** (Authenticated template, versioning off), created by hand in the
Console — there is no `Create_Bucket` API or MCP tool.

**Threshold-triggered, not unconditional.** A payload ≤ `SNAPSHOT_PAYLOAD_LIMIT` (9,800) stays in
`payload_inline` exactly as before and makes **no Stratus call at all**; only a larger one is
written to `deal-snapshots/<dealId>/<snapshotId>.json` with `payload_key` set. This is the whole
design: the vital-signs baseline reads one snapshot *per open deal* on every dashboard load and
the trajectory reads *every* snapshot for a deal, so offloading everything would turn those into
N and M object reads to fix a cap that is almost never hit. The cap is the problem; the storage
location is not. Largest real payload measured 2026-08-07: 4,904 chars.

Reads hydrate **inside the repository** (`hydratePayloads`), on all three methods that return
snapshots — not via a helper callers must remember. A caller that forgot would silently read
`payload: null`, which is the same swallowed-failure shape as the missing `key_lessons` column
and the deal-list 500.

**Still do not "degrade gracefully" by dropping or truncating the payload.** Three live features
read it: the trajectory chart (`gatePct`/`playbookPct`/`meddpiccPct`), the vital-signs 7-day
baseline RED-alert count (both `routes/v2/analytics.ts`), and `snapshotFingerprint`, which is how
the hourly cron decides a snapshot is unchanged — lose it and the dedupe inverts into a duplicate
row per deal per hour.

**The trap that cost the most time — Stratus needs ADMIN scope here.** The SDK annotates
`putObject`/`getObject` `@access admin, user`, which reads as "a user-scoped app is fine". It is
not: an Authenticated bucket serves *project users*, and the docs are explicit that this applies
"to project users only — **not** Collaborators or **Admins**". Every human who signs into EDC is
a Catalyst App Administrator, so their app is refused. The symptom was maximally confusing — the
offload worked from the **cron** (no user session ⇒ the application's own identity) and silently
failed from the **event-driven** path, both calling the same repository. `adminAppFor()`
(`lib/db/src/catalyst/sdk.ts`) re-derives an admin app from any app built by `initCatalystApp`,
via a `WeakMap` of the originating request, so no second app has to be threaded through the 14
`emitDealEvent` call sites. Note `initCatalystAdminApp({headers: {}})` does **not** work — it
fails with "Failed to parse object"; real request headers are required even for admin scope.

Second trap: **`getObject` resolves to a `Readable`, not a Buffer.** `Buffer.from(stream)` throws
"The first argument must be of type string … Received an instance of IncomingMessage", which
reads like a caller passing the wrong argument rather than a stream needing consumption.

### Durable webhook retry

Retries are now **durable-only** — the in-memory `setTimeout` chain is gone. A failed attempt
writes its own `v2_webhook_delivery_log` row carrying `attempt_count` and `next_attempt_at`, and
the drain job re-fires it. The row IS the queue; there is no separate table. A row is pending iff
`success = false AND next_attempt_at <= now`.

- **5 attempts over ~1h50m**, exponential: 10m / 20m / 40m (capped). Auto-disable at 10
  consecutive failures is unchanged and still applies on top.
- Drained by `POST /api/v1/jobs/webhook-retries`, cron **`edcWebhookRetries`** (`*/10 * * * *`,
  job pool `edcjobs`), reusing the plumbing the snapshot job already had.
- The drain clears `next_attempt_at` **before** re-firing, so a run overlapping the next cron
  tick cannot hand the same row out twice. A webhook deleted or disabled since queuing is
  dropped, not resurrected.
- Rows written before these columns existed have no `next_attempt_at` and are invisible to the
  drain — correct: the old in-memory scheme had already abandoned them.

Trade accepted deliberately: first-retry latency moved from 5s to ≤10m. A retry that happens late
beats one that silently never happens.

### The offloaded snapshot rows in production are deliberate — do not "clean them up"

Verifying the offload meant temporarily lowering `SNAPSHOT_PAYLOAD_LIMIT` so real deals wrote
real objects. Those rows were **kept** after the threshold was restored: they carry a
`payload_key` with a null `payload_inline`, so every read of that deal's history exercises
`hydratePayloads` and the Stratus `getObject` path for real.

That matters because the offload is threshold-triggered and the threshold is almost never
reached — without these rows the entire read half of the feature would run only in tests, and
the first production exercise of it would be the day a payload finally grew past 9,800 chars.
They look like test residue. They are the opposite: they are the only continuous coverage that
path has.

## `v2_pipeline_transitions` had to be reconstructed after the migration

The Flow tab (funnel, conversion matrix, Sankey, recycle, coverage, health-score) reads nothing
but this table. After the migration it held **one row for twelve deals**, because the only
backfill that had ever existed was a Drizzle/Postgres CLI script that could never run against
Data Store — and nobody noticed, because the failure was not an error. Every endpoint returned
200; `convToNextPct` and `avgDaysInStage` were simply null, and the Sankey drew a single
nonsensical Closed-Lost → Closed-Won link off that lone row.

Reconstruction now lives at `POST /admin/backfill-transitions`
(`lib/catalyst/transitions-backfill.ts`) — an endpoint rather than a script for the same reason
`/admin/seed` is one: it needs a real `catalystApp`, and the only way to get one is from a
request against the deployed app. Four passes, richest source first: `deal_audit_log`, then
`deal_snapshots` for deals the audit log did not cover, then synthetic create and exit floors so
a seed-inserted deal with no history at all still contributes to the value bridge. It is
idempotent — a second call plans zero rows — which is what makes it safe to leave callable.

Two things about it are Catalyst-specific and were **not** in the Postgres original:

- The original offset the synthetic create from the synthetic exit by **1 millisecond**. Here
  that offset vanishes: `formatCatalystDateTime` truncates to the second, so both rows
  synthesize the identical `natural_key` and `create()` silently drops one. The offset is a
  full second, and a unit test fails if it regresses.
- Two genuinely distinct transitions for one deal inside the same second collide the same way.
  The planner shifts the later one forward to the next free second rather than letting it be
  dropped — losing a real transition is worse than recording it a second late, and count and
  ordering are all the Flow maths reads.

## A column this manifest missed: `v2_deal_memory.key_lessons`

Added 2026-08-06, as `text` (10,000), matching how every other array column on this table is
stored (JSON-encoded `string[]`). It should have been created in Slice 2 — the Drizzle schema
has `keyLessons: text("key_lessons").array()` and the repository read and wrote
`r["key_lessons"]` from the start.

The failure mode is worth remembering, because it is specific to Data Store:

- **Reads of a missing column fail silently.** `r["key_lessons"]` is just `undefined`, so
  `keyLessons` came back `null` on every row. The Deal Memory UI's lessons list, `/memory/ask`'s
  lessons answer, and `memory-health`'s lesson count all read as legitimately-empty data.
- **Writes fail loudly, but only when the field is sent**:
  `{statusCode: 400, code: "INVALID_INPUT", message: "Invalid column name key_lessons"}`. The
  autopsy editor always sends it, so **every autopsy save 500'd** — while the rest of the
  Deal Memory surface looked completely healthy.

That asymmetry is why the Slice 6 walkthrough missed it: read paths render fine and only the
write breaks, so nothing looks wrong until someone saves. When adding a column to a repository,
confirm it exists in Data Store rather than assuming the Slice 2 manifest is complete —
`List_All_Columns` is one call.

`description` is also worth noting: `Create_Column` rejected a perfectly short one with
`PATTERN_NOT_MATCHED`, and only succeeded once the field was omitted entirely.

### Full parity re-verified after that fix (2026-08-06)

Rather than fix the one column and hope, every Drizzle table/column was diffed against every
live Data Store table/column. Result: **71/71 tables present, and `key_lessons` was the only
missing column.** The only three remaining differences are the deliberate renames already
documented above:

| Drizzle | Data Store | Why |
|---|---|---|
| `v2_deal_snapshots.payload` | `payload_inline` + `payload_key` | 10,000-char text limit → Stratus offload pair |
| `engine_thresholds.data_type` | `data_type_` | `data_type` is rejected as a column name |
| `v2_settings_change_log.data_type` | `data_type_` | same |

To redo the diff: pull each table's columns from
`GET /baas/v1/project/{projectId}/table/{TABLE_NAME}/column` (console session, `Environment`
header), then compare against the `pgTable(...)`/`edcV2.table(...)` declarations in
`lib/db/src/schema/*.ts`, applying the `v2_` prefix rule.

**Address that endpoint by table NAME, never by the `table_id` from the table-list response.**
Catalyst returns `table_id` as a JSON *number*, and these IDs (~3.1e16) exceed
`Number.MAX_SAFE_INTEGER`, so `JSON.parse` silently rounds them —
`31210000000625826` → `...824`. Some rounded IDs still resolve and some don't, which presents
as a random-looking subset of tables failing and reads exactly like rate limiting. It is the
same precision trap that made `ROWID` unusable as an exposed `id` in Slice 3.
