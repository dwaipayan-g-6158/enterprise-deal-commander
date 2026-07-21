# Human Touch Homepage — Design Spec
**Date:** 2026-07-21
**Status:** Approved

## Problem

Enterprise Deal Commander's dashboard is functional but impersonal: the header is a static `"Portfolio Command Center" / "Continuous intelligence and risk monitoring"` string, there is no acknowledgment of time of day, returning-user context, or recent effort, and several empty states still read as generic placeholder text. `Improvements/Human Touch Layer for Enterprise Deal Commander.md` (23 features, 4 phases, ~12 weeks) proposes fixing this broadly. This spec scopes the **first slice**: the PRD's own "Phase 1: Foundation" bundle, adapted to what already exists in this codebase.

Two Phase 1 items already exist under different names and are excluded here: "Daily Mission" (4.3) / "Intelligent Recommendations" (4.23) are substantially covered by the existing `NextActions` widget; "AI Observations" (4.4/4.17) are substantially covered by the existing `MemoryInsights` widget. Both are dashboard-wide, non-personalized, already deterministic (no LLM) — see [[edc-v2-sovereign-intelligence]] / [[edc-deal-memory-improvements]] equivalents in the codebase.

## Scope

**In scope** (PRD §4.1, §4.2, §4.9 [partial], §4.10, §4.15 [partial], §4.18):

1. **Dynamic Greeting Engine** — time-aware, contextual, rotating greeting replacing the static header.
2. **Time Awareness** — the 4-time-band logic underpinning the greeting (shared plumbing, not a separate feature).
3. **Welcome Back Memory** — "last session you..." summary with a continue-link.
4. **Continue Working** — last-5-visited-deals quick-link list.
5. **Empty-state copy pass** — four named surfaces only (Dashboard recent-activity card, Deal List, Critical Alerts feed, Deal Roster board column), not an app-wide sweep.

**Out of scope** (deferred to later slices — see "Backlog" below): achievements, streaks, adaptive dashboard reordering, ambient background theming, weather awareness, seasonal/birthday messages, weekly review, celebration toasts, motivational progress indicators, professional quotes, personality-message rotation, full app-wide empty-state sweep, personalized profile presence/focus mode.

This app is single-user (one "commander" row, no multi-tenant model — see `Deal-Commander/CLAUDE.md`), so "personalization" here means contextualization to current state, not per-user preference learning.

## Solution

### 1. Time Awareness & Dynamic Greeting Engine

Four time bands from browser local time: Morning (6–12), Afternoon (12–17), Evening (17–21), Night (21–6). A literal pool of 40+ greeting strings per band (160+ total), each tagged with an optional data "hook":

```json
{ "id": "morning-02", "hook": "legalGateCount",
  "text": "Good Morning, {{name}}.\n{{legalGateCount}} deals are awaiting legal review today." }
```

**Hooks** (data facts, all derived from data the dashboard already fetches — no new backend aggregation):

| Hook | Source | Eligibility |
|---|---|---|
| `legalGateCount` | active deals at Legal/Contract gate | > 0 |
| `closeThisWeekValue` / `closeThisWeekCount` | deals closing this week | > 0 |
| `recentPhaseAdvanceCount` | stage-changes in last 24h (activity feed) | > 0 |
| `activeValidationValue` | TCV in active validation | > 0 |
| `overdueActionCount` | NextActions' own overdue/due-soon aggregation | > 0 |
| `oneStepFromClose` | a deal with exactly one gate/step remaining | exists |
| `null` (no hook) | — | always eligible (generic safety pool) |

