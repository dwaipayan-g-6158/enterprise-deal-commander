# Human Touch Layer — Phase 4 (Atmosphere) — Design Spec
**Date:** 2026-07-23
**Status:** Approved

## Problem

Phases 1-3 (Foundation, Intelligence, Engagement) are merged. `Improvements/Human Touch Layer for Enterprise Deal Commander.md`'s "Phase 4: Atmosphere" is the last bundle — ambient, environmental, and personal touches. Of its 7 PRD features, two are explicitly descoped for this slice (see below), leaving 5: Adaptive Dashboard (4.8), Personalized User Profile Presence (4.12), Ambient Background Changes (4.21), Random Professional Quotes (4.5), Personality Messages Rotating (4.19).

**The defining constraint for this phase, stated explicitly by the user:** unlike Phases 1-3 — which concentrated everything on the dashboard homepage (greeting, insight banner, weekly review, streak, achievements, celebrations) — Phase 4's features must be **scattered throughout the app appropriately and professionally**, not piled onto the dashboard again. The design below is built around that constraint: the persistent app shell (`components/layout.tsx`, wrapping every one of the app's 10 pages) is the natural lever for this, since anything placed there is felt everywhere by construction, and the 5 non-dashboard pages (Deals, Portfolio, Autopsy, Analytics, Memory) currently carry zero human-touch copy at all — genuinely uncovered territory.

## Scope

**In scope** — 5 features, each described below.

**Out of scope / explicitly descoped by the user:**
- **4.11 Weather Awareness** — dropped entirely. Requires browser geolocation + an external weather API, a disproportionate integration for a "one line per session, skip if denied" nice-to-have, and the PRD itself marks it Low priority/optional.
- **4.22 Seasonal & Personal Touches** — dropped entirely.

**Explicitly de-scoped from the PRD's literal ask, decided during brainstorming:**
- **4.8 Adaptive Dashboard** ships as a **lightweight manual pin/reorder control**, not the PRD's literal behavioral auto-adapt engine (view/click/dwell tracking, weighted recency+frequency+dwell scoring, weekly recompute, ≥10-session gate). Rationale: this app has a single user, so there's no cross-user learning benefit to justify building a scoring engine from scratch; the PRD's own risk table flags "adaptive dashboard confuses users" as this phase's single biggest risk; and a manual control captures the actual payoff (a dashboard shaped like how the commander works) with a fraction of the complexity and none of the confusion risk, since nothing ever moves without the commander choosing it.
- Ambient Background's "30-minute gradual transition between bands" is implemented as a short (~2s) CSS transition **at the moment a band changes**, not a literal continuous interpolation over 30 minutes — nobody consciously watches this happen in real time, so true gradual interpolation is unneeded complexity for a subliminal effect.

## Architecture

**This phase is entirely frontend-only** — no schema changes, no `openapi.yaml` changes, no new routes, no backend work of any kind. Every feature is either pure client-side logic (localStorage-backed, following the established `KeyValueStore`/`src/lib/storage.ts` DI convention) or a CSS/presentational change. This is a deliberate contrast with Phase 3 (which added a table + endpoint) — Atmosphere is about how the existing app *feels*, not new data.

### Placement map

| Feature | Lives in | Why |
|---|---|---|
| 4.12 Profile Presence | `components/layout.tsx`'s `SidebarBody` footer (replaces the plain `{user?.email}`/`{user?.role}` block at lines 72-75) | `SidebarBody` is shared by both the desktop `<aside>` and the mobile `Sheet` slide-out — one change reaches every page on every form factor, exactly matching "scattered by construction." |
| 4.5 Quotes | `SidebarBody`'s header zone, below the "Commander Console" subtitle (line 43) | Same shared shell, a different zone from the footer so the two don't crowd each other. |
| 4.21 Ambient Background | Global — a `data-time-band` attribute on the root element + a handful of CSS custom-property overrides in `index.css` | Inherently app-wide; needs no per-page wiring, felt everywhere by construction. |
| 4.19 Personality Messages | The loading-skeleton moment on `pages/deals.tsx`, `portfolio.tsx`, `autopsy.tsx`, `analytics.tsx`, `memory.tsx` | These 5 pages have carried zero human-touch copy since Phase 1 — Phases 1-3 only ever touched the dashboard. Distinct from Phase 1's state-specific empty-state copy (4.9): this is generic rotating filler for a moment (loading) that currently has no message at all. |
| 4.8 Adaptive Dashboard (lightweight) | `pages/dashboard.tsx` only | Inherently dashboard-scoped. The fixed "top" block from Phases 1-3 (`DashboardHero`, `CelebrationWatcher`, `InsightBanner`, `WeeklyReview`, `EndOfDayReflection`, `DailyMission`) stays put; the ~9 structural rows below it (VitalSignsBar; Health/Risk/Alerts; NextActions/Forecast; StageFunnel/GateFunnel; DealRoster; CloseTimeline/RecentActivity; Velocity/Competitive; SimulationBand; MemoryInsights) become reorderable. |

