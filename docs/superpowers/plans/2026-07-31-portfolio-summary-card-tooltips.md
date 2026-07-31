# Portfolio Summary Card Tooltips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hover-triggered info icon to each of the four Portfolio Risk Analysis summary card
titles (Diversification Index, Top Correlation Cluster, Correlated Exposure, Critical Deals),
showing an explanation of *why* the metric works the way it does.

**Architecture:** Reuse the existing `InfoTooltip` component (already used on this same page's
"Share of Stalled Deals" column header) via a new optional `tooltip` prop on `MetricCard`, the
local card-shell component inside `portfolio-summary-cards.tsx`. No new components.

**Tech Stack:** React 19 + TypeScript, existing `InfoTooltip` (`@/components/ui/info-tooltip`).

## Global Constraints

- File to modify: `artifacts/edc/src/components/cockpit/portfolio-summary-cards.tsx` — no other
  file changes.
- Reuse `InfoTooltip` exactly as it's already used at `artifacts/edc/src/pages/portfolio.tsx`
  (search that file for `InfoTooltip` to see the live precedent) — same `inline-flex items-center
  gap-1.5` wrapper structure around the label + icon.
- The four tooltip copy blocks are final (user-approved in the design spec at
  `docs/superpowers/specs/2026-07-31-portfolio-summary-card-tooltips-design.md`) — use them
  verbatim, do not paraphrase.
- No new tests: this is JSX wiring around an already-tested component with no new pure logic.
  Verification is `pnpm run typecheck` plus a manual hover check.
- Do not touch `diversificationBand`, `liftPresentation`, `diversificationCaveat`, or any
  data-fetching/computation in this file.

---

### Task 1: Add tooltip prop to MetricCard and wire copy into all four cards

**Files:**
- Modify: `artifacts/edc/src/components/cockpit/portfolio-summary-cards.tsx`

**Interfaces:**
- Consumes: `InfoTooltip` from `@/components/ui/info-tooltip` (existing, unchanged — takes
  `children: React.ReactNode` as the tooltip content, renders its own trigger icon and provider).
