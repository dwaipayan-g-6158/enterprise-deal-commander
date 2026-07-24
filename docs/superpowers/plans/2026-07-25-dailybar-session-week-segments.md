# DailyBar Session/Week Segments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold the "Last session you" hero box and the full-width `WeeklyReview` card into two new `DailyBar` segments, so the dashboard no longer stacks 2 extra full-width cards above the fold.

**Architecture:** `DailyBar` (`artifacts/edc/src/components/dashboard/daily-bar/daily-bar.tsx`) already compacts 3 widgets (Mission/Today/Insight) into trigger-button + `Popover` "segments." This plan adds 2 more segments to that same bar (`WelcomeBackSegment`, `WeekSegment`), removes the box/card they replace, and rewires the one prop (`previousVisitAt`) that moves from `DashboardHero` to `DailyBar`.

**Tech Stack:** React 19, Vite, Tailwind v4, shadcn/ui `Popover`, `@tanstack/react-query` (generated hooks from `@workspace/api-client-react`), `wouter`, `lucide-react` icons.

## Global Constraints

- Frontend-only. No backend, schema, `openapi.yaml`, or codegen changes — every hook used already exists and is already called elsewhere on the dashboard page.
- No rename of `DailyBar` (component or file) — internal detail, not worth the import churn.
- Spec source of truth: `docs/superpowers/specs/2026-07-25-dailybar-session-week-segments-design.md`.
- This codebase's frontend Vitest config runs `environment: "node"` (`artifacts/edc/vitest.config.ts`) — there is no DOM/jsdom setup, and no component-level tests exist today for any of the 3 existing `daily-bar/*.tsx` segments, `dashboard-hero.tsx`, or `weekly-review.tsx`. All logic this plan touches at the component layer is a straight relocation of already-shipped, already-manually-verified behavior — no new pure logic is introduced (the one exception, `DeltaBadge`'s `compact` prop, is trivial enough that its correctness is visible by inspection and by the two render paths it produces). Per-task verification is therefore `pnpm run typecheck` (per `Deal-Commander/CLAUDE.md`), not a Vitest run. Do not invent a jsdom/testing-library setup to test these components — that would be new infrastructure out of scope for this change.
- Run all commands from the `Deal-Commander` repo root unless noted.

---

### Task 1: Welcome Back segment — extract from `DashboardHero` into `DailyBar`

**Files:**
- Create: `artifacts/edc/src/components/dashboard/daily-bar/welcome-back-segment.tsx`
- Modify: `artifacts/edc/src/components/dashboard/daily-bar/daily-bar.tsx`
- Modify: `artifacts/edc/src/components/dashboard/dashboard-hero.tsx`
- Modify: `artifacts/edc/src/pages/dashboard.tsx`

**Interfaces:**
- Produces: `WelcomeBackSegment({ previousVisitAt: string | null | undefined }): JSX.Element | null`, exported from `welcome-back-segment.tsx`.
- Produces: `DailyBar({ previousVisitAt: string | null | undefined }): JSX.Element` — `DailyBar` gains this prop (previously took no props).
- Consumes (Task 2 will extend the same file): nothing from Task 2.

- [ ] **Step 1: Create `welcome-back-segment.tsx`**

