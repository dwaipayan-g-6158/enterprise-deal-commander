// Catalyst-backed reimplementation of ../scoring.ts — see the module
// docstring in ./intelligence.ts for why this is a parallel file rather than
// an in-place rewrite. lib/subscribers/scoring.ts still imports the original
// (Drizzle) version and is unaffected by this file.
import {
  type CatalystApp,
  createEnterpriseDealsRepo,
  createPipelineStagesRepo,
  createPricingModelsRepo,
  createDealTechnicalGatesRepo,
  createDealBlockersRepo,
  createBlockerSeveritiesRepo,
  createDealMemoryRepo,
  createScoringModelWeightsRepo,
  createDealScoresRepo,
  createVelocityBenchmarksRepo,
} from "@workspace/db/catalyst";
import {
  computePredictiveScore,
  calculateFlatTCV,
  type ScoringInput,
  type ScoringContext,
  type ScoreFactorResult,
} from "@workspace/engine";
import { cache, CacheKeys, CacheTtl } from "../cache";
import { mergeScoringWeights } from "../engine-config";
import { getPlaybookSignals } from "./playbook-signals";

// Predictive deal scoring (PRD F3). Scores are computed from current deal state
// and PERSISTED to `deal_scores` (append-only history); the roster / analytics
// read the most recent row per deal. Extracted here so the on-demand route, the
// bulk recalculate, the seed, and the event subscriber all score identically.

function daysBetween(from: Date | string | null, to = new Date()): number {
  if (!from) return 0;
  return Math.max(0, Math.floor((to.getTime() - new Date(from).getTime()) / 86_400_000));
}

export async function historicalContext(catalystApp: CatalystApp): Promise<ScoringContext> {
  const decidedOutcomes = await createDealMemoryRepo(catalystApp).listByOutcomes(["Won", "Lost"]);
  const tcvs = decidedOutcomes
    .filter((r) => r.outcome === "Won")
    .map((r) => r.finalTcv ?? 0)
    .filter((n) => n > 0);
  const avgWonTCV = tcvs.length ? tcvs.reduce((a, b) => a + b, 0) / tcvs.length : null;

  // Win rate keyed by pricing model alone (NOT stage+pricingModel): a closed
  // deal in dealMemory has no "current stage" concept to key against, and
  // deriving one from pipelineTransitions is a separate, bigger task. This
  // matches profileKey below and /analytics/pricing-benchmarks, which also
  // groups dealMemory by pricingModel without a stage dimension.
  const tally = new Map<string, { won: number; total: number }>();
  for (const row of decidedOutcomes) {
    if (!row.pricingModel) continue;
    const t = tally.get(row.pricingModel) ?? { won: 0, total: 0 };
    t.total++;
    if (row.outcome === "Won") t.won++;
    tally.set(row.pricingModel, t);
  }
  const winRateByProfile: Record<string, number> = {};
  for (const [model, t] of tally) winRateByProfile[model] = t.won / t.total;

  return { avgWonTCV, winRateByProfile };
}

/**
 * Median days historically spent in `stageName`, from the velocity benchmark
 * rollup (same lookup lib/catalyst/intelligence.ts uses for the risk engine's
 * stage-pace signal). Null when the stage has no benchmark row yet.
 */
async function stageBenchmarkDaysFor(catalystApp: CatalystApp, stageName: string | null): Promise<number | null> {
  if (!stageName) return null;
  return createVelocityBenchmarksRepo(catalystApp).getMedianDaysForStage(stageName);
}

/**
 * Calibrated scoring weights, latest row per feature, merged over the engine
 * defaults. Cached under the `lookup:` tier like thresholds/FX — the cache
 * middleware drops it on any settings mutation.
 */
export async function getScoringWeights(catalystApp: CatalystApp): Promise<Record<string, number>> {
  return cache.wrap(`${CacheKeys.lookupPrefix}scoring-weights`, CacheTtl.lookup, async () => {
    const rows = await createScoringModelWeightsRepo(catalystApp).listAll(); // newest first
    const latest = new Map<string, number>();
    for (const r of rows) {
      if (!latest.has(r.featureId)) latest.set(r.featureId, r.calibratedWeight);
    }
    return mergeScoringWeights(
      [...latest.entries()].map(([featureId, calibratedWeight]) => ({ featureId, calibratedWeight })),
    );
  });
}

