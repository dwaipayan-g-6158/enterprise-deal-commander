# Pipeline Flow Analytics — Design & Technical Specification

**Date:** 2026-06-30
**Module:** Pipeline Analytics — Slice 1 (Flow Analytics)
**Application:** Enterprise Deal Commander (EDC)
**Source PRD:** `Improvements/Pipeline Analytics.md` (§6.1 Health Dashboard subset, §6.2 Flow Analytics)
**Status:** Design — pending implementation plan

---

## 1. Intent & Scope

The Pipeline Analytics PRD describes a 44-week, 6-phase, ~80-requirement module spanning four largely independent subsystems. A large fraction of it already exists in EDC (forecast/Monte-Carlo simulation, velocity analytics, win/loss, competitive, 8-factor scoring, 7-dimension risk, durable snapshots, the 14-widget command center). This spec covers **only the first slice: Flow Analytics** — the highest genuinely-new value with the lowest infrastructure risk.

### 1.1 In scope (this slice)

- **Pipeline Pulse** — composite 0–100 health score + radial gauge + 6 sub-scores.
- **Coverage Ratio Tracker** — coverage ratios against a configurable period target.
- **Pipeline Funnel** — stacked horizontal bars, count/value toggle, adjacent conversion annotations.
- **Conversion Rate Matrix** — stage→stage rates incl. stagnation (diagonal) and regression (below-diagonal).
- **Stage Transition Sankey** — weighted flows including exit nodes (Won/Lost).
- **Recycle & Exit Analysis** — recycle rate, exit rate by stage, waterfall.
- **Period Targets config** — a Settings tab to enter one revenue target per quarter.

### 1.2 Explicitly deferred (later slices)

ML ensemble (XGBoost/LSTM), Shapley win-rate decomposition, Segment Builder, Generation/Sourcing, Leading Indicators + Granger causality, Process Compliance Monitor, dedicated Bottleneck Detector (the existing risk engine covers this for now), PDF/CSV export, WebSocket live updates, time-animated Sankey, source attribution.

### 1.3 Hard constraint — architecture & stack

The PRD prescribes Python/FastAPI, Kafka, TimescaleDB, ONNX/PyTorch, Redis, Celery. **None of this will be used.** EDC is a pnpm monorepo (Node 24, Express 5, Drizzle, PostgreSQL 16) with a **pure isomorphic TypeScript engine**, and a stated goal of **Zoho Catalyst portability**. Every PRD algorithm in this slice is reinterpreted as a pure-TS engine module following the existing `scoring.ts` / `risk-v2.ts` / `simulation.ts` pattern. No new infrastructure is introduced.

### 1.4 Non-goals / preservation guarantees

- **Do not break existing features.** The current `/analytics` page content is preserved verbatim as an "Overview" tab; no existing widget, route, engine function, or schema is modified destructively.
- The isomorphic engine purity rule holds: `lib/engine/src/flow.ts` performs no DB/network I/O; all inputs are passed as arguments.
- Stage-advance guardrail, audit, auth, and snapshot behaviors are untouched.

---

## 2. Data Architecture

### 2.1 New table: `pipeline_transitions` (materialized)

All flow analytics are stage-transition aggregations. Rather than reconstruct transitions per request from `deal_snapshots` (which fire for many reasons and need dedup), we materialize a first-class transition table in the `edc_v2` schema, populated by the existing event bus.

```
edc_v2.pipeline_transitions
├── id: uuid PK default random
├── deal_id: uuid NOT NULL FK → enterprise_deals(id) ON DELETE CASCADE
├── from_stage_id: integer NULL          -- null = initial creation
├── to_stage_id: integer NULL            -- null only for hard-delete/abandon (rare)
├── transition_type: varchar(20) NOT NULL
│       CHECK IN ('forward','backward','exit_won','exit_lost','create')
├── tcv_at_transition: numeric(18,2)     -- normalized TCV snapshot at transition time
├── days_in_from_stage: integer          -- residence time in the stage being left
├── overridden: boolean NOT NULL default false   -- carried from stage_changed event
├── transitioned_at: timestamptz NOT NULL
└── created_by: varchar(255) NOT NULL
```

