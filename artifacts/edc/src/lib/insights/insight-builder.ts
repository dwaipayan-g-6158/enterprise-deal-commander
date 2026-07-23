// Pure insight-builder for the dashboard's Insight Banner. Consolidates PRD
// 4.4 (Intelligent Insight Banner) + 4.17 (AI Observations) by drawing
// candidates from data the dashboard already fetches — no new endpoints, no
// duplicated pattern logic (memory-insights patterns are surfaced, not
// re-derived). Never throws; always returns an array (possibly empty).

export type InsightKind = "trend" | "anomaly" | "comparison" | "pattern";

/** One deal backing an insight's claim, surfaced so the user can validate it. */
export interface InsightSupportingDeal {
  id: string;
  dealName: string;
  meta?: string;
}

export interface Insight {
  id: string;
  kind: InsightKind;
  text: string;
  navigateTo?: string;
  /** One-line "why" for insights with no per-deal breakdown (comparison). */
  detail?: string;
  /** Itemized "why" for insights backed by a list of matching deals (anomaly, pattern). */
  supportingDeals?: InsightSupportingDeal[];
}

/**
 * Local structural type for the slice of `/v2/analytics/vital-signs` this
 * builder needs. No shared generated type exists for it — the endpoint
 * returns a loose `GenericDataResponse` (see `lib/api-spec/openapi.yaml`).
 * `baseline` is `null` until ~7 days of snapshot history exist.
 */
export interface VitalSignsInsightInput {
  weightedPipeline: number;
  baseline: { totalTCV: number; activeDeals: number; redAlerts: number } | null;
}

/** One entry of `/v2/intelligence/summary`'s `staleDeals` array. */
export interface StaleDealInsightInput {
  dealId: string;
  dealName: string;
  daysInStage?: number;
}

/** Local structural type for the slice of the intelligence summary this builder needs. */
export interface SummaryInsightInput {
  staleDeals: StaleDealInsightInput[];
}

/** One deterministic pattern rule surfaced by `/v2/deals/memory-insights`. */
export interface MemoryPatternInsightInput {
  text: string;
  matchedDeals: { id: string; dealName: string }[];
}

/** Local structural type for the slice of the memory-insights response this builder needs. */
export interface MemoryInsightsInput {
  insights: MemoryPatternInsightInput[];
  archivedCount: number;
}

export interface InsightBuilderInputs {
  vitalSigns?: VitalSignsInsightInput | null;
  summary?: SummaryInsightInput | null;
  memoryInsights?: MemoryInsightsInput | null;
}

/** Compact currency for insight copy, e.g. "$1.2M". Kept local (no UI import) so this module stays presentation-agnostic. */
function compactCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

function buildComparisonInsight(vitalSigns: VitalSignsInsightInput | null | undefined): Insight | null {
  const baseline = vitalSigns?.baseline;
  // Never fabricate a comparison with no history — the only gate is whether
  // a baseline snapshot exists at all.
  if (!vitalSigns || !baseline) return null;
  // Note: this compares a *weighted* current figure against an *unweighted*
  // week-old baseline (there's no weighted-pipeline baseline snapshot to
  // compare against). `detail` surfaces both raw numbers with honest,
  // differentiated labels rather than implying they're the same metric.
  const detail = `Now (weighted): ${compactCurrency(vitalSigns.weightedPipeline)} · Last wk (total TCV): ${compactCurrency(baseline.totalTCV)}`;
  const delta = vitalSigns.weightedPipeline - baseline.totalTCV;
  if (delta === 0) {
    return {
      id: "comparison-wow-pipeline",
      kind: "comparison",
      text: `Weighted pipeline is holding steady vs last week at ${compactCurrency(vitalSigns.weightedPipeline)}.`,
      detail,
    };
  }
  const direction = delta > 0 ? "up" : "down";
  return {
    id: "comparison-wow-pipeline",
    kind: "comparison",
    text: `Weighted pipeline is ${direction} ${compactCurrency(Math.abs(delta))} vs last week.`,
    detail,
  };
}

function buildAnomalyInsight(summary: SummaryInsightInput | null | undefined): Insight | null {
  const staleDeals = summary?.staleDeals ?? [];
  if (staleDeals.length === 0) return null;
  const [first] = staleDeals;
  const text =
    staleDeals.length === 1
      ? `${first.dealName} has gone stale in its current stage.`
      : `${staleDeals.length} deals have gone stale in their current stage.`;
  return {
    id: "anomaly-stale-deals",
    kind: "anomaly",
    text,
    navigateTo: `/deals/${first.dealId}`,
    supportingDeals: staleDeals.map((d) => ({
      id: d.dealId,
      dealName: d.dealName,
      meta: d.daysInStage != null ? `${d.daysInStage}d in stage` : undefined,
    })),
  };
}

function buildPatternInsights(memoryInsights: MemoryInsightsInput | null | undefined): Insight[] {
  const insights = memoryInsights?.insights ?? [];
  return insights.map((ins, index) => ({
    id: `pattern-${index}`,
    kind: "pattern" as const,
    text: ins.text,
    navigateTo: ins.matchedDeals[0] ? `/deals/${ins.matchedDeals[0].id}` : undefined,
    supportingDeals: ins.matchedDeals.map((m) => ({ id: m.id, dealName: m.dealName })),
  }));
}

/**
 * Builds every insight candidate the current data supports. `trend` is a
 * reserved kind for future data sources — no current input produces one, but
 * the type stays stable so later candidates can slot in without a breaking
 * change to `Insight`. Returns `[]` when nothing qualifies.
 */
export function buildInsights(inputs: InsightBuilderInputs, now: Date): Insight[] {
  void now; // reserved for future time-sensitive candidates (e.g. "trend")
  const out: Insight[] = [];
  const comparison = buildComparisonInsight(inputs.vitalSigns);
  if (comparison) out.push(comparison);
  const anomaly = buildAnomalyInsight(inputs.summary);
  if (anomaly) out.push(anomaly);
  out.push(...buildPatternInsights(inputs.memoryInsights));
  return out;
}