export async function buildScoringInput(catalystApp: CatalystApp, dealId: string): Promise<ScoringInput | null> {
  const deal = await createEnterpriseDealsRepo(catalystApp).getById(dealId);
  if (!deal) return null;
  const [stages, pricingModels] = await Promise.all([
    createPipelineStagesRepo(catalystApp).listAll(),
    createPricingModelsRepo(catalystApp).listAll(),
  ]);
  const stageName = stages.find((s) => s.id === deal.salesStageId)?.stageName ?? null;
  const pricingModel = pricingModels.find((p) => p.id === deal.pricingModelId)?.modelName ?? null;

  const gates = await createDealTechnicalGatesRepo(catalystApp).list(dealId);
  const completed = gates.filter((g) => g.isCompleted);
  const progressPct = gates.length ? Math.round((completed.length / gates.length) * 100) : 0;
  const ctoSignedOff = completed.some((g) => g.gateCode === "G5_CTO_SIGNED_OFF");
  const executiveAgreed = completed.some((g) => g.gateCode === "G1_EXECUTIVE_AGREED");

  const [blockers, severities] = await Promise.all([
    createDealBlockersRepo(catalystApp).list(dealId),
    createBlockerSeveritiesRepo(catalystApp).listAll(),
  ]);
  const severityNameById = new Map(severities.map((s) => [s.id, s.severityName]));
  const activeBlockers = blockers
    .filter((b) => !b.isResolved)
    .map((b) => severityNameById.get(b.severityId) ?? "");
  const totalBlockerCount = activeBlockers.length;
  const highBlockerCount = activeBlockers.filter((s) => /high|critical/i.test(s)).length;

  const productRevenue = Number(deal.productRevenue) || 0;
  const servicesRevenue = Number(deal.servicesRevenue) || 0;

  const playbook = await getPlaybookSignals(catalystApp, dealId);

  return {
    progressPct,
    daysInStage: daysBetween(deal.stageEnteredAt),
    productRevenue,
    servicesRevenue,
    ctoSignedOff,
    executiveAgreed,
    totalBlockerCount,
    highBlockerCount,
    calculatedTCV: calculateFlatTCV({
      productRevenue,
      servicesRevenue,
      contractTermYears: deal.contractTermYears,
      pricingModel: pricingModel ?? "",
    }),
    daysToClose: deal.expectedCloseDate
      ? daysBetween(new Date(), new Date(deal.expectedCloseDate))
      : null,
    profileKey: pricingModel ?? String(deal.pricingModelId),
    // Playbook execution — undefined adherence (no active playbook) leaves the
    // playbook_adherence factor at a neutral 0.5.
    playbookAdherencePct: playbook.adherencePct ?? undefined,
    playbookCriticalGaps: playbook.criticalGaps,
    playbookOverdueCount: playbook.overdueCount,
  };
}

export interface PersistedScore {
  score: number;
  confidence: string;
  /**
   * The engine's own per-factor result, not a widened `unknown[]`.
   *
   * This was the point at which the typed `ScoreFactorResult[]` stopped being a
   * type. Downstream, `openapi.yaml` described it as a free-form object, so
   * every consumer re-declared the field names by hand — and the mobile score
   * panel guessed wrong, reading `factor`/`name`/`label` where the engine emits
   * `featureId`/`description`. Nine correctly-computed factors rendered as nine
   * rows labelled "Other". Both ends are typed now; keep them that way.
   */
  breakdown: ScoreFactorResult[];
}

/**
 * Compute a deal's predictive score from current state WITHOUT persisting it.
 * Returns null if the deal no longer exists. Pass a pre-built `ctx`/`weights`
 * when scoring many deals to avoid re-querying them per deal.
 */
export async function computeDealScore(
  catalystApp: CatalystApp,
  dealId: string,
  ctx?: ScoringContext,
  weights?: Record<string, number>,
): Promise<PersistedScore | null> {
  const input = await buildScoringInput(catalystApp, dealId);
  if (!input) return null;
  const baseCtx = ctx ?? (await historicalContext(catalystApp));
  // stageBenchmarkDays is inherently per-deal (this deal's CURRENT stage), so
  // it's always resolved fresh here — never taken from a shared/cached `ctx`.
  const deal = await createEnterpriseDealsRepo(catalystApp).getById(dealId);
  const stages = await createPipelineStagesRepo(catalystApp).listAll();
  const stageName = deal ? stages.find((s) => s.id === deal.salesStageId)?.stageName ?? null : null;
  const stageBenchmarkDays = await stageBenchmarkDaysFor(catalystApp, stageName);
  const context: ScoringContext = { ...baseCtx, stageBenchmarkDays };
  const w = weights ?? (await getScoringWeights(catalystApp));
  const score = computePredictiveScore(input, context, w);
  return { score: score.score, confidence: score.confidence, breakdown: score.breakdown };
}

/**
 * Compute a deal's predictive score from current state AND persist it to
 * deal_scores (append-only history). Returns the score (or null if the deal
 * no longer exists). Pass a pre-built `ctx` when scoring many deals to avoid
 * re-querying historical context per deal.
 */
export async function scoreDeal(
  catalystApp: CatalystApp,
  dealId: string,
  ctx?: ScoringContext,
  weights?: Record<string, number>,
): Promise<PersistedScore | null> {
  const result = await computeDealScore(catalystApp, dealId, ctx, weights);
  if (!result) return null;
  await createDealScoresRepo(catalystApp).append({
    dealId,
    score: result.score,
    confidence: result.confidence,
    breakdown: result.breakdown,
  });
  return result;
}

/** (Re)score every active deal. Returns the number scored. */
export async function rescoreActiveDeals(catalystApp: CatalystApp): Promise<number> {
  const allDeals = await createEnterpriseDealsRepo(catalystApp).list();
  const activeDeals = allDeals.filter((d) => d.deletedAt == null && d.archivedAt == null);
  const ctx = await historicalContext(catalystApp);
  const weights = await getScoringWeights(catalystApp);
  let count = 0;
  for (const d of activeDeals) {
    if (await scoreDeal(catalystApp, d.id, ctx, weights)) count++;
  }
  return count;
}