Mobile note: `SidebarBody`'s header/footer zones (Quotes, Profile Presence) are only visible on mobile when the nav `Sheet` is open — the mobile top bar stays minimal (logo + title only), matching this app's existing convention where nav links, the ⌘K hint, and the user block are already sheet-only on mobile. Not a new inconsistency.

## The 5 Features

### 1. Adaptive Dashboard, lightweight (4.8)
The ~9 reorderable rows are collected as `{id, node}` entries in an array literal inside `pages/dashboard.tsx`'s existing render body — **not** extracted into separate component files or given prop-threaded interfaces, since they already close over local state (`openDialog`, `healthInitial`, `stageSelected`, and their setters) that would otherwise need awkward re-plumbing. A new pure module, `src/lib/dashboard-layout/row-order.ts`:
- `DEFAULT_ROW_ORDER: string[]` — the 9 row ids in their current shipped order.
- `getRowOrder(store: KeyValueStore): string[]` — reads `edc.dashboard.rowOrder`; validates the stored array is a permutation of exactly `DEFAULT_ROW_ORDER` (same set, same length) and falls back to default otherwise — protects against drift if a future row is added/removed/renamed.
- `moveRow(order: string[], id: string, direction: "up" | "down"): string[]` — pure array reorder, no-ops at either boundary.
- `resetRowOrder(store: KeyValueStore): void` — clears the stored override.