- `transition_type` is derived from the stages' `sort_order`: higher = `forward`, lower = `backward`; the terminal stages `Closed-Won`(5)/`Closed-Lost`(6) map to `exit_won`/`exit_lost`. (Stage→type mapping lives in the engine, computed from the stage list, so it is not hardcoded to specific IDs.)
- Additive table only; applied via **direct SQL** (per repo convention — drizzle-kit push hits the TTY truncate prompt; see CLAUDE.md / `edc-local-windows-run` memory). Schema definition added to `lib/db/src/schema/edc_v2.ts` and exported from `index.ts`.

### 2.2 New table: `pipeline_targets`

```
edc_v2.pipeline_targets
├── id: uuid PK default random
├── period_type: varchar(10) NOT NULL default 'quarter'  -- 'quarter' only for this slice
├── period_start: date NOT NULL          -- e.g. 2026-07-01
├── target_value: numeric(18,2) NOT NULL -- revenue target for the period (USD)
├── updated_at: timestamptz NOT NULL
└── unique(period_type, period_start)
```

Single-user app: no per-rep targets. One row per quarter. Coverage = current qualified pipeline / target for the active period.

**Coverage ratio definitions (resolves ambiguity for §3 `computeCoverage`):**

| Ratio | Numerator |
|---|---|
| Total | Σ normalized TCV of all open deals (not in a terminal stage) |
| Qualified | Σ normalized TCV of open deals **past Discovery** (sortOrder ≥ Validation) |
| Weighted | Σ (normalized TCV × `winProbabilityPct`/100) over open deals |
| AI-adjusted | Σ (normalized TCV × `deal_scores.winProbability`) over open deals |
| Net-new | Σ TCV of deals **created this period** ÷ remaining gap (target − weighted pipeline) |

All numerators divide by the active period's `target_value`. Where `winProbabilityPct` / `deal_scores` is null, that deal is excluded from the weighted/AI numerators (and the exclusion is surfaced as a small caveat), never treated as zero silently.

### 2.3 Population: `pipeline-transitions` subscriber + backfill

- **New subscriber** `artifacts/api-server/src/lib/subscribers/pipeline-transitions.ts` registered in `subscribers/index.ts` via `registerPipelineTransitions()`. It listens to `deal.stage_changed` (payload already provides `fromStageId`, `toStageId`, `overridden`) and to `deal.created` (emits a `create` transition with `from_stage_id = null`). It computes `days_in_from_stage` from the prior transition's `transitioned_at` (or deal creation) and snapshots normalized TCV.
- **Backfill script** `scripts/backfill-pipeline-transitions.ts`: reconstructs historical transitions from sequential `deal_snapshots` (ordered by `created_at` per deal, emitting a row whenever `sales_stage_id` changes), de-duplicating consecutive equal stages. Idempotent (truncate-and-rebuild or `ON CONFLICT DO NOTHING` against a natural key of `deal_id + transitioned_at`). Run once after the table is created; safe to re-run.

Going forward the subscriber keeps the table live; the backfill seeds history. This mirrors the existing `snapshot-service` + periodic-job pattern.

---

## 3. Engine Layer — `lib/engine/src/flow.ts` (pure, isomorphic)

No I/O. Inputs are plain arrays/objects assembled by the API layer. Mirrors the export style of `scoring.ts`. Unit-tested in `flow.test.ts` (Vitest) with synthetic transition fixtures.

