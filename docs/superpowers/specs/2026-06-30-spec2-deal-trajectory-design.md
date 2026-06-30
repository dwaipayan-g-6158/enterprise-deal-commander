# Spec 2 — Deal Trajectory (replaces "Point-in-time view", C1)

Date: 2026-06-30
Status: Approved direction (multi-metric trajectory), execution.

Replace the `SnapshotScrubber` ("Point-in-time view") on the deal cockpit with a multi-metric **Deal Trajectory** chart: predictive close **score** (line), **health** (colored background band), **gate-completion %** (line/area), with **stage-change markers** along the time axis.

## Data sources (all already populated; ~5-day spread on seeded deals)
- `edc_v2.deal_snapshots` — per point in time: `health_status`, `sales_stage`, `calculated_tcv`, `snapshot_at`, and `payload` (serialized state incl. gate state → gate %).
- `edc_v2.deal_scores` — `score`, `computed_at` (predictive close score over time).

## Backend
Add `GET /v2/analytics/deals/:dealId/trajectory` in `artifacts/api-server/src/routes/v2/analytics.ts`, following the existing **loose `GenericDataResponse`** pattern used by the other analytics endpoints (hook → `useGetDealTrajectory`). Logic:
1. Load snapshots (asc by `snapshot_at`): extract `{ at, health, stage, tcv, gatePct }`. Derive `gatePct` from `payload` gate state (inspect the snapshot serializer / payload shape; if gates absent, omit gatePct gracefully).
2. Load scores (asc by `computed_at`): `{ at, score }`.
3. **Merge** both timestamp sets into one ascending series; **carry-forward** the last known value of each metric so every point has all fields (clean aligned series for one chart).
4. Derive `stageChanges: [{ at, from, to }]` from stage transitions in the ordered snapshots.
5. Return `{ points: [{ at, score, gatePct, health, stage, tcv }], stageChanges }`.
- Add the path to `openapi.yaml` (loose response) + run codegen.

## Frontend
- New `components/cockpit/deal-trajectory.tsx` — `DealTrajectory({ dealId })` using recharts `ComposedChart` inside the project's `ChartContainer` (remember: needs `w-full max-w-[…]`, not bare `aspect-square`, or it collapses). 
  - Time X axis; left Y axis 0–100 for score + gate%.
  - Score = primary line; gate% = secondary line or light area.
  - Health = colored `ReferenceArea` background segments (RED/YELLOW/GREEN tints) spanning between health changes.
  - Stage changes = vertical `ReferenceLine`s with stage labels.
  - Custom tooltip showing score, gate%, health, stage, TCV at the hovered time.
  - Graceful empty/sparse state (1 point → show current snapshot summary instead of an empty chart).
- `pages/deal-cockpit.tsx`: remove `SnapshotScrubber` import + usage; render `<DealTrajectory dealId={id} />` in its place (same slot, above the columns).
- Delete `components/cockpit/snapshot-scrubber.tsx` (point-in-time view removed). Leave the `getSnapshot` API endpoint in place (harmless if unused).

## Acceptance
- `pnpm run typecheck` passes; the trajectory endpoint returns a non-empty `points` array for a seeded deal.
- Cockpit shows the trajectory chart in place of the old scrubber; renders without layout collapse; sparse-data fallback works.
