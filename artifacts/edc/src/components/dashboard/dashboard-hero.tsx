import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  useGetMe,
  useDashboardVisit,
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

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

export function DashboardHero() {
  const [, navigate] = useLocation();
  const { data: me, isLoading: isLoadingMe } = useGetMe();
  const dashboardVisit = useDashboardVisit();
  const touched = useRef(false);
  const [previousVisitAt, setPreviousVisitAt] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (touched.current) return;
    touched.current = true;
    dashboardVisit.mutateAsync().then(
      (res) => setPreviousVisitAt(res.previousVisitAt),
      () => setPreviousVisitAt(null),
    );
    // Intentionally fires exactly once per mount, not on every dep identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Computed once per mount, not on every render — otherwise this timestamp's
  // millisecond precision would mint a brand-new query key every render and
  // trigger a continuous refetch loop against /api/v2/activity.
  const [since24h] = useState(() => new Date(Date.now() - ONE_DAY_MS).toISOString());
  const { data: recentActivityWrapper, isLoading: isLoadingRecentActivity } = useListPortfolioActivity({
    since: since24h,
    limit: 50,
  });
  const recentActivity = recentActivityWrapper?.data ?? [];

  const welcomeBackEnabled = previousVisitAt !== undefined && previousVisitAt !== null;
  const welcomeBackParams = { since: previousVisitAt ?? undefined, limit: 20 };
  const { data: welcomeBackWrapper } = useListPortfolioActivity(welcomeBackParams, {
    query: { enabled: welcomeBackEnabled, queryKey: getListPortfolioActivityQueryKey(welcomeBackParams) },
  });
  const welcomeBackActivity = welcomeBackWrapper?.data ?? [];

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
  const mostRecentDealId = welcomeBackActivity[0]?.dealId;

  return (
    <div className="space-y-4">
      {lockedGreeting ? (
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{headline}</h1>
          {subline && <p className="text-muted-foreground mt-2">{subline}</p>}
        </div>
      ) : (
        <div className="space-y-2">
          <Skeleton className="h-9 w-[320px]" />
          <Skeleton className="h-5 w-[420px]" />
        </div>
      )}

      {welcomeBackEnabled && welcomeBackActivity.length > 0 && (
        <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
          <p className="text-sm font-semibold">Last session you:</p>
          <ul className="space-y-1">
            {welcomeBackActivity.slice(0, 5).map((e) => (
              <li key={e.id} className="text-sm text-muted-foreground">
                ✓ {e.summary}
              </li>
            ))}
          </ul>
          {mostRecentDealId && (
            <button
              type="button"
              onClick={() => navigate(`/deals/${mostRecentDealId}`)}
              className="inline-flex items-center min-h-[44px] py-2 text-sm font-medium text-primary hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              Continue where you left off →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
