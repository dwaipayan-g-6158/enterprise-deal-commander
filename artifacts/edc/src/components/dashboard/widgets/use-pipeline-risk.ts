import { useMemo } from "react";
import {
  useGetRosterEnrichment,
  useListDeals,
} from "@workspace/api-client-react";
import {
  bucketDealsByLevel,
  averageScore,
  pickHighestRisk,
  buildInsight,
  type PipelineRiskRow,
  type RiskLevel,
} from "./pipeline-risk";
import type { LevelBucket } from "./pipeline-risk";

// Re-export so consumers don't need to import from two places.
export type { PipelineRiskRow, RiskLevel, LevelBucket };

interface RosterEnrichmentItem {
  id: string;
  riskScore?: number | null;
  riskLevel?: RiskLevel | null;
}

/**
 * Aggregates per-deal risk data across the active pipeline.
 *
 * Data strategy (mirrors use-roster-data.ts):
 *   - `useListDeals({ state: "active", limit: 500 })` → deal list (TCV, id, name)
 *   - `useGetRosterEnrichment()` → per-deal riskScore / riskLevel
 *   Joined by deal id; rows without enrichment get null risk fields.
 *
 * NOTE: per-dimension scores are NOT available client-side (the enrichment
 * only carries composite score + level), so this hook does not expose dimension
 * averages.
 */
export function usePipelineRisk() {
  const dealsQuery = useListDeals({ state: "active", limit: 500 });
  const enrichQuery = useGetRosterEnrichment();

  const rows: PipelineRiskRow[] = useMemo(() => {
    const deals = dealsQuery.data?.data ?? [];
    const enrichList =
      (enrichQuery.data?.data as { deals?: RosterEnrichmentItem[] } | undefined)
        ?.deals ?? [];

    const byId = new Map(enrichList.map((e) => [e.id, e]));

    return deals.map((d) => {
      const e = byId.get(d.id);
      return {
        id: d.id,
        name: d.dealName,
        // prefer normalizedTCV (currency-converted); fall back to calculatedTCV
        tcv: d.normalizedTCV ?? d.calculatedTCV ?? 0,
        riskScore: e?.riskScore ?? null,
        riskLevel: (e?.riskLevel as RiskLevel | null | undefined) ?? null,
      } satisfies PipelineRiskRow;
    });
  }, [dealsQuery.data, enrichQuery.data]);

  const buckets = useMemo(() => bucketDealsByLevel(rows), [rows]);
  const avgScore = useMemo(() => averageScore(rows), [rows]);
  const highest = useMemo(() => pickHighestRisk(rows), [rows]);
  const insight = useMemo(() => buildInsight(buckets, avgScore), [buckets, avgScore]);

  return {
    rows,
    buckets,
    avgScore,
    highest,
    insight,
    isLoading: dealsQuery.isLoading || enrichQuery.isLoading,
    isError: dealsQuery.isError || enrichQuery.isError,
  };
}
