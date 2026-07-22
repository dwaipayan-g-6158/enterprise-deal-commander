# Human Touch Layer — Phase 2 (Intelligence) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Daily Mission (a ranked, checkable top-5 list), an Insight Banner (one rotating data-backed observation per session), and a Weekly Review (Monday briefing / Friday summary) to the dashboard — consolidating PRD Phase 2's five named features (4.3, 4.4, 4.13, 4.17, 4.23) into three surfaces that reuse existing `NextActions`/`MemoryInsights`/`vital-signs`/activity data rather than duplicating it. See `docs/superpowers/specs/2026-07-22-human-touch-phase2-intelligence-design.md` for the full rationale.

**Architecture:** Zero backend changes — no schema, no `openapi.yaml`, no codegen, no routes. Six new pure, testable modules under `artifacts/edc/src/lib/{mission,insights,weekly}/` (each mirroring the Phase 1 `src/lib/greetings/*` convention: injected `now`/`random`/`store`, never-throw, defensive parse) feed three new dashboard widgets, wired into `pages/dashboard.tsx` alongside the untouched `DashboardHero`, `NextActions`, and `MemoryInsights`.

**Tech Stack:** React 19 + Vite + Tailwind v4 (container-query grid) + shadcn/ui, wouter routing, `@tanstack/react-query`, Vitest for pure logic. No backend packages touched this phase.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-22-human-touch-phase2-intelligence-design.md` — read it if anything below is ambiguous.
- **Frontend-only.** If a task seems to need a backend change, stop and re-scope rather than adding one silently.
- Single-user app — no multi-tenant/privacy logic.
- Tone: warm, professional, collegial, concise; no sarcasm; positive framing of empty states (Phase 1 precedent).
- Pure modules: dependencies injected (`now: Date`; `random: () => number = Math.random` as the last defaulted param; `store: KeyValueStore` from `@/lib/storage`), never throw, defensive `JSON.parse`/`Array.isArray`/per-item type guard, prune-on-write, key names `edc.<feature>.<thing>`. TDD — failing test first.
- No automated component tests (repo convention) — the three widgets are verified live (Task V) via Playwright/chrome-devtools MCP against the running dev stack, not component-test infra.
- Local dev stack is Windows/PowerShell (Git Bash mangles `BASE_PATH`/`export`).
- Respect `prefers-reduced-motion` (`rowMotion(!!useReducedMotion(), i)` from `_shared.tsx`) and WCAG AA contrast (reuse existing token classes).
- Commits: Conventional-Commits with scope (`feat(edc):`, `docs(edc):`), imperative, lowercase, no trailing period, one per task.

---

### Task 0: Spec + plan docs

- [x] Design spec written: `docs/superpowers/specs/2026-07-22-human-touch-phase2-intelligence-design.md`
- [x] This plan written: `docs/superpowers/plans/2026-07-22-human-touch-phase2-intelligence.md`
- [ ] **Commit**

```bash
git add docs/superpowers/specs/2026-07-22-human-touch-phase2-intelligence-design.md docs/superpowers/plans/2026-07-22-human-touch-phase2-intelligence.md
git commit -m "docs(edc): add spec + plan for human touch phase 2 (intelligence)"
```

---

## Slice A — Daily Mission (PRD 4.3 + 4.23)

### Task A1: `priority-scorer.ts`

**Files:** Create `artifacts/edc/src/lib/mission/priority-scorer.ts` + `priority-scorer.test.ts`

**Interfaces:** Consumes a locally-declared structural type for `NextActionsData` (`overdue`/`dueThisWeek: Decision[]`, `playbookSteps: PlaybookStep[]`, `upcomingCloses: UpcomingClose[]` — no shared generated type exists since analytics endpoints use `GenericDataResponse`). Produces `MissionItem { id; dealId; dealName; label; meta; category: "overdue"|"due"|"playbook"|"close"; navigateTo }` and `buildMission(data, valueByDealId, now, limit=5): MissionItem[]`.

- [ ] **Step 1:** Write failing tests: category order (overdue < due < playbook < close); TCV tiebreak within a category; due-date/days-to-close recency tiebreak; cap at `limit`; empty input → `[]`.
- [ ] **Step 2:** Run `pnpm --filter @workspace/edc exec vitest run src/lib/mission/priority-scorer.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `buildMission` — pure, `navigateTo = \`/deals/${dealId}\``.
- [ ] **Step 4:** Run the test again → PASS.
- [ ] **Step 5: Commit**
```bash
git add artifacts/edc/src/lib/mission/priority-scorer.ts artifacts/edc/src/lib/mission/priority-scorer.test.ts
git commit -m "feat(edc): add cross-category next-action priority scorer for daily mission"
```

