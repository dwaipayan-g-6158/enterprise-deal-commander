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
import { terminalOutcome } from "@/components/roster/model/board";
import { calendarDaysUntil } from "@/lib/format";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * ONE_DAY_MS;
/** "Closing this week" window, in local calendar days (inclusive of today). */
const CLOSE_WINDOW_DAYS = 7;

/**
 * `reportingCurrency` comes from the intelligence summary via
 * `pages/dashboard.tsx`. It is REQUIRED, not defaulted: the greeting formats
 * `normalizedTCV` sums, which are denominated in the portfolio's reporting
 * currency, and these calls used to omit it entirely — so `compactCurrency`
 * fell back to its "USD" default and stamped a `$` on EUR/GBP/INR figures.
 */
export function DashboardHero({ reportingCurrency }: { reportingCurrency: string }) {
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
  const closingThisWeek = activeDeals.filter((d) => {
    // "active" is a lifecycle filter only — a deal that already reached
    // Closed-Won/Closed-Lost stays in this fetch, so it must be excluded here
    // or it inflates the "closing this week" greeting even though it's decided.
    if (terminalOutcome(d.salesStage) != null) return false;
    // calendarDaysUntil, not `new Date(str).getTime() >= Date.now()`:
    // expectedCloseDate is a date-only "YYYY-MM-DD" column, which `new Date`
    // reads as UTC midnight — already in the past by 00:01 local in any zone
    // east of UTC, so a deal closing TODAY was silently dropped from this
    // greeting's count and value. Same helper the roster and timeline use.
    const days = calendarDaysUntil(d.expectedCloseDate);
    return days != null && days >= 0 && days <= CLOSE_WINDOW_DAYS;
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
    closeThisWeekValue: compactCurrency(closeThisWeekValueRaw, reportingCurrency),
    closeThisWeekCount: closingThisWeek.length,
    recentPhaseAdvanceCount,
    activeValidationValueRaw,
    activeValidationValue: compactCurrency(activeValidationValueRaw, reportingCurrency),
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
