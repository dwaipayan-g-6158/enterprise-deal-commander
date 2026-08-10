import { useMemo, useState } from "react";
import {
  getListPortfolioActivityQueryKey,
  useGetFlowCoverage,
  useGetIntelligenceSummary,
  useGetMe,
  useGetMemoryInsights,
  useGetNextActions,
  useGetVitalSigns,
  useListDeals,
  useListPortfolioActivity,
  type ActivityEvent,
  type Deal,
  type Summary,
} from "@workspace/api-client-react";
import type { NextActionsData } from "@/lib/mission/priority-scorer";
import type { MemoryInsightsInput, VitalSignsInsightInput } from "@/lib/insights/insight-builder";
import { useDashboardVisitOnce } from "@/mobile/write/use-dashboard-visit";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The activity history window. Ninety days is what `computeStreak` needs to walk
 * back through; the movement and week blocks slice narrower windows out of the
 * same rows.
 */
const HISTORY_DAYS = 90;

/**
 * `/v2/activity` hard-caps every request at 200 rows server-side
 * (`clampLimit()` in routes/v2/index.ts), so asking for more only implies
 * headroom that cannot be delivered.
 */
const HISTORY_LIMIT = 200;

/** Vital signs is an open payload in the contract — this is the slice we read. */
export interface VitalSigns {
  totalTCV: number;
  weightedPipeline: number;
  activeDeals: number;
  avgScore: number | null;
  baseline: { totalTCV: number; activeDeals: number; redAlerts: number } | null;
  reportingCurrency?: string;
}

/** The one ratio the Pulse block reads out of `/v2/flow/coverage`. */
export interface Coverage {
  weighted: number | null;
  total: number | null;
}

export interface CommandData {
  summary: Summary | undefined;
  vitals: VitalSigns | undefined;
  nextActions: NextActionsData | undefined;
  memoryInsights: MemoryInsightsInput | undefined;
  coverage: Coverage | undefined;
  deals: Deal[];
  /** Ninety days of portfolio activity, newest first. */
  activity: ActivityEvent[];
  displayName: string | undefined;
  /** When this commander last opened the app, from the visit ping. */
  previousVisitAt: string | null;
  /** True once the visit ping has settled either way. */
  visitReady: boolean;
  /** Cross-currency-comparable TCV by deal id, for ranking the mission. */
  valueByDealId: Record<string, number>;
  reportingCurrency: string;
  isError: boolean;
  /** True until the blocks have enough to say anything at all. */
  isLoading: boolean;
  refresh: () => Promise<unknown>;
}

/**
 * Every read the Command Center makes, in one place.
 *
 * ## One activity query, not three
 *
 * The desktop hero issues two overlapping `/v2/activity` requests (24 hours for
 * the greeting's phase-advance count, 90 days for the streak) and the week
 * segment adds a third. All three are prefixes of the same ninety-day window, so
 * this fetches it once and the blocks filter. On a phone that is two fewer
 * round-trips on the first screen; on any connection it is two fewer chances for
 * the three to disagree about what happened today.
 *
 * ## The deals query is deliberately the roster's own
 *
 * `{ state: "active", limit: 500 }` is exactly the key `useRosterData` uses, so
 * opening Deals after Command Center hits a warm cache rather than refetching —
 * and, more importantly, the greeting and the roster cannot disagree about how
 * many deals are in Procurement.
 */
export function useCommandData(): CommandData {
  const summaryQuery = useGetIntelligenceSummary();
  const vitalsQuery = useGetVitalSigns();
  const nextActionsQuery = useGetNextActions();
  const memoryQuery = useGetMemoryInsights();
  const coverageQuery = useGetFlowCoverage();
  const meQuery = useGetMe();
  const dealsQuery = useListDeals({ state: "active", limit: 500 });

  // Computed once per mount. A timestamp recomputed on every render would mint a
  // fresh query key each time and drive a continuous refetch loop — the exact
  // trap dashboard-hero.tsx documents.
  const [since] = useState(() => new Date(Date.now() - HISTORY_DAYS * ONE_DAY_MS).toISOString());
  const activityParams = { since, limit: HISTORY_LIMIT };
  const activityQuery = useListPortfolioActivity(activityParams, {
    query: { queryKey: getListPortfolioActivityQueryKey(activityParams) },
  });

  const { previousVisitAt, ready: visitReady } = useDashboardVisitOnce();

  const deals = useMemo(() => dealsQuery.data?.data ?? [], [dealsQuery.data]);

  const valueByDealId = useMemo(() => {
    const out: Record<string, number> = {};
    // normalizedTCV first: summing calculatedTCV across currencies would rank
    // the mission by a number that adds euros to dollars.
    for (const deal of deals) out[deal.id] = deal.normalizedTCV ?? deal.calculatedTCV ?? 0;
    return out;
  }, [deals]);

  const summary = summaryQuery.data?.data;
  const vitals = vitalsQuery.data?.data as VitalSigns | undefined;

  const refresh = () =>
    Promise.all([
      summaryQuery.refetch(),
      vitalsQuery.refetch(),
      nextActionsQuery.refetch(),
      activityQuery.refetch(),
      memoryQuery.refetch(),
      coverageQuery.refetch(),
      dealsQuery.refetch(),
    ]);

  return {
    summary,
    vitals,
    nextActions: nextActionsQuery.data?.data as NextActionsData | undefined,
    memoryInsights: memoryQuery.data?.data as MemoryInsightsInput | undefined,
    coverage: coverageQuery.data?.data as Coverage | undefined,
    deals,
    activity: activityQuery.data?.data ?? [],
    displayName: meQuery.data?.displayName,
    previousVisitAt,
    visitReady,
    valueByDealId,
    reportingCurrency: summary?.reportingCurrency ?? "USD",
    // Only the summary failing is fatal: it carries the verdict, the alerts and
    // the currency every other block formats in. A missing insight or coverage
    // ratio costs one block, and the screen reads fine without it.
    isError: summaryQuery.isError,
    isLoading: summaryQuery.isLoading,
    refresh,
  };
}

/** The insight builder's view of vital signs, in its own local shape. */
export function toInsightVitals(
  vitals: VitalSigns | undefined,
  reportingCurrency: string,
): VitalSignsInsightInput | null {
  if (!vitals) return null;
  return {
    weightedPipeline: vitals.weightedPipeline,
    totalTCV: vitals.totalTCV,
    reportingCurrency,
    baseline: vitals.baseline,
  };
}
