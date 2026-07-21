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
import { compactCurrency, relativeTime } from "@/components/dashboard/widgets/_shared";
import { getTimeBand } from "@/lib/greetings/time-bands";
import { selectGreeting, type GreetingContext, type GreetingPool } from "@/lib/greetings/select-greeting";
import GREETING_POOL from "@/lib/greetings/greeting-pool.json";
import { readShownHistory, recordShown } from "@/lib/greetings/shown-history";
import { defaultStore } from "@/lib/storage";
import { readRecentDeals } from "@/lib/recent-deals";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

export function DashboardHero() {
  const [, navigate] = useLocation();
  const { data: me } = useGetMe();
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

  const since24h = new Date(Date.now() - ONE_DAY_MS).toISOString();
  const { data: recentActivityWrapper } = useListPortfolioActivity({
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

  const { data: activeDealsWrapper } = useListDeals({ state: "active", limit: 500 });
  const activeDeals = activeDealsWrapper?.data ?? [];

  const { data: nextActionsWrapper } = useGetNextActions();
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
  const recentPhaseAdvanceCount = recentActivity.filter((e) => e.eventType === "stage_changed").length;
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

  const now = new Date();
  const band = getTimeBand(now);
  const shownHistory = readShownHistory(defaultStore, now);
  const greeting = selectGreeting(GREETING_POOL as GreetingPool, band, context, shownHistory);

  useEffect(() => {
    recordShown(defaultStore, greeting.id, now);
    // Records once per greeting id shown; re-running every render would defeat dedup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greeting.id]);

  const [headline, ...rest] = greeting.text.split("\n");
  const subline = rest.join(" ");
  const recentDeals = readRecentDeals(defaultStore);
  const mostRecentDealId = welcomeBackActivity[0]?.dealId;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{headline}</h1>
        {subline && <p className="text-muted-foreground mt-2">{subline}</p>}
      </div>

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
              className="text-sm font-medium text-primary hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              Continue where you left off →
            </button>
          )}
        </div>
      )}

      {recentDeals.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {recentDeals.map((d) => (
            <button
              key={d.dealId}
              type="button"
              onClick={() => navigate(`/deals/${d.dealId}`)}
              className="shrink-0 min-w-[220px] rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <p className="text-sm font-medium truncate">{d.dealName}</p>
              <p className="text-xs text-muted-foreground">{d.stageName}</p>
              <p className="text-xs text-muted-foreground">{relativeTime(d.visitedAt)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