```tsx
import { useLocation } from "wouter";
import { History } from "lucide-react";
import {
  useListPortfolioActivity,
  getListPortfolioActivityQueryKey,
} from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Daily Bar segment — Welcome Back (formerly the "Last session you:" box in
// `dashboard-hero.tsx`, PRD 4.2). Same activity-since-previous-visit query as
// before; only the presentation moved into a compact bar trigger + popover.
// Renders nothing when there's no previous visit or no activity since it —
// same "absent, not empty" behavior the original box already had. No dismiss
// control: like Mission, this just reflects what happened and goes away on
// its own once there's nothing left to report.
export function WelcomeBackSegment({
  previousVisitAt,
}: {
  previousVisitAt: string | null | undefined;
}) {
  const [, navigate] = useLocation();
  const enabled = previousVisitAt !== undefined && previousVisitAt !== null;
  const params = { since: previousVisitAt ?? undefined, limit: 20 };
  const { data: wrapper } = useListPortfolioActivity(params, {
    query: { enabled, queryKey: getListPortfolioActivityQueryKey(params) },
  });
  const activity = wrapper?.data ?? [];

  if (!enabled || activity.length === 0) return null;

  const mostRecentDealId = activity[0]?.dealId;
  const count = activity.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md px-2.5 py-2 min-h-[44px] text-sm hover:bg-muted/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Last visit: ${count} update${count === 1 ? "" : "s"}`}
        >
          <History className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium">Last visit</span>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            ({count})
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <p className="text-sm font-semibold mb-2">Last session you:</p>
        <ul className="space-y-1">
          {activity.slice(0, 5).map((e) => (
            <li key={e.id} className="text-sm text-muted-foreground">
              ✓ {e.summary}
            </li>
          ))}
        </ul>
        {mostRecentDealId && (
          <button
            type="button"
            onClick={() => navigate(`/deals/${mostRecentDealId}`)}
            className="mt-3 inline-flex items-center text-sm font-medium text-primary hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            Continue where you left off →
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Wire `WelcomeBackSegment` into `daily-bar.tsx`**

Replace the entire contents of `artifacts/edc/src/components/dashboard/daily-bar/daily-bar.tsx` with:

```tsx
import { WelcomeBackSegment } from "./welcome-back-segment";
import { MissionSegment } from "./mission-segment";
import { TodaySegment } from "./today-segment";
import { InsightSegment } from "./insight-segment";

// Compacts the former stack of full-width dashboard cards ("Last session
// you", Insight Banner, Today, Today's Mission — several hundred px combined)
// into a single bar. Each segment is a self-contained trigger + popover;
// `divide-x` draws a hairline only between segments that actually render
// (most segments can each render nothing — see their own "absent, not empty"
// gating), so no manual presence-tracking is needed here.
export function DailyBar({
  previousVisitAt,
}: {
  previousVisitAt: string | null | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 divide-x divide-border rounded-xl border bg-card text-card-foreground shadow px-1.5 py-1">
      <WelcomeBackSegment previousVisitAt={previousVisitAt} />
      <MissionSegment />
      <TodaySegment />
      <InsightSegment />
    </div>
  );
}
```

- [ ] **Step 3: Remove the "Last session you" box and its supporting logic from `dashboard-hero.tsx`**

Replace the entire contents of `artifacts/edc/src/components/dashboard/dashboard-hero.tsx` with:

```tsx
import { useEffect, useRef, useState } from "react";
import {
  useGetMe,
  useListDeals,
  useListPortfolioActivity,
  getListPortfolioActivityQueryKey,
  useGetNextActions,
} from "@workspace/api-client-react";
import { compactCurrency } from "@/components/dashboard/widgets/_shared";
import { Skeleton } from "@/components/ui/skeleton";
import { getTimeBand } from "@/lib/greetings/time-bands";
import { selectGreeting, type GreetingContext, type GreetingPool } from "@/lib/greetings/select-greeting";
import GREETING_POOL from "@/lib/greetings/greeting-pool.json";
import { readShownHistory, recordShown } from "@/lib/greetings/shown-history";
import { defaultStore } from "@/lib/storage";
import { computeStreak } from "@/lib/streak/compute-streak";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;
const NINETY_DAYS_MS = 90 * ONE_DAY_MS;

export function DashboardHero() {
  const { data: me, isLoading: isLoadingMe } = useGetMe();

  // Computed once per mount, not on every render — otherwise this timestamp's
  // millisecond precision would mint a brand-new query key every render and
  // trigger a continuous refetch loop against /api/v2/activity.
  const [since24h] = useState(() => new Date(Date.now() - ONE_DAY_MS).toISOString());
  const { data: recentActivityWrapper, isLoading: isLoadingRecentActivity } = useListPortfolioActivity({
    since: since24h,
    limit: 50,
  });
  const recentActivity = recentActivityWrapper?.data ?? [];

  const [streakWindowStart] = useState(() => new Date(Date.now() - NINETY_DAYS_MS).toISOString());
  // 200, not 500: /v2/activity's clampLimit() (routes/v2/index.ts) hard-caps
  // every request at 200 rows server-side regardless of what's requested, so
  // asking for more would only imply headroom that can't actually be delivered.
  const streakParams = { since: streakWindowStart, limit: 200 };
  const { data: streakActivityWrapper } = useListPortfolioActivity(streakParams, {
    query: { queryKey: getListPortfolioActivityQueryKey(streakParams) },
  });
  const streak = computeStreak((streakActivityWrapper?.data ?? []).map((e) => e.occurredAt), new Date());

  const { data: activeDealsWrapper, isLoading: isLoadingDeals } = useListDeals({ state: "active", limit: 500 });
  const activeDeals = activeDealsWrapper?.data ?? [];

  const { data: nextActionsWrapper, isLoading: isLoadingNextActions } = useGetNextActions();
  const overdueActionCount =
    (nextActionsWrapper?.data as { overdue?: unknown[] } | undefined)?.overdue?.length ?? 0;

  const tcv = (d: (typeof activeDeals)[number]) => d.normalizedTCV ?? d.calculatedTCV ?? 0;
  const procurementDeals = activeDeals.filter((d) => d.salesStage === "Procurement");
  const validationDeals = activeDeals.filter((d) => d.salesStage === "Validation");
  const nowMs = Date.now();
  const weekFromNow = nowMs + SEVEN_DAYS_MS;
  const closingThisWeek = activeDeals.filter((d) => {
    if (!d.expectedCloseDate) return false;
    const t = new Date(d.expectedCloseDate).getTime();
    return !Number.isNaN(t) && t >= nowMs && t <= weekFromNow;
  });
  const closeThisWeekValueRaw = closingThisWeek.reduce((sum, d) => sum + tcv(d), 0);
  const activeValidationValueRaw = validationDeals.reduce((sum, d) => sum + tcv(d), 0);
  const recentPhaseAdvanceCount = recentActivity.filter((e) => e.eventType === "deal.stage_changed").length;
  // Proxy for "exactly one step remaining": the highest-TCV deal currently in the
  // Procurement stage (the last stage before Closed-Won/Lost). Not a literal
  // gate-count check — a Procurement deal can still have redlines open.
  const oneStepDeal = [...procurementDeals].sort((a, b) => tcv(b) - tcv(a))[0];

  const name = me?.displayName;
  const context: GreetingContext = {
    namePart: name ? `, ${name}` : "",
    procurementCount: procurementDeals.length,
    closeThisWeekValueRaw,
    closeThisWeekValue: compactCurrency(closeThisWeekValueRaw),
    closeThisWeekCount: closingThisWeek.length,
    recentPhaseAdvanceCount,
    activeValidationValueRaw,
    activeValidationValue: compactCurrency(activeValidationValueRaw),
    overdueActionCount,
    oneStepFromCloseDealName: oneStepDeal?.dealName,
  };

  // Freeze the greeting selection the first time the data it depends on has
  // actually settled (succeeded OR failed). `selectGreeting` draws on
  // un-memoized Math.random(), and activeDeals/nextActions/recentActivity/me
  // each resolve asynchronously after mount — recomputing on every render
  // would let the headline change (and recordShown fire) more than once per
  // real visit. Gate on `isLoading` rather than `data !== undefined`: the
  // QueryClient is configured with `retry: false` (see App.tsx), so on a
  // query error `data` stays `undefined` forever (no prior successful fetch
  // to fall back to) while `isLoading` still flips to `false` once the
  // failed request settles. Gating on `data !== undefined` would leave the
  // greeting stuck on its Skeleton placeholder permanently after a single
  // transient failure of any of these queries; gating on `isLoading` treats
  // "settled with an error" as ready, and the `context` fields below already
  // degrade gracefully (`?? []` / `?? 0`) when a wrapper's `data` is missing.
  const dataReady =
    !isLoadingDeals && !isLoadingNextActions && !isLoadingRecentActivity && !isLoadingMe;
  const lockedGreetingRef = useRef<{ id: string; text: string } | null>(null);
  if (dataReady && lockedGreetingRef.current === null) {
    const now = new Date();
    const band = getTimeBand(now);
    const shownHistory = readShownHistory(defaultStore, now);
    const greeting = selectGreeting(GREETING_POOL as GreetingPool, band, context, shownHistory);
    lockedGreetingRef.current = { id: greeting.id, text: greeting.text };
  }
  const lockedGreeting = lockedGreetingRef.current;
  const lockedGreetingId = lockedGreeting?.id;

  useEffect(() => {
    if (!lockedGreetingId) return;
    recordShown(defaultStore, lockedGreetingId, new Date());
    // Fires exactly once per mount, the moment the locked greeting id is set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedGreetingId]);

  let headline = "";
  let subline = "";
  if (lockedGreeting) {
    const [h, ...rest] = lockedGreeting.text.split("\n");
    headline = h;
    subline = rest.join(" ");
  }

  return (
    <div className="space-y-4">
      {lockedGreeting ? (
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{headline}</h1>
          {subline && <p className="text-muted-foreground mt-2">{subline}</p>}
          {streak > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              🔥 {streak} day{streak === 1 ? "" : "s"} active
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Skeleton className="h-9 w-[320px]" />
          <Skeleton className="h-5 w-[420px]" />
        </div>
      )}
    </div>
  );
}
```

(This removes the `previousVisitAt` prop entirely, the `useLocation` import/usage, the `welcomeBackEnabled`/`welcomeBackParams`/`welcomeBackWrapper`/`welcomeBackActivity`/`mostRecentDealId` variables, and the "Last session you" JSX block. Everything else — greeting, streak, skeleton — is untouched.)

- [ ] **Step 4: Rewire `previousVisitAt` in `dashboard.tsx`**

In `artifacts/edc/src/pages/dashboard.tsx`, change:

```tsx
      <DashboardHero previousVisitAt={previousVisitAt} />
      <CelebrationWatcher previousVisitAt={previousVisitAt} />
      <WeeklyReview />
      <DailyBar />
```

to:

```tsx
      <DashboardHero />
      <CelebrationWatcher previousVisitAt={previousVisitAt} />
      <WeeklyReview />
      <DailyBar previousVisitAt={previousVisitAt} />
```

(Leave the `<WeeklyReview />` line and its import alone for now — Task 2 removes it.)

- [ ] **Step 5: Typecheck**

Run: `pnpm run typecheck`
Expected: no errors. In particular, confirm there are no lingering references to `previousVisitAt` inside `dashboard-hero.tsx` and no unused-import errors for `useLocation` in that file.

- [ ] **Step 6: Commit**

```bash
git add artifacts/edc/src/components/dashboard/daily-bar/welcome-back-segment.tsx \
        artifacts/edc/src/components/dashboard/daily-bar/daily-bar.tsx \
        artifacts/edc/src/components/dashboard/dashboard-hero.tsx \
        artifacts/edc/src/pages/dashboard.tsx
git commit -m "feat: compact Welcome Back into a DailyBar segment"
```

---

### Task 2: Week segment — extract from `WeeklyReview` into `DailyBar`, delete the old card

**Files:**
- Modify: `artifacts/edc/src/components/dashboard/widgets/_shared.tsx` (add `DeltaBadge`'s `compact` prop)
- Create: `artifacts/edc/src/components/dashboard/daily-bar/week-segment.tsx`
- Modify: `artifacts/edc/src/components/dashboard/daily-bar/daily-bar.tsx`
- Modify: `artifacts/edc/src/pages/dashboard.tsx`
- Delete: `artifacts/edc/src/components/dashboard/widgets/weekly-review.tsx`

**Interfaces:**
- Consumes: `DailyBar`'s file from Task 1 (this task edits it again).
- Produces: `WeekSegment(): JSX.Element | null`, exported from `week-segment.tsx`.
- Produces: `DeltaBadge`'s new optional prop `compact?: boolean` (default `false`) — existing call sites (`deal-trajectory.tsx`, `vital-signs-bar.tsx`) are unaffected since they don't pass it.

- [ ] **Step 1: Add a `compact` mode to `DeltaBadge`**

In `artifacts/edc/src/components/dashboard/widgets/_shared.tsx`, replace the existing `DeltaBadge` function with:

```tsx
/**
 * Week-over-week delta indicator. `positiveIsGood` flips the color semantics:
 * for TCV a rise is good (green); for red-alert counts a rise is bad (red).
 * `compact` omits the trailing "vs last wk" label, for tight spaces like a
 * DailyBar segment trigger.
 */
export function DeltaBadge({
  current,
  baseline,
  positiveIsGood = true,
  format = (n: number) => String(n),
  compact = false,
}: {
  current: number;
  baseline: number | null | undefined;
  positiveIsGood?: boolean;
  format?: (n: number) => string;
  compact?: boolean;
}) {
  if (baseline == null) return null;
  const delta = current - baseline;
  if (delta === 0) {
    return (
      <span className="text-xs text-muted-foreground">{compact ? "—" : "— vs last wk"}</span>
    );
  }
  const up = delta > 0;
  const good = up === positiveIsGood;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={`flex items-center gap-0.5 text-xs font-medium ${good ? "text-emerald-500" : "text-red-500"}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {format(Math.abs(delta))}
      {!compact && <span className="text-muted-foreground font-normal ml-0.5">vs last wk</span>}
    </span>
  );
}
```

- [ ] **Step 2: Create `week-segment.tsx`**

```tsx
import { useState } from "react";
import { X, CalendarDays } from "lucide-react";
import {
  useGetIntelligenceSummary,
  getGetIntelligenceSummaryQueryKey,
  useGetNextActions,
  getGetNextActionsQueryKey,
  useListPortfolioActivity,
  getListPortfolioActivityQueryKey,
  useGetVitalSigns,
  getGetVitalSignsQueryKey,
} from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { compactCurrency, DeltaBadge } from "@/components/dashboard/widgets/_shared";
import { defaultStore } from "@/lib/storage";
import { isMonday, isFriday, currentWeekWindow, weekKey } from "@/lib/weekly/week-boundaries";
import { isDismissed, dismiss } from "@/lib/weekly/review-dismiss";
import type { NextActionsData } from "@/components/dashboard/widgets/next-actions";

/**
 * Structural slice of `/api/v2/analytics/vital-signs`'s `GenericDataResponse`
 * payload this segment needs — mirrors the local-type convention already
 * used in `vital-signs-bar.tsx` (no generated type exists for this endpoint
 * since v2 analytics routes return `GenericDataResponse`).
 */
interface VitalSignsData {
  totalTCV: number;
  baseline: { totalTCV: number; activeDeals: number; redAlerts: number } | null;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// Daily Bar segment — Week (formerly the standalone `WeeklyReview` card, PRD
// 4.13). Same Monday/Friday gating, source hooks, and per-ISO-week dismissal
// as before; only the presentation moved into a compact bar trigger + popover.
// Unlike the other segments, the trigger itself carries a live glanceable
// number — an open-items count on Monday, the pipeline delta chip on Friday —
// so the "which way is this week trending" signal is visible without a click.
export function WeekSegment() {
  // Locked once per mount — otherwise every render would mint a new
  // `since`/`until` pair (millisecond-precision) for the activity query,
  // triggering a continuous refetch loop (same hazard `dashboard-hero.tsx`'s
  // `since24h` guards against).
  const [now] = useState(() => new Date());
  const monday = isMonday(now);
  const friday = isFriday(now);
  const active = monday || friday;
  const currentWeekKey = weekKey(now);

  const [locallyDismissed, setLocallyDismissed] = useState(false);

  // Monday branch data. Gated with `enabled` so a Tue-Sun mount of this
  // segment alone doesn't fire a request nothing will render.
  const { data: summaryWrapper, isLoading: isLoadingSummary } = useGetIntelligenceSummary({
    query: { enabled: monday, queryKey: getGetIntelligenceSummaryQueryKey() },
  });
  const { data: nextActionsWrapper, isLoading: isLoadingNextActions } = useGetNextActions({
    query: { enabled: monday, queryKey: getGetNextActionsQueryKey() },
  });

  // Friday branch data.
  const weekWindow = currentWeekWindow(now);
  const activityParams = {
    since: weekWindow.since.toISOString(),
    until: weekWindow.until.toISOString(),
    limit: 200,
  };
  const { data: activityWrapper, isLoading: isLoadingActivity } = useListPortfolioActivity(
    activityParams,
    { query: { enabled: friday, queryKey: getListPortfolioActivityQueryKey(activityParams) } },
  );
  const { data: vitalSignsWrapper, isLoading: isLoadingVitalSigns } = useGetVitalSigns({
    query: { enabled: friday, queryKey: getGetVitalSignsQueryKey() },
  });

  const isLoading = monday
    ? isLoadingSummary || isLoadingNextActions
    : isLoadingActivity || isLoadingVitalSigns;

  function handleDismiss() {
    dismiss(defaultStore, currentWeekKey);
    setLocallyDismissed(true);
  }

  if (!active || locallyDismissed || isDismissed(defaultStore, currentWeekKey)) {
    return null;
  }

  const summary = summaryWrapper?.data;
  const nextActions = nextActionsWrapper?.data as NextActionsData | undefined;
  const activity = activityWrapper?.data ?? [];
  const vitalSigns = vitalSignsWrapper?.data as VitalSignsData | undefined;
  const baseline = vitalSigns?.baseline ?? null;

  const activeValidationCount = summary?.dealsByStage["Validation"] ?? 0;
  const upcomingClosesCount = nextActions?.upcomingCloses.length ?? 0;
  const overdueCount = nextActions?.overdue.length ?? 0;
  const openCount = upcomingClosesCount + overdueCount;

  const stageAdvances = activity.filter((e) => e.eventType === "deal.stage_changed").length;
  const playbookCompletions = activity.filter(
    (e) => e.eventType === "playbook.step_changed" && e.metadata?.action === "completed",
  ).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md px-2.5 py-2 min-h-[44px] text-sm hover:bg-muted/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={
            monday
              ? `This Week: ${openCount} open item${openCount === 1 ? "" : "s"}`
              : "Week Summary"
          }
        >
          <CalendarDays className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium">Week</span>
          {!isLoading && monday && (
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {openCount} open
            </span>
          )}
          {!isLoading && !monday && baseline !== null && vitalSigns && (
            <DeltaBadge
              current={vitalSigns.totalTCV}
              baseline={baseline.totalTCV}
              format={(n) => compactCurrency(n)}
              compact
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium">{monday ? "This Week" : "Week Summary"}</p>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss weekly review for the rest of this week"
            className="inline-flex min-h-[32px] min-w-[32px] -mr-1 -mt-1 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : monday ? (
          <ul className="space-y-1.5 text-sm">
            <li>{plural(activeValidationCount, "deal")} in active validation</li>
            <li>{plural(upcomingClosesCount, "upcoming close")} to watch</li>
            <li>{plural(overdueCount, "overdue item")} needing attention</li>
          </ul>
        ) : (
          <div className="space-y-3">
            <ul className="space-y-1.5 text-sm">
              <li>{plural(stageAdvances, "stage advance")} this week</li>
              <li>{plural(playbookCompletions, "playbook step")} completed</li>
            </ul>
            {baseline !== null && vitalSigns && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Pipeline vs last week:</span>
                <DeltaBadge
                  current={vitalSigns.totalTCV}
                  baseline={baseline.totalTCV}
                  format={(n) => compactCurrency(n)}
                />
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Wire `WeekSegment` into `daily-bar.tsx`**

Replace the entire contents of `artifacts/edc/src/components/dashboard/daily-bar/daily-bar.tsx` (as left by Task 1) with:

```tsx
import { WelcomeBackSegment } from "./welcome-back-segment";
import { MissionSegment } from "./mission-segment";
import { TodaySegment } from "./today-segment";
import { InsightSegment } from "./insight-segment";
import { WeekSegment } from "./week-segment";

// Compacts the former stack of full-width dashboard cards ("Last session
// you", Insight Banner, Today, Today's Mission, Weekly Review — several
// hundred px combined) into a single bar. Each segment is a self-contained
// trigger + popover; `divide-x` draws a hairline only between segments that
// actually render (most segments can each render nothing — see their own
// "absent, not empty" gating), so no manual presence-tracking is needed here.
export function DailyBar({
  previousVisitAt,
}: {
  previousVisitAt: string | null | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 divide-x divide-border rounded-xl border bg-card text-card-foreground shadow px-1.5 py-1">
      <WelcomeBackSegment previousVisitAt={previousVisitAt} />
      <MissionSegment />
      <TodaySegment />
      <InsightSegment />
      <WeekSegment />
    </div>
  );
}
```

- [ ] **Step 4: Remove `WeeklyReview` from `dashboard.tsx`**

In `artifacts/edc/src/pages/dashboard.tsx`, remove this import line:

```tsx
import { WeeklyReview } from "@/components/dashboard/widgets/weekly-review";
```

and change:

```tsx
      <DashboardHero />
      <CelebrationWatcher previousVisitAt={previousVisitAt} />
      <WeeklyReview />
      <DailyBar previousVisitAt={previousVisitAt} />
```

to:

```tsx
      <DashboardHero />
      <CelebrationWatcher previousVisitAt={previousVisitAt} />
      <DailyBar previousVisitAt={previousVisitAt} />
```

- [ ] **Step 5: Delete the old widget file**

```bash
git rm artifacts/edc/src/components/dashboard/widgets/weekly-review.tsx
```

- [ ] **Step 6: Typecheck**

Run: `pnpm run typecheck`
Expected: no errors. In particular, confirm no other file still imports `weekly-review.tsx` (it shouldn't — `dashboard.tsx` was its only consumer) and that `DeltaBadge`'s two existing call sites in `deal-trajectory.tsx` and `vital-signs-bar.tsx` still typecheck unchanged (they don't pass `compact`, so they keep their current rendering).

- [ ] **Step 7: Commit**

```bash
git add artifacts/edc/src/components/dashboard/widgets/_shared.tsx \
        artifacts/edc/src/components/dashboard/daily-bar/week-segment.tsx \
        artifacts/edc/src/components/dashboard/daily-bar/daily-bar.tsx \
        artifacts/edc/src/pages/dashboard.tsx
git commit -m "feat: compact Week Summary into a DailyBar segment, remove WeeklyReview card"
```

---

### Task 3: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck + build**

Run: `pnpm run typecheck`
Expected: no errors across all packages.

Run: `pnpm run build`
Expected: build succeeds.

- [ ] **Step 2: Start the stack**

Follow `Deal-Commander/CLAUDE.md`'s dev commands:

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/edc run dev
```

- [ ] **Step 3: Live-check the bar on today's date**

Using the running dev server (Chrome DevTools MCP or Playwright MCP), navigate to the dashboard and confirm:
- The bar renders in order: Last visit (if applicable) → Mission → Today (if after 16:00 local) → Insight (if a candidate exists) → Week (only if today is Monday or Friday).
- No full-width "Last session you" box or "Week Summary"/"This Week" card remains above `DailyBar`.
- Each present segment's popover opens on click, shows the expected content, and (Today/Week) dismisses correctly via its `X` button.
- The bar wraps sensibly (no horizontal overflow) at a narrow viewport width (resize to ~500px).
- No new console errors.

- [ ] **Step 4: Exercise the Week segment's other branch**

Today's actual weekday only exercises one of Monday/Friday (or neither). To check the other branch without waiting for the real date, temporarily override the page's clock via the browser tool's script-evaluation capability, e.g.:

```js
// Run in the page context (devtools/playwright evaluate), NOT committed to source:
const real = Date;
class FakeDate extends real {
  constructor(...args) {
    if (args.length === 0) super(2026, 6, 27); // a Monday, 0-indexed month
    else super(...args);
  }
  static now() { return new FakeDate().getTime(); }
}
window.Date = FakeDate;
```

Reload the dashboard, confirm the Monday branch (open-items count chip, "This Week" popover header/bullets). Repeat with a Friday date (e.g. `new real(2026, 6, 31)`) to confirm the Friday branch (delta chip, "Week Summary" popover header/bullets, dismiss hides it for the rest of that ISO week). This is QA-only — no source file is changed by this step.

- [ ] **Step 5: Confirm no regression in the untouched segments**

Click through Mission and Today's popovers once more; confirm their content and dismiss behavior (Today only) are unchanged from before this plan.

---

## Self-Review

**Spec coverage:** every item in `2026-07-25-dailybar-session-week-segments-design.md`'s Decision section (Welcome Back segment shape, Week segment shape + live chip, ordering, dismiss placement, `DashboardHero`/`WeeklyReview` cleanup) maps to Task 1 or Task 2 above. The spec's Testing section (no new unit tests needed; manual verification) maps to Task 3.

**Placeholder scan:** no TBD/TODO; every step has complete code or an exact command.

**Type consistency:** `WelcomeBackSegment`'s and `DailyBar`'s `previousVisitAt: string | null | undefined` prop type matches the type already used for this value in `dashboard.tsx`'s `useState<string | null | undefined>`. `WeekSegment`'s `NextActionsData` import matches the type already exported from `next-actions.tsx`. `DeltaBadge`'s new `compact` prop is optional with a default, so its two existing call sites (unchanged, not shown as edited files) keep compiling and rendering identically.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-25-dailybar-session-week-segments.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
