# Portfolio Overview Upgrade — Design Spec

**Date:** 2026-06-30
**Module:** Portfolio Risk Analysis (`/portfolio`)
**Status:** Approved, implementing
**Source PRD:** `Improvements/Portfolio Risk Analysis.md`

## Context

The `/portfolio` page (`artifacts/edc/src/pages/portfolio.tsx`) currently renders a header,
a `ProductMixSection` (Pipeline-by-Suite + Product Whitespace heatmap), and three correlation
tables (By Account Manager, By Technical Lead, By Product). Each grouping already carries a
computed `alertCorrelations: {code, share, lift}` — how much more often a risk pattern appears
in that group vs. the portfolio baseline — but it is buried in small badges.

The source PRD describes a 28-week, multi-subsystem, ML-driven, multi-user module. This app is a
**single-user cockpit** with Recharts + Radix + Tailwind, an isomorphic risk engine (no ML, no
D3, no Web Workers, no WebSockets), and rollups that keep **no history**. This spec extracts the
high-value, low-infra subset that fits the app and its aesthetic.

## Goals

- Add the PRD's centerpiece **Team × Product risk heatmap** (FR-6.1).
- Add **portfolio summary cards** (FR-6.2, trimmed): Diversification Index, Highest Correlation
  Cluster, Correlated Exposure, RED Deals.
- Keep the three existing tables and `ProductMixSection` working and unchanged.
- Zero new runtime dependencies; full design-token cohesion (PRD Goal G4).

## Non-goals (deferred / cut, YAGNI)

Risk Trend Timeline (needs snapshot history), team-overlap network graph, product dependency /
Sankey map, Bayesian feature-delay propagation, Isolation-Forest anomaly feed, scenario
simulator, resource-allocation optimizer, action tracker, correlation-explorer scatter/matrix,
WebSocket live updates, RBAC/per-member privacy. None are built here.

## Architecture (contract-first, additive)

Extend `computePortfolioAnalysis()` (`api-server/src/lib/portfolio.ts`) to return **new optional
fields** alongside the existing three groupings. The rollup table stores the analysis as a JSON
column, so the larger payload needs **no DB migration**; caching/invalidation are unchanged.

All new math lives in a new **DB-free** module `api-server/src/lib/portfolio-metrics.ts`, unit
tested in `portfolio-metrics.test.ts`. `portfolio.ts` enriches its internal records (adding
`tcv`, `healthStatus`, `maxActiveAlertWeight`, deal identity) and calls the pure builders.

New payload fields on `PortfolioAnalysis`:

- `riskMatrix`:
  - `byAccountManager: RiskCell[]`, `byTechnicalLead: RiskCell[]`
  - `products: string[]` (ordered column axis)
  - `accountManagers: string[]`, `technicalLeads: string[]` (ordered row axes)
- `summary: PortfolioSummary`

`RiskCell = { person, product, dealCount, tcv, riskScore, topAlertCodes, lowConfidence, deals }`
where `deals: ProductMixDeal[]` (reuses the existing `{id,dealName,accountName,salesStage,tcv}`).

`PortfolioSummary = { diversificationIndex, highestCorrelationCluster, correlatedExposureTcv,
redDealCount, totalDealCount, reportingCurrency }`.

All new fields are **optional** in the schema so the client degrades gracefully.

## Formulas (documented, no ML)

- **Per-deal risk (0–100):** `healthBase + alertBump`, clamped to [0,100].
  `healthBase = { GREEN: 10, YELLOW: 45, RED: 75 }`;
  `alertBump = min(25, maxActiveAlertWeight * 0.25)` where `maxActiveAlertWeight` is the largest
  weight among the deal's **active** (unmanaged) alerts (engine weights are 30–100).
- **Cell risk score:** mean of per-deal risk over the deals at that (person, product)
  intersection. `lowConfidence = dealCount < 3` (PRD NFR-7.2.2).
- **Diversification Index** (PRD §10.4): `D = 1 − Σ(wᵢ²)`, where cluster `i` is a heatmap cell
  and `wᵢ = (riskScoreᵢ · dealCountᵢ) / Σ(riskScore · dealCount)`. `1` = diversified, `0` =
  concentrated. Uses the account-manager axis cells. Returns `1` for an empty/degenerate
  portfolio.
- **Highest Correlation Cluster:** across all manager/lead/product groups, the `(group, code)`
  with the largest `lift`, filtered to `group.dealCount ≥ 3` and `share ≥ 0.5`. `null` if none.
- **Correlated Exposure:** sum of `tcv` for deals carrying at least one active alert code that is
  "significant" — i.e. some group has that code with `lift ≥ 1.5`, `share ≥ 0.5`,
  `dealCount ≥ 3`. (Simplification of the PRD's p-value test; documented in code.)
- **RED Deals:** count of deals with `healthStatus === "RED"`.

## UI (`portfolio.tsx`, top → bottom)

1. Header — unchanged copy.
2. **Summary cards row** — new `components/cockpit/portfolio-summary-cards.tsx`. Four cards,
   staggered `animate-in fade-in` entrance. No sparklines (no history yet); each shows a value +
   one-line context subtitle. Cards: Diversification Index (0–1, 2dp), Highest Correlation
   Cluster (group name + code + `×lift`), Correlated Exposure (compact USD), RED Deals (count of
   total).
3. **Risk Heatmap** — new `components/cockpit/portfolio-risk-heatmap.tsx`. Rows = Account
   Managers, columns = Products. Cell tint via the same emerald→amber→orange→rose ramp the
   Whitespace heatmap uses, keyed by `riskScore` bands (0–25 / 26–60 / 61–80 / 81–100).
   Low-confidence cells dimmed + dotted marker. Radix tooltip on hover (deal count, TCV, top
   risk codes). Click a cell → drill-down deal list below the grid (reuses the `DealList`
   pattern, links to `/deals/:id`). A small toggle (Account Manager ⇄ Technical Lead) swaps the
   row axis; same cell logic. Empty/sparse states render an "insufficient data" message.
4. **Existing three tables + `ProductMixSection`** — unchanged.

## Safety / verification

- Contract change is purely additive (new optional fields) — existing tables keep rendering even
  if `riskMatrix`/`summary` are absent.
- Vitest unit tests for every formula in `portfolio-metrics.test.ts`.
- `pnpm --filter @workspace/api-spec run codegen` after the spec edit.
- `pnpm run typecheck` and the api-server vitest suite before claiming done.
