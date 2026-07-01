# Velocity — "Most Overdue First" Card Redesign

**Date:** 2026-07-01
**Scope:** Frontend-only. Redesign one card on the Pipeline Analytics page (`artifacts/edc/src/pages/analytics-overview.tsx`). No API contract, DB schema, engine, or codegen changes.

## Problem

The "Velocity — Most Overdue First" card today is two stacked, partly-redundant zones:

1. A Recharts horizontal bar chart (`VelocityBars`) that plots **raw `daysInStage`** colored by delta — which contradicts the card's own title ("Most Overdue First" implies overdue-ness / variance, not raw duration).
2. A plain 6-column table (Deal / Stage / Days / Benchmark / Delta / Velocity) where overdue-ness in the Delta column is conveyed by **color alone** (red text for positive delta) — a WCAG color-only failure.

Together they consume a lot of vertical space (`aspect-[16/7]` chart + full table) for one idea.

## Goal

Turn the card into a **compact, scannable triage tool**: a commander sees instantly which deals are most overdue and by how much, and can click straight into a deal to act. Maximize data-per-screen; eliminate the redundant chart.

## Data (unchanged)

From `useGetVelocityAnalytics()` → `data.deals: VelocityDeal[]`:

```ts
interface VelocityDeal {
  id: string;
  dealName: string;
  accountName: string;
  stage: string;
  daysInStage: number;
  benchmarkDays: number;
  deltaDays: number;   // daysInStage - benchmarkDays; >0 = overdue/behind, <0 = ahead
  velocity: string;    // "SLOW" | "FAST" | "NORMAL"
}
```

Server already returns most-overdue-first ordering; the redesign preserves it (no client re-sort, no sortable headers — YAGNI for v1).

## Design

A single **dense triage table** replacing both the chart and the old table. Sorted most-overdue-first.

### Columns

| Column | Content | Responsive |
|--------|---------|------------|
| **Deal** | `dealName` (medium weight) · `accountName` (muted) | always |
| **Stage** | `stage` text | hidden below `sm` |
| **Variance** | Inline CSS variance meter (the hero — see below) | always |
| **Delta** | Signed label `+18d` / `−2d`, right-aligned, mono | always |
| **Velocity** | Badge `SLOW`/`ON`/`FAST` + directional icon | hidden below `sm` |

### Variance meter (the core element)

A thin horizontal track rendered with **pure CSS** (flex `<div>`s with `%` widths + an absolutely-positioned benchmark tick) — **no Recharts**.

- **Shared scale:** track max = `Math.max(...deals.map(d => d.daysInStage), 1)` so bars are comparable row-to-row.
- **Fill:** width = `daysInStage / scaleMax`.
  - Portion up to `benchmarkDays` → neutral tone (`--chart-1` indigo or `--muted`).
  - Overflow beyond `benchmarkDays` (only when `deltaDays > 0`) → `--destructive` (red) = the overdue amount.
  - When `deltaDays < 0` (ahead): the whole fill is `--chart-2` emerald and ends short of the tick.
- **Benchmark tick:** a 1–2px vertical marker positioned at `benchmarkDays / scaleMax`, labelled for the first row only (or via tooltip/aria) as the benchmark reference.
- Bar height ~6–8px; the row stays compact (single line of text height).

### Accessibility (explicit fix for color-only)

- Overdue-ness is **always** carried by the signed text label (`+18d` / `−2d`) and the velocity badge text — never color alone.
- Velocity badge pairs text with a directional icon: SLOW → ↑ (or arrow-up-right), NORMAL/ON → → (or minus), FAST → ↓. Use Lucide SVG icons, not emoji.
- The meter cell carries an `aria-label`, e.g. `"45 days in stage, benchmark 27, 18 days overdue"` (or `"… 2 days ahead of benchmark"`).
- Color contrast ≥ 4.5:1; reuse existing health tokens (`--destructive`, `--chart-2`/emerald, `--muted`).

### Interaction

- **Clickable rows:** each row navigates to `/deals/:id` via wouter (`useLocation` → `navigate`, or a `Link` wrapper). Row is keyboard-activatable (`role="button"` or anchor semantics, `tabIndex`, Enter/Space handler) with a visible `focus-visible` ring and a `hover:bg-muted/50` affordance + `cursor-pointer`.
- **Empty state:** when `deals.length === 0`, render an `Empty` block (matching the Win/Loss and Competitive cards on this page) — icon + title ("No active deals to track") + one-line description — instead of an empty table.

### Responsiveness

- Wrap the table in an `overflow-x-auto` container.
- Stage and Velocity columns hide below `sm`; Deal + Variance + Delta always visible so the triage signal survives on narrow screens.

## Files

| File | Change |
|------|--------|
| `artifacts/edc/src/pages/analytics-overview.tsx` | Replace the Velocity card body (chart + old table) with the new dense triage table; remove the `VelocityBars` import; add navigation + `Empty` import if not present. |
| `artifacts/edc/src/components/cockpit/charts/velocity-bars.tsx` | **Delete** — orphaned once the chart is removed (only this card imported it). |
| `artifacts/edc/src/components/cockpit/charts/transforms.ts` | Keep `classifyVelocity` (still used to pick meter colors). Unchanged. |
| (optional) a small `VarianceMeter` subcomponent | Extract the meter into a focused presentational component within `analytics-overview.tsx` or a sibling file for readability/testability of the width math. |

## Color semantics (reuse existing tokens)

| State | Condition | Token |
|-------|-----------|-------|
| Overdue / behind / SLOW | `deltaDays > 0` | `--destructive` |
| On track / NORMAL | `deltaDays === 0` | `--chart-1` (indigo) or `--muted` |
| Ahead / FAST | `deltaDays < 0` | `--chart-2` (emerald) |

Health colors stay reserved for status (per the project's accent rules); the indigo accent is **not** reused for overdue signalling.

## Testing & verification

- **Pure-logic unit test (Vitest, `*.test.ts`, node env, relative imports):** if the meter width math is extracted into a pure helper (e.g. `meterGeometry(deal, scaleMax) → { fillPct, benchmarkPct, overflowPct, tone }`), unit-test it: overdue case, ahead case, on-track case, zero/edge `scaleMax`. Presentational TSX is not unit-tested.
- **Typecheck:** `pnpm --filter @workspace/edc run typecheck` → PASS (resolve removed `VelocityBars` import).
- **Build:** `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/edc run build` → PASS.
- **Visual (Playwright/Chrome DevTools MCP):** `/analytics`, light + dark; confirm: most-overdue row first, meters comparable and red overflow on overdue deals, signed labels + badges present (color-independent), row click navigates to the cockpit, focus ring on keyboard nav, empty state when no deals, no horizontal body scroll at 375/768/1024/1440. Zero console errors.

## Out of scope

- Sortable / re-orderable columns.
- Changing the velocity API response or the engine's velocity computation.
- The other three cards on the page (Forecast, Win/Loss, Competitive) — untouched.
- Mobile card-list variant (the `overflow-x-auto` + column-hiding is sufficient for v1).
