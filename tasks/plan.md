# Implementation Plan: Clickable Weighted Pipeline & Avg Score tiles

## Overview

The dashboard's Pipeline Vital Signs row (`VitalSignsBar`) has 5 tiles. Total TCV and Red
Alerts are clickable — they open a detail dialog (`TotalTcvDialog`, `HealthStatusDialog`) via a
shared `clickable()` role="button" helper. Weighted Pipeline and Avg Score are plain, inert
`Card`s. This plan makes those two tiles clickable, each opening a new detail dialog modeled on
the existing `TotalTcvDialog`.

No backend or API-contract changes are needed: `useListDeals` (TCV, health, stage,
`winProbabilityPct`) and the already-shipped `useGetRosterEnrichment` hook (per-deal `score`)
together carry every field required to build both dialogs client-side, the same way
`TotalTcvDialog` already re-fetches `useListDeals` independently of the tile bar.

## Architecture Decisions

- **Reuse existing hooks, no codegen.** `useListDeals` + `useGetRosterEnrichment` (already used by
  `DealRoster`) supply TCV, health, stage, `winProbabilityPct`, and `score`. No new API route, no
  `pnpm --filter @workspace/api-spec run codegen` needed. This keeps both tasks frontend-only.
- **Mirror the backend's weighted-pipeline fallback.** `/analytics/vital-signs` computes each
  deal's contribution as `tcv * (score ?? winProbabilityPct ?? 30) / 100`. The new
  `WeightedPipelineDialog` must replicate that exact fallback chain per deal so its per-deal
  breakdown is directionally consistent with the aggregate number shown on the tile (see Risks —
  it will not reconcile to the cent, since the tile's cap-less aggregate and the dialog's
  `limit: 200` deal fetch are independent queries).
- **Follow the established dialog shell.** New dialogs use the same `Dialog`/`DialogContent`
  layout, `compactCurrency`/currency-formatting conventions, and click-through-to-deal row pattern
  as `TotalTcvDialog`, not a new visual language.
- **Score color convention.** Reuse the existing `>=70 emerald / >=40 amber / else red` scale from
  `components/roster/cells.tsx` for score coloring in the Avg Score dialog, rather than inventing
  a new one (three different scoreColor scales already exist elsewhere in the codebase — don't add
  a fourth).

## Task List

### Phase 1: Weighted Pipeline tile

