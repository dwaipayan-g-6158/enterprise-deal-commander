import { useRef } from "react";
import { useLocation } from "wouter";
import { Info } from "lucide-react";
import {
  useGetVitalSigns,
  useGetIntelligenceSummary,
  useGetMemoryInsights,
} from "@workspace/api-client-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

// Daily Bar segment — Intelligent Insight (formerly the standalone
// `InsightBanner`, PRD 4.4 + 4.17). Same source hooks, lock-once-settled
// pick, and 48h dedup rotation as before; only the presentation moved from a
// full-width banner into a compact, truncated bar trigger + popover holding
// the full sentence and "View →" deep-link. Renders nothing when there's no
// candidate worth surfacing — same as the original.
export function InsightSegment() {
  const [, navigate] = useLocation();
  const { data: vitalSignsWrapper, isLoading: isLoadingVitalSigns } = useGetVitalSigns();
  const { data: summaryWrapper, isLoading: isLoadingSummary } = useGetIntelligenceSummary();
  const { data: memoryWrapper, isLoading: isLoadingMemory } = useGetMemoryInsights();

  const vitalSigns = vitalSignsWrapper?.data as VitalSignsInsightInput | undefined;
  const summary = summaryWrapper?.data as SummaryInsightInput | undefined;
  const memoryInsights = memoryWrapper?.data as MemoryInsightsInput | undefined;

  // Freeze the pick the first time all three source queries have settled —
  // see the original insight-banner.tsx for the full rationale (a background
  // refetch after the initial settle must never reshuffle the shown insight
  // mid-session).
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
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-md px-2.5 py-2 min-h-[44px] text-sm hover:bg-muted/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Insight: ${insight.text}`}
        >
          <Info className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate text-muted-foreground">{insight.text}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="text-sm">{insight.text}</p>
        {insight.detail && (
          <p className="mt-1.5 text-xs text-muted-foreground">{insight.detail}</p>
        )}
        {insight.supportingDeals && insight.supportingDeals.length > 0 ? (
          <div className="mt-2 max-h-48 overflow-y-auto flex flex-wrap gap-1.5">
            {insight.supportingDeals.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => navigate(`/deals/${d.id}`)}
                aria-label={`Open deal ${d.dealName}`}
                title={d.dealName}
                className="max-w-[12rem] truncate rounded-full border bg-muted/40 px-2 py-0.5 text-xs transition-colors hover:border-primary/50 hover:bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {d.dealName}
                {d.meta ? ` · ${d.meta}` : ""}
              </button>
            ))}
          </div>
        ) : (
          insight.navigateTo && (
            <button
              type="button"
              onClick={() => navigate(insight.navigateTo!)}
              className="mt-3 inline-flex items-center text-sm font-medium text-primary hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              View →
            </button>
          )
        )}
      </PopoverContent>
    </Popover>
  );
}
