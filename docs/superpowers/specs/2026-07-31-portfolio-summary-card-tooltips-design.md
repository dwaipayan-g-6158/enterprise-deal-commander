# Portfolio summary card tooltips

## Context

The Portfolio Risk Analysis page (`/portfolio`) has four summary metric cards — Diversification
Index, Top Correlation Cluster, Correlated Exposure, Critical Deals — each showing a number/label
and a short subtitle. None of the four explain *why* the metric is computed the way it is, or why
it can behave in a surprising way (e.g. Correlated Exposure reading lower than the correlation
tables below it would suggest, because of a deliberate active-only alert basis). The user wants
the card titles to become interactive so hovering surfaces that reasoning.

This repo already has exactly one interactive-title pattern in production: the "Share of Stalled
Deals" column header on this same page (`artifacts/edc/src/pages/portfolio.tsx`) renders a small
hover-triggered `Info` icon next to the label via the shared `InfoTooltip` component
(`artifacts/edc/src/components/ui/info-tooltip.tsx`), which shows an explanatory paragraph on
hover. This design reuses that exact pattern rather than introducing a new one.

## Approach

Add an optional `tooltip?: React.ReactNode` prop to `MetricCardProps` in
`artifacts/edc/src/components/cockpit/portfolio-summary-cards.tsx`. When present, the label row
renders as `<span className="inline-flex items-center gap-1.5">{label}<InfoTooltip>{tooltip}</InfoTooltip></span>`
— the identical structure already used for "Share of Stalled Deals" — instead of the current bare
`{icon}{label}` row. When `tooltip` is omitted, rendering is unchanged (this keeps `MetricCard`
usable without a tooltip if a future card doesn't need one, though all four current call sites
will pass one).

No new components, no new dependencies, no change to `InfoTooltip` itself. This is a presentation-
only change: it does not touch `diversificationBand`, `liftPresentation`, `diversificationCaveat`,
or any data-fetching/computation.

## Copy (per card)

**Diversification Index** — "How evenly risk is spread across manager × product combinations. 0
means concentrated in a few pairings, 1 means evenly spread. Normalized so the score is comparable
across portfolios of any size — a small portfolio with well-spread risk scores just as high as a
large one."

**Top Correlation Cluster** — "The manager, technical lead, or product group where one risk-alert
code shows up disproportionately more than its portfolio-wide baseline rate (the 'lift'). 'None
significant' means no group clears the bar for group size, share of deals affected, and lift above
baseline."

**Correlated Exposure** — "Total contract value sitting in deals carrying an alert code that
recurs across a significant cluster. Counts only active, undispositioned alerts — so this can read
lower than the correlation patterns shown in the tables below, which also include alerts a manager
has already acknowledged or accepted."

**Critical Deals** — "Deals currently carrying at least one active RED-severity alert that hasn't
been dispositioned. 'of N monitored' is the total count of active deals in the portfolio right
now."

User-approved; content is final barring copyedits caught in implementation.

## Error handling / edge cases

None beyond what already exists — the tooltip renders static copy per card, independent of the
data that loaded. The Diversification Index card's existing single-cell/empty-portfolio caveat
branch (`diversificationCaveat`) is unaffected; its tooltip is a fixed explanation of the metric in
general, while the caveat's own inline `title` attribute (on the "—" span) continues to explain the
specific empty/single-cell case as it does today — these are two different, non-conflicting hover
targets (label icon vs. value dash).

## Testing

No new pure logic to unit-test — this is JSX wiring around an already-tested, already-used
component (`InfoTooltip`). Verification is `pnpm run typecheck` plus a manual hover check on
`/portfolio` confirming all four icons appear and show the correct copy.

## Out of scope

- Redesigning `InfoTooltip` itself or its trigger affordance.
- Tooltips on any other page or any other card/table header beyond these four.
- Any change to the underlying metrics, thresholds, or data.