- [ ] **Task 1: Weighted Pipeline tile opens a breakdown dialog**

  **Description:** Make the "Weighted Pipeline" tile in `VitalSignsBar` clickable, opening a new
  `WeightedPipelineDialog` that shows the weighted-pipeline total, a by-health breakdown of
  weighted contribution, and the top deals by weighted contribution (TCV × win probability),
  each row linking to its deal.

  **Acceptance criteria:**
  - [ ] The Weighted Pipeline `Card` has the same `cardCls` + `clickable()` + `aria-haspopup="dialog"`
        treatment as the Total TCV card (mouse click and keyboard Enter/Space both open it; it's
        reachable by Tab).
  - [ ] The dialog shows: weighted pipeline total, total TCV, blended win-rate
        (`weightedPipeline / totalTCV`), a RED/YELLOW/GREEN weighted-contribution breakdown, and a
        "top contributing deals" list (deal name, account, weighted contribution) sorted descending.
  - [ ] Clicking a deal row closes the dialog and navigates to `/deals/:id` (matches
        `TotalTcvDialog`'s `goToDeal`).
  - [ ] Deals with no `score` and no `winProbabilityPct` fall back to 30% (matching the backend's
        `?? 30` default) rather than being dropped or shown as 0%.

  **Verification:**
  - [ ] `pnpm --filter @workspace/edc exec tsc --noEmit` (or `pnpm run typecheck` from repo root)
        passes.
  - [ ] Manual: `pnpm --filter @workspace/api-server run dev` + `pnpm --filter @workspace/edc run dev`,
        load `/`, click the Weighted Pipeline tile — dialog opens with non-empty breakdown and top
        deals; click a deal row — navigates to that deal's page.
  - [ ] Manual: Tab to the tile, press Enter — dialog opens; Escape closes it.

  **Dependencies:** None.

  **Files likely touched:**
  - `artifacts/edc/src/components/dashboard/weighted-pipeline-dialog.tsx` (new)
  - `artifacts/edc/src/components/dashboard/widgets/vital-signs-bar.tsx` (edit)
  - `artifacts/edc/src/pages/dashboard.tsx` (edit)

  **Estimated scope:** Medium (1 new file, 2 edited).

### Checkpoint: Weighted Pipeline

- [ ] Typecheck clean, dialog verified end-to-end in the browser, no regression to the other four
      Vital Signs tiles (Total TCV, Active Deals/stale link, Red Alerts still open their existing
      dialogs correctly).

### Phase 2: Avg Score tile

- [ ] **Task 2: Avg Score tile opens a distribution dialog**

  **Description:** Make the "Avg Score" tile clickable, opening a new `AvgScoreDialog` that shows
  the portfolio average score, a score-band distribution (Strong/Moderate/Weak, using the existing
  70/40 thresholds), and a "deals to watch" list of the lowest-scoring active deals, each row
  linking to its deal.

  **Acceptance criteria:**
  - [ ] The Avg Score `Card` has the same `cardCls` + `clickable()` + `aria-haspopup="dialog"`
        treatment as Total TCV / Red Alerts.
  - [ ] The dialog shows: avg score, count of scored vs. unscored active deals, a score-band
        breakdown (counts and/or TCV per band using the emerald/amber/red convention from
        `roster/cells.tsx`), and a "lowest scoring deals" list sorted ascending by score (deals with
        no score excluded from the ranking, shown separately or omitted — not sorted as if score
        were 0).
  - [ ] Clicking a deal row closes the dialog and navigates to `/deals/:id`.

  **Verification:**
  - [ ] Typecheck passes (`pnpm run typecheck`).
  - [ ] Manual: click Avg Score tile — dialog opens with correct counts (cross-check against the
        Deal Roster widget's per-deal Score column for a couple of deals); click a deal row —
        navigates correctly.
  - [ ] Manual: keyboard open/close works same as Task 1.

  **Dependencies:** None functionally, but implemented after Task 1 so both new `OpenDialog` union
  members and both new `onOpen*` props land in `dashboard.tsx` / `vital-signs-bar.tsx` without
  merge churn on the same lines.

  **Files likely touched:**
  - `artifacts/edc/src/components/dashboard/avg-score-dialog.tsx` (new)
  - `artifacts/edc/src/components/dashboard/widgets/vital-signs-bar.tsx` (edit)
  - `artifacts/edc/src/pages/dashboard.tsx` (edit)

  **Estimated scope:** Medium (1 new file, 2 edited).

### Checkpoint: Complete

- [ ] Both tiles clickable and keyboard-accessible, both dialogs verified end-to-end, typecheck and
      build clean, no regression to existing dashboard tiles/dialogs.
- [ ] Ready for review.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Per-deal weighted-contribution sum in the dialog won't exactly match the tile's aggregate (independent queries, `limit: 200` cap, live data drift between fetches) | Low — cosmetic mismatch of a few % at most | Mirror the backend's exact fallback formula (`score ?? winProbabilityPct ?? 30`) so the numbers are directionally right; don't force-reconcile to the tile's headline figure |
| `useGetRosterEnrichment` returns `score: null` for deals never scored | Low | Treat `null` as "unscored" explicitly in both dialogs (excluded from score-based sorting/averaging, not coerced to 0) |
| Scope creep into redesigning the Active Deals tile or adding a backend endpoint | Medium | Out of scope — this plan only touches the 2 requested tiles and adds zero new API surface |

## Open Questions

- Should the Weighted Pipeline dialog's footer link go to `/portfolio` (like `TotalTcvDialog`) or
  `/deals`? Defaulting to `/portfolio` for consistency unless you'd prefer `/deals`.
- Should the Avg Score dialog also surface the *highest*-scoring deals, or is "deals to watch"
  (lowest scorers) the more useful default view? Defaulting to lowest-scorers-first since that's
  the actionable direction (matches `StaleDealsDialog`'s "here's what needs attention" framing).