- Produces: `MetricCardProps` gains `tooltip?: React.ReactNode` — no other file imports
  `MetricCardProps` (it's a local, non-exported interface in this file), so no downstream
  consumers are affected.

- [ ] **Step 1: Add the `InfoTooltip` import**

At the top of `artifacts/edc/src/components/cockpit/portfolio-summary-cards.tsx`, add a new import
line alongside the existing ones (after the `diversificationBand, liftPresentation` import):

```tsx
import { InfoTooltip } from "@/components/ui/info-tooltip";
```

- [ ] **Step 2: Add the `tooltip` prop to `MetricCardProps` and render it in the label row**

Currently:
```tsx
interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  subtitle: React.ReactNode;
  valueClassName?: string;
  delayMs: number;
}
```
Change to:
```tsx
interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  subtitle: React.ReactNode;
  valueClassName?: string;
  delayMs: number;
  tooltip?: React.ReactNode;
}
```

Currently `MetricCard`'s label row is:
```tsx
function MetricCard({ icon, label, value, subtitle, valueClassName, delayMs }: MetricCardProps) {
  return (
    <Card
      className="animate-in fade-in fill-mode-both duration-300 transition-shadow hover:shadow-md"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className={cn("text-2xl font-bold tabular-nums leading-tight", valueClassName)}>
          {value}
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}
```
Change the destructure and the label row to:
```tsx
function MetricCard({ icon, label, value, subtitle, valueClassName, delayMs, tooltip }: MetricCardProps) {
  return (
    <Card
      className="animate-in fade-in fill-mode-both duration-300 transition-shadow hover:shadow-md"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
          {tooltip && <InfoTooltip>{tooltip}</InfoTooltip>}
        </div>
        <div className={cn("text-2xl font-bold tabular-nums leading-tight", valueClassName)}>
          {value}
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}
```
(The outer `div` is already `flex items-center gap-1.5`, matching the wrapper `InfoTooltip` needs
elsewhere in this codebase — no extra wrapper span required here since the icon/label/tooltip are
already siblings in a flex row.)

- [ ] **Step 3: Pass `tooltip` into the Diversification Index card**

Find the first `<MetricCard ... label="Diversification Index" ...>` call. Add a `tooltip` prop
(place it near the other props, e.g. right after `label`):
```tsx
tooltip="How evenly risk is spread across manager × product combinations. 0 means concentrated in a few pairings, 1 means evenly spread. Normalized so the score is comparable across portfolios of any size — a small portfolio with well-spread risk scores just as high as a large one."
```

- [ ] **Step 4: Pass `tooltip` into the Top Correlation Cluster card**

Find the `<MetricCard ... label="Top Correlation Cluster" ...>` call. Add:
```tsx
tooltip="The manager, technical lead, or product group where one risk-alert code shows up disproportionately more than its portfolio-wide baseline rate (the 'lift'). 'None significant' means no group clears the bar for group size, share of deals affected, and lift above baseline."
```

- [ ] **Step 5: Pass `tooltip` into the Correlated Exposure card**

Find the `<MetricCard ... label="Correlated Exposure" ...>` call. Add:
```tsx
tooltip="Total contract value sitting in deals carrying an alert code that recurs across a significant cluster. Counts only active, undispositioned alerts — so this can read lower than the correlation patterns shown in the tables below, which also include alerts a manager has already acknowledged or accepted."
```

- [ ] **Step 6: Pass `tooltip` into the Critical Deals card**

Find the `<MetricCard ... label="Critical Deals" ...>` call. Add:
```tsx
tooltip="Deals currently carrying at least one active RED-severity alert that hasn't been dispositioned. 'of N monitored' is the total count of active deals in the portfolio right now."
```

- [ ] **Step 7: Typecheck**

Run: `pnpm run typecheck`
Expected: clean (`Done`) across all 4 workspace projects — this confirms the `tooltip?:
React.ReactNode` prop and its four string literal usages are all well-typed, and that `InfoTooltip`
is imported correctly.

- [ ] **Step 8: Manual verification**

If a dev server is reachable (check with the project's `run`/`Deal-Commander:verify` skill or by
checking whether ports 5000/5173 are already listening before starting anything new), open
`/portfolio` and hover the small info icon next to each of the four card titles. Confirm:
- All four icons render (next to the label, same visual size/position as the existing "Share of
  Stalled Deals" icon on this same page).
- Each tooltip shows its own correct copy (not a shared/duplicated string).
- No layout shift or overlap with the existing badge/value content in any card.

If a dev server isn't reachable in your environment, say so explicitly rather than skipping this
silently — typecheck is the fallback signal.

- [ ] **Step 9: Commit**

```bash
git add artifacts/edc/src/components/cockpit/portfolio-summary-cards.tsx
git commit -m "$(cat <<'EOF'
feat(portfolio): add hover-info tooltips to summary card titles

Reuses the existing InfoTooltip pattern (already on the Stalled Deals
column header) to explain the "why" behind Diversification Index, Top
Correlation Cluster, Correlated Exposure, and Critical Deals.
EOF
)"
```

---

## Self-Review

**Spec coverage:** The spec's single approach (add `tooltip` prop to `MetricCard`, reuse
`InfoTooltip`, four copy blocks) is fully covered by Task 1's 6 wiring steps. The spec's "no new
tests" and "no data/logic changes" constraints are reflected in the Global Constraints section and
in Task 1 having no test-writing step. Out-of-scope items from the spec (redesigning
`InfoTooltip`, tooltips elsewhere) have no corresponding task, correctly.

**Placeholder scan:** No TBD/TODO; every step shows the actual before/after code or the actual
copy string, not a description of what to write.

**Type consistency:** `MetricCardProps.tooltip?: React.ReactNode` is defined once (Step 2) and
consumed identically at all four call sites (Steps 3-6) — no signature drift, since this is a
single-task plan with one interface definition.
