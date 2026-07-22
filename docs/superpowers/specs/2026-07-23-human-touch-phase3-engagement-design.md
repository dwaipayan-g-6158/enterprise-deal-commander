# Human Touch Layer — Phase 3 (Engagement) — Design Spec
**Date:** 2026-07-23
**Status:** Approved

## Problem

Phase 1 (greeting/welcome-back/empty-states) and Phase 2 (Daily Mission, Insight Banner, Weekly Review) are merged. `Improvements/Human Touch Layer for Enterprise Deal Commander.md`'s "Phase 3: Engagement" is the next bundle: Productivity Streak (4.6), Achievement System (4.7), Celebration Moments (4.14), Motivational Progress Indicators (4.16), End-of-Day Reflection (4.20) — the features that acknowledge effort and progress rather than just surfacing what's next.

Unlike Phase 2, none of these five overlap an existing widget — they're genuinely new. The design work here is instead about **fitting the PRD's examples to this app's actual data and scale**, and about **durability**: unlike Phase 2's UI-only state (greeting dedup, insight rotation — fine to lose on a cache clear), a streak or an earned achievement is meant to feel permanent, so losing it to a cleared cache would read as a bug, not a feature.

## Scope

**In scope** — all five PRD features, each described below.

**Out of scope / explicitly deferred:**
- A "diversity across industries" achievement (PRD's "Pipeline Architect"): the `segments`/`deal_types` lookup tables exist and are seeded (3 and 4 rows respectively) but have **no foreign key from `enterpriseDeals` at all** — confirmed via full-repo grep, zero hits outside two unrelated proposal docs. Wiring a segment onto deals (schema + migration + route + UI) is a real CRM-field feature in its own right, not something this "restrained, no new surface area" phase should smuggle in. Substituted with a competitor-diversity achievement instead (data for that is properly wired — see Achievements below).
- A durational "zero stalled deals for 30 consecutive days" achievement (PRD's "Pipeline Guardian"): confirmed via research that `deal_snapshots.payload.governance` only ever captured **per-deal** point-in-time health/alerts, never a portfolio-wide staleness judgment, and coverage isn't gap-free (hourly job, 3s debounce, no guarantee across server restarts). Reconstructing 30 days of "was the whole portfolio clean" history isn't achievable from what's actually stored. Simplified to a point-in-time "Clean Pipeline" check (zero stale + zero RED deals *right now*) — same spirit, honestly computable.
- PRD's largest-scale examples ("Century Club: 100 deals," "25 deals through legal") are not used verbatim — the seeded/live dataset has ~12-14 deals total, so those thresholds would sit permanently locked. All thresholds below are rescaled to this app's actual volume.
- Phase 4 (Atmosphere): unchanged, still fully deferred.

## Architecture

**Approach:** computed at read time, minimal persistence — the same pattern `next-actions`/`memory-insights`/`vital-signs` already use in this codebase (deterministic, no LLM, no event subscriber). Considered and rejected: an event-driven subscriber (like `playbook-engine.ts`/`health-tracker.ts`) that mutates streak/achievement state synchronously as events occur — more moving parts (a new subscriber, write-path races) for a single-user app where nothing needs multi-client real-time sync, which is the actual problem those existing subscribers solve.

### New backend surface (the only new persistence in this phase)

- **Schema** (`lib/db/src/schema/edc_v2.ts`): `commanderAchievements` — `{ achievementCode: varchar(60) primary key, earnedAt: timestamptz not null default now() }`. No FK to `commanders` (single-user app, same reasoning as every other `edc_v2` durable table not needing one). Applied via a new direct-SQL migration (`lib/db/sql/2026-07-23-commander-achievements.sql`), idempotent `CREATE TABLE IF NOT EXISTS`, mirroring the Phase 1 `commander-last-visit.sql` header convention.
- **API** (`lib/api-spec/openapi.yaml`): one new operation, `GET /v2/analytics/engagement`, `GenericDataResponse` (matching every other analytics endpoint's loose-contract convention). Response shape: `{ achievements: Achievement[], newlyEarnedCodes: string[] }` where `Achievement = { code: string; name: string; description: string; earnedAt: string | null; locked: boolean }`. Streak is *not* part of this response — it's computed entirely client-side (see below) and needs no endpoint of its own.
- **Route** (`artifacts/api-server/src/routes/v2/analytics.ts`): evaluates all 4 achievement rules (queries below) against current data, upserts any newly-true, not-yet-earned ones into `commanderAchievements` with `earnedAt = now()`, and returns the full list (locked ones included, `locked: true`, `earnedAt: null`) plus `newlyEarnedCodes` — the codes that transitioned from not-earned to earned *during this specific call*. Since the frontend only calls this endpoint once per dashboard mount (not on every background refetch — same `dataReady`-gated, evaluate-once convention `InsightBanner` already uses), "newly earned this call" and "newly earned since the last visit" coincide in practice; the spec deliberately doesn't claim a stronger guarantee than that.
- **First-run backfill (important edge case):** the live dev DB already has a Closed-Won deal from earlier manual testing, so "First Deal Closed" will already be true the moment this ships. If the table is empty (first-ever call), insert all currently-true achievements with `earnedAt = now()` but return `newlyEarnedCodes: []` for that call — i.e., the bootstrap moment never itself counts as "new," only achievements crossed on subsequent calls do. Otherwise the first dashboard load after deploy would toast-flood 2-3 "achievement unlocked" toasts for things that actually happened weeks ago.

### Achievement rules (rescaled, all confirmed computable from existing schema)

| Code | Name | Rule | Query source |
|---|---|---|---|
| `first_close` | First Deal Closed | ≥1 deal with stage = Closed-Won | join `enterpriseDeals.salesStageId → pipelineStages.stageName = 'Closed-Won'` (the established literal string-match pattern used everywhere else in this codebase — there's no `isWon` boolean column) |
| `playbooks_3` | 3 Playbooks Completed | ≥3 `dealPlaybookAssignments.status = 'Completed'` | `edc_v2.deal_playbook_assignments` |
| `giant_slayer` | Giant Slayer | ≥2 distinct `competitorId` with `dealCompetitors.status = 'Won Against'` | `edc_v2.deal_competitors` |
| `clean_pipeline` | Clean Pipeline | `staleDeals.length === 0 && dealsByHealth.RED === 0`, right now | reuses `computeSummary()`'s existing live fields (`lib/portfolio.ts`) — no new query |

Achievement permanence comes from `commanderAchievements`, not from the underlying metric being monotonic — e.g. `dealPlaybookAssignments.status` *can* revert if a step is reopened, but that's fine: once the upsert has fired, the achievement stays earned regardless of what the live count does afterward.

### Streak (4.6) — no backend at all

Reuses the existing `GET /v2/activity?since=` endpoint (already supports date-range filtering) with a 90-day lookback (matching the existing `windowDays` default already used for conversion-matrix elsewhere in this codebase, and covering the PRD's own largest milestone, 90 days). A new pure module, `src/lib/streak/compute-streak.ts`:

```ts
computeStreak(occurredAtISOStrings: string[], now: Date): number
```

Converts each timestamp to a local `Date`, buckets into local `YYYY-MM-DD` keys (mirroring `week-boundaries.ts`'s local-time convention — the backend has no timezone awareness anywhere in this app, and every other "local day" computation in Phases 1-2 was deliberately client-side for exactly that reason), then walks backward from today (or yesterday, if today has no activity yet — an in-progress day shouldn't zero out the display) counting consecutive active days until the first gap.

Displayed as a small inline line near the greeting in `DashboardHero` ("🔥 8 days active") — explicitly *not* a separate card/widget, per the PRD's own "subtle, inline — not a prominent badge" requirement for this feature.

### The `previousVisitAt` refactor (required, contained)

`useDashboardVisit()` currently lives entirely inside `DashboardHero` (mutate-once-on-mount via a `useRef` guard, result kept in local `useState`). Celebration Moments and End-of-Day Reflection both need that same "what's new since last visit" boundary. Moves up one level: `pages/dashboard.tsx` calls the mutation once (same guard), holds `previousVisitAt` in its own state, and passes it as a prop to `DashboardHero` (which drops its own internal fetch) plus two new non-visual/visual consumers below. No behavior change to the existing welcome-back-memory feature — same value, same timing, just hoisted one level so siblings can share it without a second mutation call.

## The 5 features

### 1. Streak Tracker (4.6)
Covered above. No celebration toast fires just for "streak continues" — only at the named milestones (7/14/30/60/90 days), detected by calling `computeStreak()` twice — once anchored at `previousVisitAt`, once at `now` — and checking whether a milestone value falls strictly between the two results. Fires at most once per crossing since the check is only ever run once per dashboard mount (same convention as everything else that reads `previousVisitAt`).

### 2. Achievement System (4.7)
New "Achievements" tab in Settings (`pages/settings.tsx`), following the existing flat `TabsTrigger`/`TabsContent` pair pattern exactly (Score Weights, Smart Alerts, Webhooks, etc. are already registered this way — no data-driven registration to build). New `components/settings/achievements-settings.tsx`: a simple list, unlocked achievements show name + description + earned date, locked ones show name only (description hidden — PRD's "discovery is part of the experience," achieved for free since the frontend already receives `locked: true` from the API without the description needing to be withheld server-side... actually the description *is* returned either way per the schema above, so the frontend simply doesn't render it when `locked`). No badges/icons/animation — a clean list, matching the PRD's explicit "elegant, not childish, no trophy case" requirement. No leaderboard, no comparison — this is a single-user app, so that constraint is free.

### 3. Celebration Moments (4.14)
Toast on exactly 3 triggers (confirmed): **deal closed-won**, **achievement earned**, **streak milestone reached** (7/14/30/60/90). Explicitly excluded: routine stage advances and per-deal playbook completion (the PRD's other two examples) — likely the noisiest of the five given how often those already happen, and Daily Mission/Weekly Review already acknowledge routine progress.

Reuses the existing toast system exactly (`useToast()` from `hooks/use-toast.ts`, `toast({ title, description })`, no new `<Toaster />`, mirrors the call shape already used in `scoring-weights-settings.tsx`/`pricing-panel.tsx`). **One real wrinkle found in research:** the toast store has `TOAST_LIMIT = 1` — a second `toast()` call silently evicts the first rather than queuing it. Since two of these three triggers could plausibly fire in the same visit (e.g. a deal closes, which is also the moment "First Deal Closed" unlocks), a bare sequence of `toast()` calls would silently drop all but the last. Solution: a small new non-visual component, `CelebrationWatcher` (mounted once in `dashboard.tsx`, receiving the lifted `previousVisitAt`), that builds the full list of celebration-worthy events since last visit (deals closed-won since `previousVisitAt`, `newlyEarnedCodes` from the engagement endpoint, any streak milestone crossed since `previousVisitAt`), then drains that list one at a time — showing the next toast only after the current one is dismissed/times out, rather than firing them all at once.

### 4. Motivational Progress Indicators (4.16)
Daily Mission's bar already has this from Phase 2. Extends to the one clear next candidate: `components/cockpit/v2/playbook-panel.tsx`'s overall journey `<Progress>` (confirmed as the highest-traffic bar after Daily Mission's — it's the per-deal cockpit's own progress bar, revisited constantly, versus the other 8 `<Progress>` call-sites which all live in secondary analytics pages — Memory/Autopsy tabs). Adds threshold copy at 25/50/75/90/100%, same warm-but-not-patronizing voice as Daily Mission's ("Almost there — 3 more steps" etc., exact strings written during implementation to match the specific playbook-progress context).

### 5. End-of-Day Reflection (4.20)
New dashboard card, structurally a sibling to Phase 2's `WeeklyReview` (same shape: gated visibility, dismissable, sourced from the activity log): renders only when local time ≥ 16:00 AND not already dismissed today (a new `src/lib/reflection/dismiss.ts`, local-date-keyed, mirroring `daily-ack.ts`'s local-date-reset pattern rather than `review-dismiss.ts`'s week-keyed one). Content: today's activity window (local midnight → now) — playbook steps completed + stages advanced today, via the same activity-log query pattern Weekly Review already established, just with a today-scoped window instead of a week-scoped one. Positioned near Weekly Review in the dashboard layout (both are "look back" cards; Daily Mission and the Insight Banner stay "look forward/now").

## Error Handling & Edge Cases

- First-ever achievement evaluation (empty table): silent backfill, no toast — see above.
- Deal closed-won detection for celebration: `deal.stage_changed` activity-log events since `previousVisitAt` where the target stage is Closed-Won — reuses the existing `/v2/activity` since/until pattern, no new query.
- Streak with zero activity ever: displays nothing (not "0 days active" — an absent stat, not a discouraging one, matching the PRD's "restrained" tone).
- Multiple simultaneous celebration triggers: queued and shown sequentially by `CelebrationWatcher`, never dropped silently.
- `previousVisitAt` null (first-ever visit) or the mutation failing: Celebration Moments and End-of-Day Reflection both treat this as "nothing to show" — same soft-fail convention Phase 1 established for Welcome Back Memory.
- Achievement descriptions are withheld client-side for locked items (not server-side) — acceptable since this is a single-user app with no other viewer who could see the response payload; not a security boundary, purely a presentation choice.

## Testing Plan

- Vitest unit tests for the 3 new pure modules: `compute-streak.ts` (local-date bucketing, gap detection, today-vs-yesterday continuity), `reflection/dismiss.ts` (local-date-keyed dismissal, mirrors `daily-ack.test.ts`), and the `CelebrationWatcher` queue-draining logic if it's extracted into a pure function (build the celebration list + drain-one-at-a-time ordering) rather than tested only via the component.
- Achievement rules and the `/v2/analytics/engagement` route: verified live against the running dev DB (matches this repo's existing convention — no DB-mocking infrastructure exists), including deliberately driving a deal to Closed-Won and completing playbook steps through the live app to confirm each rule crosses correctly, plus a manual empty-table check to confirm the backfill-not-toasted behavior.
- No new frontend component tests (repo convention) — Achievements Settings tab, Streak display, Celebration toasts, End-of-Day Reflection all verified live via Playwright/chrome-devtools MCP.

## Mobile / PWA Considerations

Same responsive shell as Phases 1-2 — no new PWA infrastructure. The Achievements tab, Streak inline text, and End-of-Day Reflection card all use the existing responsive container-query patterns. Celebration toasts already respect the existing Radix toast viewport positioning/touch dismissal; no changes needed there.

## Backlog (explicitly deferred, not part of this slice)

Phase 4 (Atmosphere), unchanged: Adaptive Dashboard (4.8), Personalized Profile Presence (4.12), Ambient Background (4.21), Professional Quotes (4.5), Weather Awareness (4.11), Personality Messages (4.19), Seasonal Touches (4.22). Also newly deferred from this phase specifically: segment/industry-diversity achievement (needs a schema change first), durational stalled-deal-free achievement (not reconstructable from history), and extending Motivational Progress Indicators beyond the two highest-traffic bars (the other 8 `<Progress>` call-sites in Memory/Autopsy pages).
