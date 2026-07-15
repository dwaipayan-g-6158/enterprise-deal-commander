import { and, eq, isNull, desc } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  pipelineStages,
  pricingModels,
  dealTechnicalGates,
  dealBlockers,
  blockerSeverities,
  dealScores,
  dealMemory,
  scoringModelWeights,
} from "@workspace/db";
import {
  computePredictiveScore,
  type ScoringInput,
  type ScoringContext,
} from "@workspace/engine";
import { cache, CacheKeys, CacheTtl } from "./cache";
import { mergeScoringWeights } from "./engine-config";

// Predictive deal scoring (PRD F3). Scores are computed from current deal state
// and PERSISTED to `deal_scores` (append-only history); the roster / analytics
// read the most recent row per deal. Extracted here so the on-demand route, the
// bulk recalculate, the seed, and the event subscriber all score identically.

const activeFilter = and(isNull(enterpriseDeals.deletedAt), isNull(enterpriseDeals.archivedAt));

function daysBetween(from: Date | string | null, to = new Date()): number {
  if (!from) return 0;
  return Math.max(0, Math.round((to.getTime() - new Date(from).getTime()) / 86_400_000));
}

export async function historicalContext(): Promise<ScoringContext> {
  const won = await db
    .select({ tcv: dealMemory.finalTcv })
    .from(dealMemory)
    .where(eq(dealMemory.outcome, "Won"));
  const tcvs = won.map((w) => Number(w.tcv) || 0).filter((n) => n > 0);
  const avgWonTCV = tcvs.length ? tcvs.reduce((a, b) => a + b, 0) / tcvs.length : null;
  return { avgWonTCV };
}

/**
 * Calibrated scoring weights, latest row per feature, merged over the engine
 * defaults. Cached under the `lookup:` tier like thresholds/FX — the cache
 * middleware drops it on any settings mutation.
 */
export async function getScoringWeights(): Promise<Record<string, number>> {
  return cache.wrap(`${CacheKeys.lookupPrefix}scoring-weights`, CacheTtl.lookup, async () => {
    const rows = await db
      .select({
        featureId: scoringModelWeights.featureId,
        calibratedWeight: scoringModelWeights.calibratedWeight,
        calibrationDate: scoringModelWeights.calibrationDate,
      })
      .from(scoringModelWeights)
      .orderBy(desc(scoringModelWeights.calibrationDate));
    const latest = new Map<string, number>();
    for (const r of rows) {
      if (!latest.has(r.featureId)) latest.set(r.featureId, Number(r.calibratedWeight));
    }
    return mergeScoringWeights(
      [...latest.entries()].map(([featureId, calibratedWeight]) => ({ featureId, calibratedWeight })),
    );
  });
}

export async function buildScoringInput(dealId: string): Promise<ScoringInput | null> {
  const dealRows = await db
    .select({
      productRevenue: enterpriseDeals.productRevenue,
      servicesRevenue: enterpriseDeals.servicesRevenue,
      stageEnteredAt: enterpriseDeals.stageEnteredAt,
      expectedCloseDate: enterpriseDeals.expectedCloseDate,
      salesStageId: enterpriseDeals.salesStageId,
      pricingModelId: enterpriseDeals.pricingModelId,
      stageName: pipelineStages.stageName,
      pricingModel: pricingModels.modelName,
    })
    .from(enterpriseDeals)
    .leftJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .leftJoin(pricingModels, eq(enterpriseDeals.pricingModelId, pricingModels.id))
    .where(eq(enterpriseDeals.id, dealId))
    .limit(1);
  const deal = dealRows[0];
  if (!deal) return null;

  const gates = await db
    .select({ gateCode: dealTechnicalGates.gateCode, isCompleted: dealTechnicalGates.isCompleted })
    .from(dealTechnicalGates)
    .where(eq(dealTechnicalGates.dealId, dealId));
  const completed = gates.filter((g) => g.isCompleted);
  const progressPct = gates.length ? Math.round((completed.length / gates.length) * 100) : 0;
  const ctoSignedOff = completed.some((g) => /CTO|SIGN/i.test(g.gateCode));
  const executiveAgreed = completed.some((g) => /EXEC|AGREED|G1/i.test(g.gateCode));

  const blockers = await db
    .select({ severity: blockerSeverities.severityName })
    .from(dealBlockers)
    .leftJoin(blockerSeverities, eq(dealBlockers.severityId, blockerSeverities.id))
    .where(and(eq(dealBlockers.dealId, dealId), eq(dealBlockers.isResolved, false)));
  const totalBlockerCount = blockers.length;
  const highBlockerCount = blockers.filter((b) => /high|critical/i.test(b.severity ?? "")).length;

  const productRevenue = Number(deal.productRevenue) || 0;
  const servicesRevenue = Number(deal.servicesRevenue) || 0;

  return {
    progressPct,
    daysInStage: daysBetween(deal.stageEnteredAt),
    productRevenue,
    servicesRevenue,
    ctoSignedOff,
    executiveAgreed,
    totalBlockerCount,
    highBlockerCount,
    calculatedTCV: productRevenue + servicesRevenue,
    daysToClose: deal.expectedCloseDate
      ? daysBetween(new Date(), new Date(deal.expectedCloseDate))
      : null,
    profileKey: `${deal.stageName ?? deal.salesStageId}|${deal.pricingModel ?? deal.pricingModelId}`,
  };
}

export interface PersistedScore {
  score: number;
  confidence: string;
  breakdown: unknown;
}

/**
 * Compute a deal's predictive score from current state and persist it. Returns
 * the score (or null if the deal no longer exists). Pass a pre-built `ctx` when
 * scoring many deals to avoid re-querying historical context per deal.
 */
export async function scoreDeal(
  dealId: string,
  ctx?: ScoringContext,
  weights?: Record<string, number>,
): Promise<PersistedScore | null> {
  const input = await buildScoringInput(dealId);
  if (!input) return null;
  const context = ctx ?? (await historicalContext());
  const w = weights ?? (await getScoringWeights());
  const score = computePredictiveScore(input, context, w);
  await db.insert(dealScores).values({
    dealId,
    score: score.score,
    confidence: score.confidence,
    breakdown: score.breakdown,
  });
  return { score: score.score, confidence: score.confidence, breakdown: score.breakdown };
}

/** (Re)score every active deal. Returns the number scored. */
export async function rescoreActiveDeals(): Promise<number> {
  const deals = await db.select({ id: enterpriseDeals.id }).from(enterpriseDeals).where(activeFilter);
  const ctx = await historicalContext();
  const weights = await getScoringWeights();
  let count = 0;
  for (const d of deals) {
    if (await scoreDeal(d.id, ctx, weights)) count++;
  }
  return count;
}
