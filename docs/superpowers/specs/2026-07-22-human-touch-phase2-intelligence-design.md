# Human Touch Layer — Phase 2 (Intelligence) — Design Spec
**Date:** 2026-07-22
**Status:** Approved

## Problem

Phase 1 (`2026-07-21-human-touch-homepage-design.md`, merged) gave the dashboard a contextual greeting and a welcome-back summary, but the page still doesn't proactively tell the commander *what to focus on today* or *what changed this week*. `Improvements/Human Touch Layer for Enterprise Deal Commander.md`'s "Phase 2: Intelligence" names five features for this: Daily Mission (4.3), Intelligent Insight Banner (4.4), AI Observations (4.17), Intelligent Recommendations (4.23), Weekly Review (4.13).

The Phase 1 spec already flagged four of these five as "substantially covered" by two existing widgets and deferred them rather than build duplicates:
- `NextActions` (overdue decisions / due-this-week / playbook steps / upcoming closes, with a "View all" grouped popup shipped 2026-07-22) already surfaces the raw material for Daily Mission (4.3) and Intelligent Recommendations (4.23).
- `MemoryInsights` (deterministic pattern rules over archived deals, gated at ≥3 archived deals) already surfaces the raw material for AI Observations (4.17) and, partially, Intelligent Insight Banner (4.4).

Building all five as separate PRD-named surfaces would put three near-duplicate "what should I do next" panels on one dashboard next to the widgets that already do this. This slice instead **consolidates the five into three surfaces**, each sourced from data the dashboard already fetches.

## Scope

**In scope** — three new surfaces, each a data-source reuse (new UI/logic, existing endpoints):

| Surface | Covers | Source data |
|---|---|---|
| **Daily Mission** | 4.3 Daily Mission + 4.23 Intelligent Recommendations | `useGetNextActions` (existing) via a new cross-category priority scorer |
| **Insight Banner** | 4.4 Intelligent Insight Banner + 4.17 AI Observations | `useGetVitalSigns`, `useGetIntelligenceSummary`, `useGetMemoryInsights` (all existing) via a new insight-builder |
| **Weekly Review** | 4.13 Weekly Review | `useListPortfolioActivity` (since/until), `useGetVitalSigns` baseline, `useGetIntelligenceSummary` (all existing) via a new week-boundary calculator |