### Task A2: `daily-ack.ts`

**Files:** Create `artifacts/edc/src/lib/mission/daily-ack.ts` + `daily-ack.test.ts`

**Interfaces:** Consumes `KeyValueStore`. Produces `readAcked(store, now): string[]` (local-date-scoped), `toggleAck(store, id, now): void`. Key `edc.mission.acked`, payload `{ date: "YYYY-MM-DD" (local), ids: string[] }`.

- [ ] **Step 1:** Write failing tests: toggle adds/removes an id; a later local date returns `[]`; corrupted JSON → `[]`; never throws.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement (local-date key via `now.getFullYear()/getMonth()/getDate()`, not UTC ISO).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit**
```bash
git add artifacts/edc/src/lib/mission/daily-ack.ts artifacts/edc/src/lib/mission/daily-ack.test.ts
git commit -m "feat(edc): add daily-reset mission acknowledgment store"
```

### Task A3: `<DailyMission />`

**Files:** Create `artifacts/edc/src/components/dashboard/widgets/daily-mission.tsx`

**Interfaces:** Consumes `useGetNextActions`, `useListDeals({state:"active",limit:500})` (same query key as `dashboard-hero.tsx` → deduped by react-query), `buildMission` (A1), `readAcked`/`toggleAck` (A2), `defaultStore`, `Progress`, `Card*`, `Skeleton`, `useReducedMotion`+`rowMotion`, `compactCurrency`, wouter `navigate`. Produces `DailyMission` (no props).

