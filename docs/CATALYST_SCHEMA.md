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
uniform baseline chosen so Slice 3's write paths aren't blocked by spurious 403s — **Slice 4
should revisit this** once the Catalyst-auth role model is designed: tables playing the same
role as Periscope's roles/audit/settings tables (this schema's closest analogs are
`commanders` and `v2_settings_change_log`) may warrant being pulled back to Select-only for
App User, with writes routed through an admin-scoped SDK call instead (`initCatalystAdminApp`
in `lib/db/src/catalyst/sdk.ts` already exists for this).

## Known open items for later slices

- **Full-text search fields**: the Data Store `Create_Column` API's `search_index_enabled`
  flag is only exposed for `varchar`/`int`/`double`/`bigint`/`date`/`datetime` columns, **not**
  for `text` — so `v2_deal_memory.win_loss_narrative`/`loss_narrative` (the fields
  `/v2/memory/search` and `/v2/memory/ask` search over today via Postgres tsvector) have no
  schema-level search flag to enable. Slice 5 needs to resolve this — likely Catalyst Search
  configured separately from column creation, or an in-memory JS scan (matching Periscope's
  proven approach for its own search feature, at a comparable data scale).
- **CHECK constraint enforcement**: needs Zod validation added at the Slice 3 repository
  boundary for every constraint listed in the type-mapping table above — none of them are
  enforced by Data Store itself.
