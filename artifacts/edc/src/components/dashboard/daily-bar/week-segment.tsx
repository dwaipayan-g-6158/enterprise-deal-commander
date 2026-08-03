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
// `reportingCurrency` is threaded in from `pages/dashboard.tsx` (via DailyBar)
// rather than defaulted: the pipeline figures below are vital-signs totals
// denominated in the portfolio's reporting currency, and these three
// compactCurrency calls used to omit it — falling back to the helper's "USD"
// default and printing a `$` in front of EUR/GBP/INR amounts.
export function WeekSegment({ reportingCurrency }: { reportingCurrency: string }) {
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
            isLoading
              ? monday
                ? "This Week"
                : "Week Summary"
              : monday
                ? `This Week: ${openCount} open item${openCount === 1 ? "" : "s"}`
                : baseline !== null && vitalSigns
                  ? `Week Summary: pipeline ${vitalSigns.totalTCV >= baseline.totalTCV ? "up" : "down"} ${compactCurrency(Math.abs(vitalSigns.totalTCV - baseline.totalTCV), reportingCurrency)} vs last week`
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
              format={(n) => compactCurrency(n, reportingCurrency)}
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
                  format={(n) => compactCurrency(n, reportingCurrency)}
                />
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
