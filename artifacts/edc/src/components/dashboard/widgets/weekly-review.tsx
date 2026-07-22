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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { compactCurrency, DeltaBadge } from "@/components/dashboard/widgets/_shared";
import { defaultStore } from "@/lib/storage";
import { isMonday, isFriday, currentWeekWindow, weekKey } from "@/lib/weekly/week-boundaries";
import { isDismissed, dismiss } from "@/lib/weekly/review-dismiss";
import type { NextActionsData } from "@/components/dashboard/widgets/next-actions";

/**
 * Structural slice of `/api/v2/analytics/vital-signs`'s `GenericDataResponse`
 * payload this widget needs — mirrors the local-type convention already used
 * in `vital-signs-bar.tsx` (no generated type exists for this endpoint since
 * v2 analytics routes return `GenericDataResponse`).
 */
interface VitalSignsData {
  totalTCV: number;
  baseline: { totalTCV: number; activeDeals: number; redAlerts: number } | null;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// Widget — Weekly Review (PRD 4.13). Renders only on Monday (a "This Week"
// briefing built from current pipeline state) or Friday (a "Week Summary" of
// the week's activity plus a week-over-week pipeline delta, shown only when
// snapshot history exists). Dismissable for the remainder of that ISO week
// via `review-dismiss.ts`; reappears automatically the following Monday.
// Every source hook here is already called elsewhere on the dashboard page,
// so react-query dedupes identical query keys — no extra network cost when
// this widget is mounted alongside `DashboardHero`/`NextActions`.
export function WeeklyReview() {
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
  // widget alone doesn't fire a request nothing will render.
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

  const stageAdvances = activity.filter((e) => e.eventType === "deal.stage_changed").length;
  const playbookCompletions = activity.filter(
    (e) => e.eventType === "playbook.step_changed" && e.metadata?.action === "completed",
  ).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 text-primary" />
          {monday ? "This Week" : "Week Summary"}
        </CardTitle>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss weekly review for the rest of this week"
          className="inline-flex min-h-[44px] min-w-[44px] -mr-2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-20 w-full" />
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
      </CardContent>
    </Card>
  );
}