**Selection algorithm**: filter pool[band] → eligible (hook null, or hook's rule passes) → exclude ids shown in the last 48h (localStorage) → if that empties the set, relax the 48h filter (a repeat beats a blank) → random pick → interpolate `{{name}}` and hook values → record `{id, shownAt}`, pruning entries older than 48h.

Pool authoring note: 40+ per band is hit via ~10-15 sentence shapes per band, several reused across 2-4 hook variants (varying which stat is referenced) — a literal pool per the chosen approach, authored efficiently rather than as 160+ wholly independent sentences.

**Name**: `GetMeResponse` gains `displayName` (already available server-side via the JWT claim / `commanders.displayName`, just not exposed). If absent, greeting templates degrade to a name-free phrasing (no dangling comma/space).

### 2. Welcome Back Memory

Rendered only when `previousVisitAt` is non-null (see below) and there is ≥1 relevant activity event since then. Summarizes up to ~5 bullet lines from the existing portfolio activity feed (`useListPortfolioActivity`, bumped limit, filtered client-side to events after `previousVisitAt`), plus a "Continue to X →" link to whichever deal has the most recent activity-log event within that window.

**Backend touch endpoint**: `commanders` gains a nullable `last_dashboard_visit_at timestamptz` column (direct SQL, additive — per this repo's established convention for avoiding the `drizzle push` TTY prompt). New endpoint `POST /v1/auth/dashboard-visit`: atomically reads the current value (returned as `previousVisitAt`), then stamps it to `now()` in the same round-trip (CTE `UPDATE ... RETURNING`). Called once per dashboard mount, guarded (ref flag) against React's dev-mode double-invoke so it isn't touched twice per real visit.

First-ever visit (`previousVisitAt: null`) → Welcome Back Memory doesn't render at all; only the greeting shows. Endpoint failure is treated the same way (non-blocking).

### 3. Continue Working

`src/lib/recent-deals.ts` — localStorage-only (`edc.recentDeals`), no backend. On deal-cockpit page mount, push `{dealId, dealName, stageName, visitedAt}`, cap at 5, dedupe by id (existing entry moves to front). Rendered as a compact list on the dashboard; omitted entirely (no empty-state message) until at least one entry exists.

### 4. Empty-State Copy Pass

Four surfaces, direct string edits only (no new components), reusing each file's existing conditional branches:

| File | Current | New (representative) |
|---|---|---|
| `pages/deals.tsx` (`emptyMessage`, ~L270-276) | "No deals match your filters." / "No active deals yet." / "No closed deals yet." / `No {state} deals.` | "Nothing matched those filters. Try adjusting them." / "Your active pipeline is empty. Time to find the next opportunity." / "No closed deals yet. Your first win will show up here." / kept generic for other states |
| `components/roster/board/board-column.tsx` (~L157) | "No deals" | "All clear" (stays terse — narrow board column) |
| `components/dashboard/widgets/critical-alerts-feed.tsx` (~L92) | "No critical alerts currently active." | "Nothing critical right now. Enjoy the calm." |
| `pages/dashboard.tsx` recent-activity card (~L182) | "No recent activity yet." | "It's quiet in here. Let's change that." |

## Architecture / Data Flow

**Backend (additive only, no new tables):**
1. `lib/db/src/schema/auth.ts` — `commanders.lastDashboardVisitAt` (nullable timestamptz), applied via a new direct-SQL migration file.
2. `lib/api-spec/openapi.yaml` — `GetMeResponse` gains `displayName: string`; new `POST /v1/auth/dashboard-visit` operation + `{ previousVisitAt: string | null }` response. Regenerate via Orval (`pnpm --filter @workspace/api-spec run codegen`) — do not hand-edit generated output.
3. `artifacts/api-server/src/routes/auth.ts` — `GET /auth/me` includes `displayName`; new `dashboard-visit` route.

**Frontend:**
- `src/lib/greetings/{time-bands,greeting-pool.json,select-greeting,shown-history}.ts` — pure, testable modules.
- `src/lib/recent-deals.ts` — localStorage helpers.
- `src/components/dashboard/dashboard-hero.tsx` (new) — composes Greeting (always) → Welcome Back Memory (conditional) → Continue Working (conditional). Replaces the static header block in `dashboard.tsx` (~L101-104). Consumes data already queried by `dashboard.tsx` (`useGetMe`, `useGetIntelligenceSummary`, `useListPortfolioActivity`) plus the one new visit-touch call — no duplicate fetching.
- All 15 existing dashboard widgets are unaffected, same order, below the new hero.
- Deal-cockpit page (`pages/deal-cockpit.tsx`) gains a mount effect calling `recent-deals` push.

## Error Handling & Edge Cases

- `/dashboard-visit` failure → treated as `previousVisitAt: null` (Welcome Back Memory silently skipped, nothing blocks the rest of the page).
- Zero contextual data anywhere (quiet pipeline) → generic (`hook: null`) pool guarantees a non-empty candidate set every time.
- Corrupted/oversized localStorage JSON (`edc.greetings.shown`, `edc.recentDeals`) → try/catch on parse, reset to `[]` on failure.
- Missing `displayName` → name-free greeting variant, no template artifacts.
- Hero transitions respect `prefers-reduced-motion` (existing app-wide convention).

## Testing Plan

- Vitest unit tests for the pure logic: `time-bands.ts` (band boundaries incl. midnight wrap), `select-greeting.ts` (eligibility filtering, 48h dedup, fallback-relaxation-when-empty, always-non-empty guarantee), `shown-history.ts` (pruning).
- Backend test for `/dashboard-visit`: first call → `previousVisitAt: null`; second call → returns the first call's stamped timestamp.
- No new frontend component tests (matches this repo's existing thin frontend-test convention) — verified live instead via chrome-devtools MCP: load dashboard, confirm hero renders correctly, visit a deal and confirm it appears in Continue Working on return to dashboard, spot-check the four rewritten empty states.

## Mobile / PWA Considerations

The app is already an installable PWA (`vite-plugin-pwa`, full manifest, Workbox service worker caching GET `/api/v1|v2/*` reads via StaleWhileRevalidate) with a single responsive dashboard layout (`use-mobile.tsx` / `use-media-query.ts` / `layout.tsx`) — the earlier dedicated `/m` mobile page is retired (`/m` now redirects to `/`). This slice adds no new PWA infrastructure; it fits the new surfaces into the existing one:

- `<DashboardHero />` uses the same responsive breakpoints as the rest of the dashboard: Greeting/Welcome Back Memory stack full-width on narrow viewports; Continue Working renders as a horizontally-scrollable strip rather than wrapping.
- All touch targets (Continue Working links, "Continue to X →") sized for touch (≥44px), not dependent on hover states.
- `POST /v1/auth/dashboard-visit` is a mutation, so it's untouched by the Workbox GET-only caching rule; it fails soft when offline (same as the rest of the error handling above) rather than blocking the page.
- No new icons or manifest entries needed — reuses the existing PWA shell as-is.

## Backlog (explicitly deferred, not part of this slice)

From the Human Touch Layer PRD, everything not listed under "In scope" above: Daily Mission (4.3, ~covered by NextActions), Intelligent Insight Banner (4.4, ~covered by MemoryInsights), Professional Quotes (4.5), Productivity Streak (4.6), Achievement System (4.7), Adaptive Dashboard (4.8), full app-wide Human Messages sweep (4.9 beyond the 4 named surfaces), Weather Awareness (4.11), Personalized Profile Presence/Focus Mode (4.12), Weekly Review (4.13), Celebration Moments (4.14), remaining Smart Empty States (4.15 beyond the 4 named surfaces), Motivational Progress Indicators (4.16), AI Observations (4.17, ~covered by MemoryInsights), Personality Messages rotation (4.19), End-of-Day Reflection (4.20), Ambient Background Changes (4.21), Seasonal & Personal Touches (4.22), Intelligent Recommendations (4.23, ~covered by NextActions).