- [ ] **Step 1:** Build `valueByDealId` from active deals (`normalizedTCV ?? calculatedTCV ?? 0`, matching `dashboard-hero.tsx`'s accessor); call `buildMission(data, valueByDealId, new Date())`.
- [ ] **Step 2:** Render `Card` "Today's Mission" (`CardTitle className="text-base"`); checklist rows ≥44px, completed rows muted/struck; row label deep-links.
- [ ] **Step 3:** `Progress value={acked/total*100}` + contextual line (100% → "All clear for today. Nice work."; else "{done} of {total} done"). Guard motion with `!!useReducedMotion()`.
- [ ] **Step 4:** Empty state: "Nothing on today's mission. Enjoy the calm." Loading: `Skeleton`.
- [ ] **Step 5:** `pnpm --filter @workspace/edc run typecheck` → clean.
- [ ] **Step 6: Commit**
```bash
git add artifacts/edc/src/components/dashboard/widgets/daily-mission.tsx
git commit -m "feat(edc): add Daily Mission checklist widget"
```

### ✔ Checkpoint A
- [ ] `pnpm --filter @workspace/edc exec vitest run src/lib/mission` → PASS
- [ ] `pnpm --filter @workspace/edc run typecheck` → clean

---

## Slice B — Insight Banner (PRD 4.4 + 4.17)

### Task B1: `insight-builder.ts`

**Files:** Create `artifacts/edc/src/lib/insights/insight-builder.ts` + `insight-builder.test.ts`

**Interfaces:** Consumes local structural types for the relevant slices of vital-signs (`{weightedPipeline; baseline: {totalTCV; activeDeals; redAlerts}|null}`), summary (`{staleDeals[]}`), memory-insights (`{insights:{text;matchedDeals[]}[]; archivedCount}`). Produces `Insight { id; kind: "trend"|"anomaly"|"comparison"|"pattern"; text; navigateTo?: string }`, `buildInsights(inputs, now): Insight[]`.

- [ ] **Step 1:** Failing tests: WoW comparison only when `baseline != null`; stalled-deal anomaly when staleDeals non-empty; memory patterns map 1:1 to "pattern" insights with a deep link to their first matched deal; no qualifying data → `[]`; stable per-kind ids.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement (pure, `now` injected).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit**
```bash
git add artifacts/edc/src/lib/insights/insight-builder.ts artifacts/edc/src/lib/insights/insight-builder.test.ts
git commit -m "feat(edc): add deterministic insight-builder for the insight banner"
```

### Task B2: `insight-history.ts`

**Files:** Create `artifacts/edc/src/lib/insights/insight-history.ts` + `insight-history.test.ts`

**Interfaces:** Consumes `KeyValueStore`, `Insight[]`. Produces `pickInsight(candidates, store, now, random?): Insight | null`. Key `edc.insights.shown`.

- [ ] **Step 1:** Failing tests: excludes within-window id; relaxes when all candidates are within-window; `null` for empty candidates; records the pick; never throws.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement (mirrors `shown-history.ts`).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit**
```bash
git add artifacts/edc/src/lib/insights/insight-history.ts artifacts/edc/src/lib/insights/insight-history.test.ts
git commit -m "feat(edc): add session insight rotation + dedup store"
```

### Task B3: `<InsightBanner />`

**Files:** Create `artifacts/edc/src/components/dashboard/widgets/insight-banner.tsx`

**Interfaces:** Consumes `useGetVitalSigns`, `useGetIntelligenceSummary`, `useGetMemoryInsights` (all already called elsewhere on the page), `buildInsights` (B1), `pickInsight` (B2), `defaultStore`, wouter `navigate`.

- [ ] **Step 1:** Assemble inputs, cast `data?.data`; `buildInsights(...)`; `pickInsight(...)` locked once per mount (ref-lock, same technique as `DashboardHero`'s greeting).
- [ ] **Step 2:** Render `rounded-lg border bg-muted/20 p-4` banner with text + optional "View →"; return `null` when no insight.
- [ ] **Step 3:** Typecheck.
- [ ] **Step 4: Commit**
```bash
git add artifacts/edc/src/components/dashboard/widgets/insight-banner.tsx
git commit -m "feat(edc): add Intelligent Insight Banner"
```

### ✔ Checkpoint B
- [ ] `pnpm --filter @workspace/edc exec vitest run src/lib/insights` → PASS
- [ ] `pnpm --filter @workspace/edc run typecheck` → clean

---

## Slice C — Weekly Review (PRD 4.13)

### Task C1: `week-boundaries.ts`

**Files:** Create `artifacts/edc/src/lib/weekly/week-boundaries.ts` + `week-boundaries.test.ts`

**Interfaces:** Produces `startOfWeek(date): Date` (local Monday 00:00), `isMonday`, `isFriday`, `currentWeekWindow(date): {since; until}`, `previousWeekWindow(date): {since; until}`, `weekKey(date): string`.

- [ ] **Step 1:** Failing boundary tests (mirror `time-bands.test.ts`'s `at()` factory style): Monday/Friday incl. week wrap; `startOfWeek` for mid-week and Sunday; previous.until == current.since; stable `weekKey` within a week, changes across weeks.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement (local time, Monday-start).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit**
```bash
git add artifacts/edc/src/lib/weekly/week-boundaries.ts artifacts/edc/src/lib/weekly/week-boundaries.test.ts
git commit -m "feat(edc): add local week-boundary calculator"
```

### Task C2: `review-dismiss.ts`

**Files:** Create `artifacts/edc/src/lib/weekly/review-dismiss.ts` + `review-dismiss.test.ts`

**Interfaces:** Consumes `KeyValueStore`, `weekKey`. Produces `isDismissed(store, weekKey): boolean`, `dismiss(store, weekKey): void`. Key `edc.weekly.dismissed`.

- [ ] **Step 1:** Failing tests: dismiss+isDismissed same key true, different key false; corrupted store → not dismissed; never throws.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit**
```bash
git add artifacts/edc/src/lib/weekly/review-dismiss.ts artifacts/edc/src/lib/weekly/review-dismiss.test.ts
git commit -m "feat(edc): add per-week review dismissal store"
```

### Task C3: `<WeeklyReview />`

**Files:** Create `artifacts/edc/src/components/dashboard/widgets/weekly-review.tsx`

**Interfaces:** Consumes `week-boundaries` (C1), `isDismissed`/`dismiss` (C2), `defaultStore`, `useGetIntelligenceSummary`+`useGetNextActions` (Monday), `useListPortfolioActivity({since,until,limit:200})` (Friday, filter `eventType` for `playbook.step_changed` completed / `deal.stage_changed`), `useGetVitalSigns` (`baseline` for WoW delta via `DeltaBadge`/`compactCurrency`).

- [ ] **Step 1:** Render `null` unless (Monday or Friday) and `!isDismissed`.
- [ ] **Step 2:** Monday branch — "This Week": active-validation count, approaching closes, overdue items.
- [ ] **Step 3:** Friday branch — "Week Summary": playbook completions + stage advances this week, WoW delta only if `baseline != null` (never fabricate).
- [ ] **Step 4:** Dismiss control (≥44px) → `dismiss(store, weekKey(now))`. Loading: `Skeleton`. Typecheck.
- [ ] **Step 5: Commit**
```bash
git add artifacts/edc/src/components/dashboard/widgets/weekly-review.tsx
git commit -m "feat(edc): add Weekly Review (Monday briefing + Friday summary)"
```

### ✔ Checkpoint C
- [ ] `pnpm --filter @workspace/edc exec vitest run src/lib/weekly` → PASS
- [ ] `pnpm --filter @workspace/edc run typecheck` → clean

---

### Task D: Wire all three into the dashboard (combined — A4+B4+C4)

**Files:** Modify `artifacts/edc/src/pages/dashboard.tsx` only.

Done as one combined edit (not three separate ones) since all three placements touch the same file.

- [ ] **Step 1:** Import `InsightBanner`, `WeeklyReview`, `DailyMission`.
- [ ] **Step 2:** Place, in order, directly below `<DashboardHero />`: `<InsightBanner />` → `<WeeklyReview />` → `<DailyMission />` → existing Row 3 (`NextActions` + `ForecastSnapshot`, untouched).
- [ ] **Step 3:** Typecheck.
- [ ] **Step 4: Commit**
```bash
git add artifacts/edc/src/pages/dashboard.tsx
git commit -m "feat(edc): wire Insight Banner, Weekly Review, and Daily Mission into the dashboard"
```

---

### Task V: Live verification + full suite (no commit — verification only)

- [ ] **Step 1:** Ensure dev stack is up (PowerShell): `$env:PORT='5173'; $env:BASE_PATH='/'; pnpm --filter @workspace/edc run dev` (API already covers everything — no backend changed this phase, so no restart needed there).
- [ ] **Step 2:** Playwright/chrome-devtools MCP: log in (`commander`/`DealCommander!2026`), snapshot dashboard. Confirm Insight Banner shows a data-backed line with working link (or is absent if no candidate qualifies — note which); Daily Mission shows ≤5 ranked items, checking one moves the bar and survives reload same-day; `NextActions` + its View-all dialog still intact below.
- [ ] **Step 3:** Weekly Review — if today is Mon/Fri, confirm the right branch + dismiss-hides-for-week; otherwise confirm absence and note as clock-gated (spot-check via a temporary date stub if needed).
- [ ] **Step 4:** Mobile viewport (~390×844): full-width stacking, no horizontal scroll, touch targets ≥44px.
- [ ] **Step 5:** Emulate `prefers-reduced-motion`: confirm bar/entrance animation is suppressed.
- [ ] **Step 6:** `pnpm run typecheck` and `pnpm --filter @workspace/edc exec vitest run` → both exit 0.
- [ ] **Step 7:** Report results; flag anything not exercisable on the seeded dataset (e.g., a non-Mon/Fri day, or no ≥7-day snapshot history yet for the WoW delta).