```ts
// Types
interface StageDef { id: number; name: string; sortOrder: number; terminal?: 'won' | 'lost'; }
interface TransitionRec { dealId; fromStageId|null; toStageId|null; type; tcv; daysInFromStage; transitionedAt; }

// Funnel — count & value per active stage + conversion to next
computeFunnel(deals, stages): FunnelRow[]            // { stageId, stageName, dealCount, totalValue, convToNextPct, avgDaysInStage, pctOfPipeline }

// Conversion matrix — from→to within a window; diagonal=stagnation, below-diagonal=regression
computeConversionMatrix(transitions, stages, windowDays): MatrixCell[][]  // { fromId, toId, rate, n, kind: 'forward'|'stagnation'|'regression', significant }

// Sankey — nodes + weighted links incl. exit nodes
computeSankeyFlows(transitions, stages, mode): { nodes, links }  // mode: 'count' | 'value'

// Recycle & exit
computeRecycleExit(transitions, stages): {
  recycleRateByStage, overallRecycleRate, exitRateByStage,
  recycleCountDistribution, waterfall: WaterfallStep[]
}

// Pipeline Pulse composite (PRD §10.1, percentile-normalized)
computeHealthScore(metrics, history, weights): {
  score: number; subScores: { coverage, velocity, conversion, generation, age, attrition }
}

// Coverage ratios (PRD §6.1.2) — target-aware
computeCoverage(pipeline, target): {
  total, qualified, weighted, aiAdjusted, netNew  // each { ratio, trend? }
}
```

Significance for matrix cells uses a simple two-proportion z-test against the portfolio baseline (no external stats lib; small helper in the engine). Health-score components normalize to a 0–100 percentile rank over trailing history, with `invert` for velocity/age (lower is better), exactly per PRD §10.1.

---

## 4. API Layer — `/api/v2/analytics/flow/*`

Thin Drizzle aggregations that assemble engine input from `pipeline_transitions`, current `enterprise_deals`, `pipeline_stages`, `deal_scores`, and `pipeline_targets`, then call `lib/engine/flow.ts`. Added to the existing `routes/v2/analytics.ts` router (already mounted under `/api/v2`, behind `requireAuth`). Responses use the loose `GenericDataResponse` contract — the same approach used by the dashboard command-center aggregations — so no breaking change to the OpenAPI typed surface is required for the data endpoints.

| Endpoint | Method | Returns |
|---|---|---|
| `/v2/analytics/flow/funnel` | GET | funnel rows (count/value, conversions) |
| `/v2/analytics/flow/conversion-matrix` | GET | matrix cells (`?windowDays=`) |
| `/v2/analytics/flow/sankey` | GET | nodes + links (`?mode=count\|value`) |
| `/v2/analytics/flow/recycle` | GET | recycle/exit metrics + waterfall |
| `/v2/analytics/flow/health-score` | GET | Pulse score + 6 sub-scores |
| `/v2/analytics/flow/coverage` | GET | 5 coverage ratios for active period |