**Out of scope / explicitly not duplicated:**
- The `NextActions` widget and its "View all" dialog are untouched and remain the full categorized detail view; Daily Mission is a summary layer above it, not a replacement (confirmed with the user — Phase-1's "Continue Working" removal, PRD 4.18, is the precedent for not shipping two surfaces that say the same thing).
- The `MemoryInsights` widget is untouched and remains the full browsable pattern list; Insight Banner surfaces at most one pattern per session as a candidate, it doesn't reimplement the pattern rules.
- No backend work: no new tables, no `openapi.yaml` changes, no Orval codegen, no new routes. Every datum needed already has a generated hook.
- Deferred to Phase 3/4 (unchanged from the PRD): streaks, achievements, celebration moments, motivational progress copy beyond the Mission's own bar, adaptive dashboard reordering, ambient theming, weather, quotes, personality-message rotation, seasonal/birthday touches, personalized profile presence.

This app is single-user (one "commander" row), so nothing here is per-user personalization — it's contextualization to current pipeline/activity state, same framing as Phase 1.

## Solution

### 1. Daily Mission (4.3 + 4.23)

A `Card` titled "Today's Mission" rendering up to 5 checklist rows, ranked by a new pure `buildMission()` (`src/lib/mission/priority-scorer.ts`) that flattens `NextActionsData`'s four buckets (`overdue`, `dueThisWeek`, `playbookSteps`, `upcomingCloses`) into one list, ordered **category urgency → deal TCV → due-date recency**. This ranking *is* the Intelligent Recommendations (4.23) logic — a separate "Recommendations" panel would just be this list rendered twice.

Checking an item calls `toggleAck()` (`src/lib/mission/daily-ack.ts`, localStorage, keyed by local calendar date) — an acknowledgment, not a status mutation. The four source categories have no single shared "complete" action (a decision, a playbook step, and a close date are different kinds of things), so "done for today" is the honest, uniform semantic; playbook-step rows still deep-link to the cockpit where the step can actually be completed. The list resets automatically at local midnight (new date key ⇒ empty ack set). A `Progress` bar shows `acked/total`, with a warm contextual line at completion.

### 2. Insight Banner (4.4 + 4.17)

A slim, borderless-card banner directly under the greeting, rendering **one** rotating observation per session via a new pure `buildInsights()` (`src/lib/insights/insight-builder.ts`) that produces candidates in four kinds:
- **comparison** — week-over-week pipeline delta, only when `vital-signs.baseline` is non-null (never fabricates a comparison with no history).
- **anomaly** — stalled-deal count from `intelligence/summary.staleDeals`.
- **pattern** — one of `memory-insights`'s deterministic rules (this is 4.17, surfaced here rather than duplicated).
- **trend** — reserved kind for future data sources; not populated by any current input, kept for the type to stay stable as new candidates are added later.

A new `pickInsight()` (`src/lib/insights/insight-history.ts`) rotates: exclude ids shown within a dedup window (mirrors `shown-history.ts`'s 48h approach), relax if that would leave nothing, record the pick. Locked once per mount (same ref-lock technique as `DashboardHero`'s greeting) so a background refetch never reshuffles it mid-session. Renders `null` — no empty-state chrome — when no candidate qualifies.

### 3. Weekly Review (4.13)

A `Card` that renders **only on Monday or Friday**, gated by a new pure `week-boundaries.ts` (the codebase has no week-math anywhere today — confirmed by search). Monday shows a "This Week" briefing from current pipeline state (active-validation count, approaching closes, overdue items). Friday shows a "Week Summary" from the week's activity window (`useListPortfolioActivity({since: startOfWeek, until: now})`, counting `playbook.step_changed`/`deal.stage_changed` events) plus a WoW pipeline delta — shown only when `vital-signs.baseline` exists, never invented. A dismiss control hides it for the rest of that ISO week (`review-dismiss.ts`, keyed by `weekKey()`).

## Architecture / Data Flow

**No backend changes.** All three surfaces are new files under `artifacts/edc/src` consuming hooks the dashboard already calls (react-query dedupes identical query keys, so no additional network round-trips beyond what's already fetched):

- `src/lib/mission/{priority-scorer,daily-ack}.ts` + tests → `components/dashboard/widgets/daily-mission.tsx`
- `src/lib/insights/{insight-builder,insight-history}.ts` + tests → `components/dashboard/widgets/insight-banner.tsx`
- `src/lib/weekly/{week-boundaries,review-dismiss}.ts` + tests → `components/dashboard/widgets/weekly-review.tsx`
- `pages/dashboard.tsx` — three new imports + placements: Insight Banner (below `DashboardHero`) → Weekly Review (Mon/Fri only) → Daily Mission (above the existing `NextActions` row, which is untouched).

Every pure module follows the Phase 1 `src/lib/greetings/*` convention exactly: dependencies injected (`now: Date`, `random` defaulted to `Math.random` as the last param, `store: KeyValueStore`), never throws, defensive `JSON.parse`/`Array.isArray`/per-item type guard, prune-on-write, `edc.<feature>.<thing>` key naming.

## Error Handling & Edge Cases

- No mission items → "Nothing on today's mission. Enjoy the calm." (no checklist chrome).
- No qualifying insight → banner renders nothing (not an empty-state message — it's meant to be invisible when there's nothing worth noticing).
- No WoW baseline yet (fresh install, <7 days of snapshots) → comparison-kind insights and the Friday WoW delta are simply omitted, never fabricated as "+0%" or similar.
- Corrupted/oversized localStorage (`edc.mission.acked`, `edc.insights.shown`, `edc.weekly.dismissed`) → try/catch on parse, reset to empty on failure (matches `shown-history.ts`).
- Weekly Review dismissal is per-ISO-week; reappears automatically the following Monday.
- Hero/banner/mission transitions and the completion bar respect `prefers-reduced-motion` (existing app-wide convention via `rowMotion(!!useReducedMotion(), i)`).

## Testing Plan

- Vitest unit tests for all six pure modules, mirroring the Phase 1 greeting-engine test style (boundary-value `describe`/`it`, injected `now`/`random`, `fakeStore` closures): `priority-scorer.test.ts`, `daily-ack.test.ts`, `insight-builder.test.ts`, `insight-history.test.ts`, `week-boundaries.test.ts`, `review-dismiss.test.ts`.
- No new frontend component tests (matches this repo's thin frontend-test convention) — the three widgets are verified live via Playwright/chrome-devtools MCP against the running dev stack: Daily Mission ranking + check/reset behavior, Insight Banner showing a real data-backed observation, Weekly Review's Mon/Fri gating and dismissal.

## Mobile / PWA Considerations

Same responsive shell as Phase 1 — no new PWA infrastructure. All three surfaces use the existing container-query grid and stack full-width on narrow viewports; checklist rows and the dismiss control are sized ≥44px for touch. None of the three needs network access beyond hooks the page already calls, so there's nothing new to consider for offline/PWA caching.

## Backlog (explicitly deferred, not part of this slice)

Everything in PRD Phase 3 (Engagement) and Phase 4 (Atmosphere): Professional Quotes (4.5), Productivity Streak (4.6), Achievement System (4.7), Adaptive Dashboard (4.8), Weather Awareness (4.11), Personalized Profile Presence/Focus Mode (4.12), Celebration Moments (4.14), Motivational Progress Indicators (4.16) beyond Daily Mission's own bar, Personality Messages rotation (4.19), End-of-Day Reflection (4.20), Ambient Background Changes (4.21), Seasonal & Personal Touches (4.22).
