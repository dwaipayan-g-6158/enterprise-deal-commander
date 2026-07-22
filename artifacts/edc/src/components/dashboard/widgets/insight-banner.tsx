import { useRef } from "react";
import { useLocation } from "wouter";
import {
  useGetVitalSigns,
  useGetIntelligenceSummary,
  useGetMemoryInsights,
} from "@workspace/api-client-react";
import {
  buildInsights,
  type Insight,
  type InsightBuilderInputs,
  type MemoryInsightsInput,
  type SummaryInsightInput,
  type VitalSignsInsightInput,
} from "@/lib/insights/insight-builder";
import { pickInsight } from "@/lib/insights/insight-history";
import { defaultStore } from "@/lib/storage";

// Widget — Intelligent Insight Banner. Consolidates PRD 4.4 (Intelligent
// Insight Banner) + 4.17 (AI Observations) into one rotating, data-backed
// observation per session. All three source hooks are already called
// elsewhere on the dashboard page, so react-query dedupes these calls — no
// extra network cost. Renders nothing when there's no candidate worth
// surfacing; this banner is meant to be invisible, not an empty-state card.
export function InsightBanner() {
  const [, navigate] = useLocation();
  const { data: vitalSignsWrapper, isLoading: isLoadingVitalSigns } = useGetVitalSigns();
  const { data: summaryWrapper, isLoading: isLoadingSummary } = useGetIntelligenceSummary();
  const { data: memoryWrapper, isLoading: isLoadingMemory } = useGetMemoryInsights();

  const vitalSigns = vitalSignsWrapper?.data as VitalSignsInsightInput | undefined;
  const summary = summaryWrapper?.data as SummaryInsightInput | undefined;
  const memoryInsights = memoryWrapper?.data as MemoryInsightsInput | undefined;

  // Freeze the pick the first time all three source queries have settled
  // (succeeded OR failed) — mirrors DashboardHero's greeting lock. Gating on
  // `isLoading` rather than `data !== undefined` means a transient failure of
  // any one query still lets the other two contribute (their optional-chain
  // accessors above already degrade to `undefined`), and — critically — a
  // background refetch after the initial settle never reshuffles or rebuilds
  // the shown insight mid-session.
  const dataReady = !isLoadingVitalSigns && !isLoadingSummary && !isLoadingMemory;
  const lockedInsightRef = useRef<Insight | null | undefined>(undefined);
  if (dataReady && lockedInsightRef.current === undefined) {
    const inputs: InsightBuilderInputs = { vitalSigns, summary, memoryInsights };
    const candidates = buildInsights(inputs, new Date());
    lockedInsightRef.current = pickInsight(candidates, defaultStore, new Date());
  }
  const insight = lockedInsightRef.current;

  if (!insight) return null;

  return (
    <div className="rounded-lg border bg-muted/20 p-4 flex items-center justify-between gap-4">
      <p className="text-sm">{insight.text}</p>
      {insight.navigateTo && (
        <button
          type="button"
          onClick={() => navigate(insight.navigateTo!)}
          className="inline-flex shrink-0 items-center min-h-[44px] py-2 px-3 text-sm font-medium text-primary hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          View →
        </button>
      )}
    </div>
  );
}