**Targets** (typed, in `routes/v2/config.ts`, OpenAPI-specced since it's a write path):

| Endpoint | Method | Purpose |
|---|---|---|
| `/v2/config/targets` | GET | list period targets |
| `/v2/config/targets` | PUT | upsert a period target |

React Query hooks for targets are generated via Orval (`pnpm --filter @workspace/api-spec run codegen`). Flow data endpoints are consumed via lightweight hand-written `useQuery` hooks against `GenericDataResponse`, matching the dashboard aggregation hooks.

Filtering for this slice: optional `?from=&to=` date range; full segment filtering is deferred with the Segment Builder.

---

## 5. Frontend Layer

### 5.1 Page placement — tabbed `/analytics`

`artifacts/edc/src/pages/analytics.tsx` becomes a tabbed shell (Radix `Tabs`, already in the UI kit):

- **Tab "Overview"** — the *current* analytics page content moved verbatim into a sub-component `analytics-overview.tsx`. Zero behavior change.
- **Tab "Flow"** — the new module: `components/cockpit/flow/flow-analytics.tsx` composing the six visualizations.

No new top-level route, no nav sprawl. Honors the PRD's IA intent (a Pipeline Analytics area with Health + Flow views) within the existing surface.

### 5.2 Components — `components/cockpit/flow/*`

| Component | Visualization | Notes |
|---|---|---|
| `pipeline-pulse.tsx` | Radial gauge + sub-score bars | SVG arc, 800ms ease-out animation; semantic color scale (emerald/amber/orange/red) per PRD §12.1 |
| `coverage-tracker.tsx` | Card row with ratios + sparklines | Reuses existing card styling `bg-card border border-border rounded-lg`; sparkline via existing chart helpers |
| `pipeline-funnel.tsx` | Stacked horizontal bars | Count/value toggle, conversion annotations, stage semantic colors |
| `conversion-matrix.tsx` | Color-coded grid | Diverging scale (emerald forward / amber stagnation / red regression); significant cells `ring-1 ring-primary/30` |
| `transition-sankey.tsx` | Sankey | recharts Sankey (already in deps) or D3 sankey; exit nodes rendered below |
| `recycle-exit.tsx` | Waterfall + small tables | Recycle rate, exit-by-stage |

All styling uses existing Tailwind v4 design tokens and semantic colors already defined for risk/health, so the module visually matches the app. Empty/insufficient-data states follow PRD §15.1 (e.g. "Insufficient data" badge under thresholds).

### 5.3 Settings — Targets tab

A new tab in `pages/settings.tsx` (the page already has a tabbed structure with Team/Custom Patterns/Smart Alerts/Webhooks): a simple quarter picker + currency input that upserts via `PUT /v2/config/targets`.

---

## 6. Testing Strategy

- **Engine** (`lib/engine/src/flow.test.ts`): synthetic transition fixtures covering forward/backward/exit, recycle (A→B→A), stagnation, empty stages, and the insufficient-data thresholds. Pure functions → fully deterministic unit tests. Target: all flow functions covered.
- **Subscriber** (`pipeline-transitions.test.ts`): given a `deal.stage_changed` event, asserts one correct transition row (type, residence days, override flag). Reuses the existing durable-history test harness pattern.
- **Backfill**: a focused test that feeds an ordered snapshot sequence and asserts the reconstructed transition set (incl. de-dup of consecutive equal stages).
- **API**: runtime smoke against a seeded DB for each `/flow/*` endpoint (shape + non-empty for seeded data), matching how existing v2 analytics endpoints are smoke-tested.
- **Regression guard**: `pnpm run typecheck` + existing engine suite (121 tests) must stay green; the `/analytics` Overview tab must render identically (manual smoke).

---

## 7. Edge Cases (from PRD §15, scoped)

| Condition | Handling |
|---|---|
| < 10 deals in a stage/segment | "Insufficient data" badge; show raw counts, suppress rates |
| No `pipeline_targets` row for active period | Coverage + Pulse `coverage`/`generation` sub-scores show "Set a target" empty state; rest of Pulse still computes |
| New stage with no history | Use portfolio baseline; matrix cell marked low-confidence |
| Zero transitions yet (fresh install pre-backfill) | Funnel still renders from current deal stages; matrix/Sankey show empty state until backfill runs |
| Deal recycles multiple times | Each backward move is its own transition; recycle count distribution captures multiplicity |

---

## 8. Implementation Order (for the plan)

1. **Schema**: add `pipeline_transitions` + `pipeline_targets` to `edc_v2.ts`; apply via direct SQL; export from `index.ts`.
2. **Engine**: `flow.ts` + `flow.test.ts` (TDD — tests first).
3. **Subscriber + backfill**: `pipeline-transitions.ts`, register it, write `backfill-pipeline-transitions.ts`; run backfill.
4. **API**: `/flow/*` GETs in `analytics.ts`; `/config/targets` GET/PUT in `config.ts` + OpenAPI + codegen.
5. **Frontend targets**: Settings Targets tab.
6. **Frontend module**: `flow/*` components; convert `analytics.tsx` to tabs with Overview preserved.
7. **Verify**: typecheck, engine tests, API smoke, manual UI smoke of both tabs.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Backfill produces noisy transitions from snapshot churn | De-dup consecutive equal stages; only emit on `sales_stage_id` change; idempotent re-runnable |
| Conversion matrix statistically meaningless on small data | Significance test + insufficient-data suppression per §7 |
| Sankey lib (recharts) limitations for exit-node layout | Fall back to a custom D3 sankey renderer (D3 already acceptable per PRD stack) if recharts Sankey can't express exit nodes cleanly |
| Tabbing `/analytics` regresses existing view | Move content verbatim into `analytics-overview.tsx`; no logic edits; manual smoke |
| TCV-at-transition unavailable for historical backfill | Use the snapshot's `normalized_tcv` at that point; null when absent, handled in aggregation |

---

*Document Version: 1.0 — Pipeline Analytics Slice 1 (Flow Analytics)*
