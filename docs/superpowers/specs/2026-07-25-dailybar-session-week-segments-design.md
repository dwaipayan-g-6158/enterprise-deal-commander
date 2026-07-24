# DailyBar Session/Week Segments Design

Date: 2026-07-25
Status: Approved, pending implementation plan.

## Problem

Two dashboard surfaces eat disproportionate vertical real estate for what
they convey:

- `DashboardHero`'s "Last session you:" box (`dashboard-hero.tsx`) — a
  bordered card listing up to 5 activity rows plus a "Continue where you left
  off →" link, rendered directly under the greeting whenever there's activity
  since the previous visit.
- `WeeklyReview` (`components/dashboard/widgets/weekly-review.tsx`) — a
  full-width `Card`, rendered only on Monday ("This Week") or Friday ("Week
  Summary"), showing 2–3 bullet stats plus (Friday only) a pipeline-vs-last-week
  delta badge, dismissable for the rest of that ISO week.

Both stack as full-width rows above the rest of the dashboard, so on a Friday
morning with recent activity a user can face 3 stacked cards (Hero box +
Weekly Review + `DailyBar`) before reaching any pipeline content.

This is not a new problem class: `DailyBar` itself already replaced exactly
this failure mode once — its own header comment records compacting "the
former stack of three full-width dashboard cards (Insight Banner, Today,
Today's Mission — up to ~500px combined) into a single ~52px bar" of
trigger-button + `Popover` "segments." This spec extends that same bar with
two more segments rather than inventing a new pattern.

## Decision

Add two segments to the existing `DailyBar`, in this left-to-right order:

**Welcome Back → Mission → Today → Insight → Week**

Welcome Back leads because it answers "what happened since I left," the most
relevant thing on arrival. Week trails because it's the least urgent and most
occasional (visible only 2 days/week). Mission (always-rendering) stays the
bar's stable anchor in the middle, unchanged.

`DashboardHero` keeps its greeting headline/subline and the 🔥 streak line —
only the "Last session you" box is removed from it. `WeeklyReview` is deleted
outright; its logic moves into the new Week segment.

### Welcome Back segment

New file: `components/dashboard/daily-bar/welcome-back-segment.tsx`.

- **Trigger:** `History` icon + "Last visit" label + an item-count badge
  (e.g. `(3)`), styled like Mission's `{done}/{total}` count — no progress
  bar (nothing here is "completed").
- **Absent when:** no previous visit recorded, or zero activity occurred
  since it — the button doesn't render at all (same "absent, not empty" gating
  Insight/Today already use), not merely an empty state.
- **Popover:** header "Last session you:", the same itemized list (✓-prefixed
  `summary` text, capped at 5) the current box shows, then a "Continue where
  you left off →" button navigating to the most recently touched deal.
- **No dismiss control.** Unlike Today's EOD nag, this reflects what actually
  happened last session and disappears on its own once there's nothing left
  to report — same reasoning as Mission having no dismiss.
- **Data:** the same `useListPortfolioActivity(welcomeBackParams)` call
  already in `dashboard-hero.tsx` today (keyed off `previousVisitAt`), just
  relocated. `previousVisitAt` — already computed once in `dashboard.tsx` via
  `useDashboardVisit()` — is passed to `DailyBar` as a new prop instead of
  only to `DashboardHero`.

### Week segment

New file: `components/dashboard/daily-bar/week-segment.tsx`.

- **Trigger:** `CalendarDays` icon + "Week" label + a live glanceable
  chip — **Monday:** an open-items count badge (overdue + upcoming-close,
  e.g. `3 open`); **Friday:** the pipeline delta chip inline, reusing the
  existing `DeltaBadge` component/coloring (e.g. `+$1.2M`). This is the one
  place new information density is added rather than purely compacted —
  the point of a glanceable bar segment is to make the "is this week trending
  up or down" signal visible without a click.
- **Absent when:** not Monday/Friday, or dismissed for the current ISO week.
- **Popover:** header dynamically "This Week" (Monday) / "Week Summary"
  (Friday); same bullet content the current widget renders (Monday: deals in
  validation / upcoming closes / overdue items; Friday: stage advances /
  playbook completions / pipeline-vs-last-week delta), plus a dismiss (`X`)
  control inside the popover — same placement convention `TodaySegment`
  already uses for its own EOD dismiss. Dismissing hides the segment for the
  rest of that ISO week, reusing `lib/weekly/review-dismiss.ts` unchanged.
- **Data:** the same four hooks `weekly-review.tsx` already calls
  (`useGetIntelligenceSummary`, `useGetNextActions`,
  `useListPortfolioActivity`, `useGetVitalSigns`), relocated as-is. Every one
  is already called elsewhere on the dashboard page, so react-query dedupes
  the query keys — no added network cost, matching the existing segments'
  documented behavior.

## Scope

Frontend-only, `artifacts/edc/src`:

- New: `components/dashboard/daily-bar/welcome-back-segment.tsx`,
  `components/dashboard/daily-bar/week-segment.tsx`.
- Edit: `components/dashboard/daily-bar/daily-bar.tsx` (render both new
  segments in the order above; accept `previousVisitAt` prop and thread it to
  `WelcomeBackSegment`).
- Edit: `components/dashboard/dashboard-hero.tsx` (remove the "Last session
  you" box and the `welcomeBackActivity`/`mostRecentDealId`
  logic/hooks/props that only existed to support it; keep everything else).
- Edit: `pages/dashboard.tsx` (remove the `<WeeklyReview />` line; pass
  `previousVisitAt` to `<DailyBar />`).
- Delete: `components/dashboard/widgets/weekly-review.tsx`.
- No change to `lib/weekly/week-boundaries.ts`, `lib/weekly/review-dismiss.ts`,
  or any greeting/streak logic — all reused as-is.
- No backend, schema, or API changes — every hook involved already exists
  and is already called from the dashboard tree today.

## Testing

No component-level tests exist today for `weekly-review.tsx`,
`dashboard-hero.tsx`, or the other `daily-bar/*.tsx` segments — coverage for
this area lives at the pure-logic layer (`lib/weekly/week-boundaries.test.ts`,
`lib/weekly/review-dismiss.test.ts`, `lib/greetings/*.test.ts`), all of which
is reused unchanged, so no new unit tests are required for this move.

Manual/live verification after implementation (per `Deal-Commander:verify`):
- Welcome Back segment appears with the right count and popover list after a
  return visit with activity since the last one; absent on a first-ever visit
  or a visit with no activity since the last one.
- Week segment appears on a Monday-dated and a Friday-dated system clock
  (emulate via the same technique used for `week-boundaries` testing),
  showing the right trigger chip and popover content for each; dismissing it
  hides it for the rest of that ISO week and it reappears the following
  Monday.
- Bar wraps sensibly (existing `flex flex-wrap` behavior) when all 5 segments
  are present at a narrow viewport width.
- `prefers-reduced-motion` and keyboard/focus behavior for the two new
  segments match the existing three (focus ring, `Popover` keyboard
  dismissal).

## Out of scope

- No change to Mission/Today/Insight segments themselves.
- No rename of `DailyBar` (the component/file name is an internal detail;
  renaming would touch imports across `dashboard.tsx` for no user-facing
  benefit).
- No change to the underlying "last visit"/"weekly review" API contracts —
  this is a presentation-layer move only.