A small "Customize Layout" ghost-button (`text-xs text-muted-foreground`, matching this app's existing quiet-utility-control styling) sits just above `VitalSignsBar`. Clicking it opens a compact popover: row labels in current order, up/down icon-buttons per row (≥44px targets), and a "Reset to Default" action. Keyboard-operable by construction (buttons, not drag-and-drop) — no new drag-and-drop dependency needed. `pages/dashboard.tsx` renders `getRowOrder(defaultStore).map(id => <Fragment key={id}>{rowsById[id]}</Fragment>)` instead of the current fixed JSX sequence.

No tracking, no scoring, no session-count gate, no "this dashboard adapts to your workflow" transparency label — none of that applies, since nothing moves automatically.

### 2. Personalized User Profile Presence (4.12)
`SidebarBody`'s plain email/role text becomes: an auto-generated initials circle (derived from `me?.displayName`, falling back to the first letter of `me?.email` if `displayName` is absent) + the display name + a status line (`● Active` / `● Away` / `● Focus Mode`).

- **Active/Away** is auto-detected via a small idle tracker. Pure core: `computeStatus(lastActivityAt: Date, now: Date, idleThresholdMs: number): "active" | "away"` in `src/lib/presence/idle-tracker.ts`, with a 5-minute default threshold. A thin hook wraps it: listens for `mousemove`/`keydown`/`visibilitychange`, updates `lastActivityAt` on any of them, and re-evaluates on a 30-second interval so "Away" appears within 30s of the threshold passing rather than only on the next render.
- **Focus Mode** is a manual override, persisted at `edc.presence.focusMode` (`src/lib/presence/focus-mode.ts`: `isFocusModeEnabled`/`setFocusMode`), toggled via a small popover opened by clicking the status line. A `useFocusMode()` hook reads this and is checked by `CelebrationWatcher`, `InsightBanner`, the sidebar Quote line, and `PersonalityLine` — each renders nothing while Focus Mode is on. This makes Focus Mode a real, useful toggle ("just show me the work") rather than a cosmetic label, since this app has no push-notification system for it to more literally suppress.

No avatar upload flow — an initials circle only, matching this app's single-commander scope.

### 3. Ambient Background Changes (4.21)
Reuses the existing `getTimeBand()` (`lib/greetings/time-bands.ts` — morning 6-12, afternoon 12-17, evening 17-21, night 21-6) rather than introducing the PRD's slightly different sunrise/day/evening/night boundaries, for consistency with Phase 1's greeting logic rather than a second, competing time-banding scheme. A new `useTimeBand()` hook calls `getTimeBand(new Date())` on mount and re-evaluates every 5 minutes (to catch a band transition without requiring a page reload), setting `data-time-band="morning|afternoon|evening|night"` on the document root.

`index.css` gets a handful of `[data-time-band="..."]`-scoped overrides to the existing `@theme inline` custom properties (background/card lightness, shadow warmth) — capped at a genuinely subtle shift (≤5% perceptual change), layered under whichever light/dark theme is active via `next-themes`, never overriding the user's manual theme choice. The shift transitions over ~2s at the moment a band changes (not a literal 30-minute interpolation — see Scope). Under `prefers-reduced-motion`, the transition duration drops to 0 (instant swap, still applied, just not animated).

No opt-out toggle beyond the existing theme picker for this initial slice — the effect is designed to be at most subliminal (≤5% shift), matching the PRD's own "users should feel it, not see it" framing. Can be revisited if it turns out to be more noticeable in practice than intended.

### 4. Random Professional Quotes (4.5)
A ≥30-quote pool, `src/lib/quotes/quote-pool.json` (enterprise-sales/deal-management/business-leadership flavored, mix of attributed and unattributed, professional-with-occasional-wryness tone matching the PRD's explicit guidance — never motivational-poster cheesy). One quote per **local calendar day**, non-repeating until the pool is exhausted, tracked via its own small dedup module, `src/lib/quotes/quote-rotation.ts` (`edc.quotes.shown` storage key) — a domain-owned file mirroring the shape of `lib/greetings/shown-history.ts`, following this codebase's established convention of one small pure file per feature rather than a shared generic "pick unseen from pool" utility (three phases have consistently kept these separate; not changing that now). Rendered as a small italic line in `SidebarBody`'s header zone, below "Commander Console." Hidden while Focus Mode is on.

### 5. Personality Messages, Rotating (4.19)
A ≥30-message pool, `src/lib/personality/message-pool.json` (generic warm filler — "Good to see you again," "Ready when you are," "One deal at a time" — distinct from Phase 1's state-*specific* empty-state copy). A small `<PersonalityLine />` component + its own dedup module, `src/lib/personality/rotation.ts` (`edc.personality.shown` storage key, no-repeat-within-72h), rendered in the loading-skeleton area of `pages/deals.tsx`, `portfolio.tsx`, `autopsy.tsx`, `analytics.tsx`, and `memory.tsx` — the one moment on those 5 pages that currently shows nothing but a bare `<Skeleton>`. Hidden while Focus Mode is on.

## Error Handling & Edge Cases

- **Row order drift:** if a future change adds/removes/renames a dashboard row, `getRowOrder()`'s permutation check fails and the stored override is silently discarded in favor of `DEFAULT_ROW_ORDER` — never a partial/broken layout.
- **Idle tracker across tabs/windows:** no cross-tab sync — Active/Away is evaluated per-tab based on that tab's own input events. Acceptable for a single-user app typically working in one tab; not worth `storage`-event plumbing for this.
- **Focus Mode persistence:** read once on mount via `useFocusMode()`; toggling it updates local React state and localStorage together, so it applies within the current tab's session without requiring a reload, but does not sync live across tabs (same reasoning as idle tracking).
- **Ambient background respecting reduced motion:** the `data-time-band` attribute and its CSS overrides still apply under `prefers-reduced-motion` — only the transition's animated duration is skipped, never the tint itself (skipping the tint entirely would be inconsistent with every other reduced-motion handling in this app, which drops animation, not the resulting state).
- **Quote/personality pool exhaustion:** both rotation modules reset their shown-history once every pool entry has been shown, exactly mirroring `shown-history.ts`'s existing exhaustion-reset behavior.
- **`useGetMe()` returning no `displayName`:** Profile Presence's initials circle falls back to the first letter of `email`; if both are absent (a transient loading/error state), renders a neutral placeholder circle rather than an empty one.

## Testing Plan

Vitest TDD for every new pure module (dependency-injected `now`/`store`, never throw — matching `lib/greetings`/`lib/mission`/`lib/weekly`/`lib/streak`/`lib/reflection`'s existing shape exactly):
- `dashboard-layout/row-order.ts` — default order, permutation-validation fallback, move-up/down including boundary no-ops, reset.
- `presence/idle-tracker.ts`'s `computeStatus` — active/away boundary, exactly-at-threshold behavior.
- `presence/focus-mode.ts` — read/write round-trip, defensive parsing.
- `quotes/quote-rotation.ts` — pick-unseen, exhaustion-reset, defensive parsing of corrupt/missing storage.
- `personality/rotation.ts` — pick-unseen, 72h-window dedup, exhaustion-reset.

No new frontend component tests (this repo's only automated tests are pure-function Vitest — no DB/component-mocking infrastructure exists). All 5 features' UI verified live via Playwright/chrome-devtools MCP: Customize Layout popover + reorder + reset, Profile Presence status transitions + Focus Mode suppressing the other 4 features' soft UI, the ambient tint actually differing across a simulated time change, the sidebar quote appearing and rotating daily, and personality messages appearing on each of the 5 target pages' loading state.

## Mobile / PWA Considerations

Same responsive shell as Phases 1-3 — no new PWA infrastructure. Profile Presence and Quotes render inside the existing mobile `Sheet` (open-nav-to-see, matching how the rest of `SidebarBody` already behaves on mobile — not a new limitation). The Customize Layout popover and Focus Mode popover both need to fit comfortably in a narrow viewport (~360-390px) — verified live at that width. Ambient background and personality messages need no mobile-specific handling (pure CSS / plain text respectively).

## Backlog (explicitly deferred, not part of this slice)

4.11 Weather Awareness and 4.22 Seasonal & Personal Touches — dropped per user decision (see Scope). The PRD's literal Adaptive Dashboard behavioral-tracking engine (view/click/dwell scoring, ≥10-session gate, weekly recompute) — deferred indefinitely in favor of the lightweight manual control shipped here; would only be worth revisiting if this app ever became multi-user. A future opt-out toggle for Ambient Background, if the shift proves more noticeable in practice than the ≤5% cap intends.
