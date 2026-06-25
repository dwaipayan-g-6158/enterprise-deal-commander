import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  pipelineStages,
  pricingModels,
  dealTechnicalGates,
  dealBlockers,
  blockerSeverities,
  dealScores,
  dealCompetitors,
  competitors,
  dealMemory,
} from "@workspace/db";
import {
  computePredictiveScore,
  runPipelineSimulation,
  parseNLC,
  type ScoringInput,
  type ScoringContext,
  type SimDeal,
} from "@workspace/engine";
import { GetDealScoreParams, ParseNlcCommandBody } from "@workspace/api-zod";
import { notFound } from "../../lib/http";

const router: IRouter = Router();

const activeFilter = and(isNull(enterpriseDeals.deletedAt), isNull(enterpriseDeals.archivedAt));

function daysBetween(from: Date | string | null, to = new Date()): number {
  if (!from) return 0;
  return Math.max(0, Math.round((to.getTime() - new Date(from).getTime()) / 86_400_000));
}

async function historicalContext(): Promise<ScoringContext> {
  const won = await db
    .select({ tcv: dealMemory.finalTcv })
    .from(dealMemory)
    .where(eq(dealMemory.outcome, "Won"));
  const tcvs = won.map((w) => Number(w.tcv) || 0).filter((n) => n > 0);
  const avgWonTCV = tcvs.length ? tcvs.reduce((a, b) => a + b, 0) / tcvs.length : null;
  return { avgWonTCV };
}

async function buildScoringInput(dealId: string): Promise<ScoringInput | null> {
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

/* ----------------------------------------------------------- F3 Scoring */

router.get("/deals/:dealId/score", async (req: Request, res: Response) => {
  const { dealId } = GetDealScoreParams.parse(req.params);
  const input = await buildScoringInput(dealId);
  if (!input) throw notFound("Deal not found");
  const ctx = await historicalContext();
  const score = computePredictiveScore(input, ctx);
  await db.insert(dealScores).values({
    dealId,
    score: score.score,
    confidence: score.confidence,
    breakdown: score.breakdown,
  });
  res.json({ data: { ...score, computedAt: new Date().toISOString() } });
});

router.post("/scores/recalculate", async (_req: Request, res: Response) => {
  const deals = await db.select({ id: enterpriseDeals.id }).from(enterpriseDeals).where(activeFilter);
  const ctx = await historicalContext();
  let count = 0;
  for (const d of deals) {
    const input = await buildScoringInput(d.id);
    if (!input) continue;
    const score = computePredictiveScore(input, ctx);
    await db.insert(dealScores).values({
      dealId: d.id,
      score: score.score,
      confidence: score.confidence,
      breakdown: score.breakdown,
    });
    count++;
  }
  res.json({ data: { rescored: count } });
});

/* ----------------------------------------------------------- F4 Velocity / pipeline */

router.get("/analytics/velocity", async (_req: Request, res: Response) => {
  const deals = await db
    .select({
      id: enterpriseDeals.id,
      dealName: enterpriseDeals.dealName,
      accountName: enterpriseDeals.accountName,
      stageEnteredAt: enterpriseDeals.stageEnteredAt,
      stageName: pipelineStages.stageName,
    })
    .from(enterpriseDeals)
    .leftJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(activeFilter);

  // Benchmark = median days-in-stage across active deals in the same stage.
  const byStage = new Map<string, number[]>();
  for (const d of deals) {
    const key = d.stageName ?? "?";
    const arr = byStage.get(key) ?? [];
    arr.push(daysBetween(d.stageEnteredAt));
    byStage.set(key, arr);
  }
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };

  const out = deals.map((d) => {
    const days = daysBetween(d.stageEnteredAt);
    const benchmark = median(byStage.get(d.stageName ?? "?") ?? [days]);
    return {
      id: d.id,
      dealName: d.dealName,
      accountName: d.accountName,
      stage: d.stageName,
      daysInStage: days,
      benchmarkDays: benchmark,
      deltaDays: days - benchmark,
      velocity: days > benchmark * 1.5 ? "SLOW" : days < benchmark * 0.5 ? "FAST" : "NORMAL",
    };
  });
  out.sort((a, b) => b.deltaDays - a.deltaDays);
  res.json({ data: { deals: out } });
});

router.get("/analytics/velocity/benchmarks", async (_req: Request, res: Response) => {
  const rows = await db
    .select({ stageEnteredAt: enterpriseDeals.stageEnteredAt, stageName: pipelineStages.stageName })
    .from(enterpriseDeals)
    .leftJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(activeFilter);
  const byStage = new Map<string, number[]>();
  for (const r of rows) {
    const key = r.stageName ?? "?";
    const arr = byStage.get(key) ?? [];
    arr.push(daysBetween(r.stageEnteredAt));
    byStage.set(key, arr);
  }
  const pct = (xs: number[], p: number) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0;
  };
  const benchmarks = [...byStage.entries()].map(([stageName, xs]) => ({
    stageName,
    p25: pct(xs, 0.25),
    median: pct(xs, 0.5),
    p75: pct(xs, 0.75),
    p90: pct(xs, 0.9),
    sampleSize: xs.length,
  }));
  res.json({ data: { benchmarks } });
});

router.get("/analytics/pipeline", async (_req: Request, res: Response) => {
  const rows = await db
    .select({
      productRevenue: enterpriseDeals.productRevenue,
      servicesRevenue: enterpriseDeals.servicesRevenue,
      stageName: pipelineStages.stageName,
    })
    .from(enterpriseDeals)
    .leftJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(activeFilter);
  let totalTcv = 0;
  const byStage = new Map<string, { count: number; tcv: number }>();
  for (const r of rows) {
    const tcv = (Number(r.productRevenue) || 0) + (Number(r.servicesRevenue) || 0);
    totalTcv += tcv;
    const key = r.stageName ?? "?";
    const cur = byStage.get(key) ?? { count: 0, tcv: 0 };
    cur.count++;
    cur.tcv += tcv;
    byStage.set(key, cur);
  }
  res.json({
    data: {
      totalTcv,
      activeDeals: rows.length,
      byStage: [...byStage.entries()].map(([stage, v]) => ({ stage, ...v })),
    },
  });
});

/* ----------------------------------------------------------- F20 Simulation */

async function latestScores(): Promise<Map<string, number>> {
  const rows = await db
    .select({ dealId: dealScores.dealId, score: dealScores.score, computedAt: dealScores.computedAt })
    .from(dealScores)
    .orderBy(desc(dealScores.computedAt));
  const m = new Map<string, number>();
  for (const r of rows) if (!m.has(r.dealId)) m.set(r.dealId, r.score);
  return m;
}

router.get("/analytics/simulation", async (req: Request, res: Response) => {
  const iterations = Math.min(50_000, Math.max(1000, Number(req.query.iterations) || 10000));
  const deals = await db
    .select({
      id: enterpriseDeals.id,
      productRevenue: enterpriseDeals.productRevenue,
      servicesRevenue: enterpriseDeals.servicesRevenue,
      winProbabilityPct: enterpriseDeals.winProbabilityPct,
    })
    .from(enterpriseDeals)
    .where(activeFilter);
  const scores = await latestScores();
  const sim: SimDeal[] = deals.map((d) => ({
    calculatedTCV: (Number(d.productRevenue) || 0) + (Number(d.servicesRevenue) || 0),
    predictiveScore: scores.get(d.id) ?? null,
    winProbabilityPct: d.winProbabilityPct ?? null,
  }));
  res.json({ data: runPipelineSimulation(sim, iterations) });
});

/* ----------------------------------------------------------- F2 Competitive analytics */

router.get("/analytics/competitive", async (_req: Request, res: Response) => {
  const rows = await db
    .select({ name: competitors.name, status: dealCompetitors.status })
    .from(dealCompetitors)
    .leftJoin(competitors, eq(dealCompetitors.competitorId, competitors.id));
  const agg = new Map<string, { encounters: number; wins: number; losses: number }>();
  for (const r of rows) {
    const key = r.name ?? "Unknown";
    const cur = agg.get(key) ?? { encounters: 0, wins: 0, losses: 0 };
    cur.encounters++;
    if (r.status === "Won Against") cur.wins++;
    if (r.status === "Lost To") cur.losses++;
    agg.set(key, cur);
  }
  const competitorsOut = [...agg.entries()]
    .map(([name, v]) => ({
      name,
      ...v,
      winRatePct: v.wins + v.losses > 0 ? Math.round((v.wins / (v.wins + v.losses)) * 100) : null,
    }))
    .sort((a, b) => b.encounters - a.encounters);
  res.json({ data: { competitors: competitorsOut } });
});

/* ----------------------------------------------------------- F5 Win/Loss analytics */

router.get("/analytics/win-loss", async (_req: Request, res: Response) => {
  const rows = await db.select().from(dealMemory);
  const won = rows.filter((r) => r.outcome === "Won").length;
  const lost = rows.filter((r) => r.outcome === "Lost").length;
  const ranges = [
    { label: "< $500K", min: 0, max: 500_000 },
    { label: "$500K–$1M", min: 500_000, max: 1_000_000 },
    { label: "$1M–$2M", min: 1_000_000, max: 2_000_000 },
    { label: "> $2M", min: 2_000_000, max: Infinity },
  ];
  const byTcv = ranges.map((rg) => {
    const inRange = rows.filter((r) => {
      const t = Number(r.finalTcv) || 0;
      return t >= rg.min && t < rg.max;
    });
    const w = inRange.filter((r) => r.outcome === "Won").length;
    return { range: rg.label, total: inRange.length, wins: w, winRatePct: inRange.length ? Math.round((w / inRange.length) * 100) : null };
  });
  res.json({
    data: {
      totalClosed: rows.length,
      won,
      lost,
      winRatePct: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null,
      byTcvRange: byTcv,
    },
  });
});

/* ----------------------------------------------------------- F19 NLC */

router.post("/nlc/parse", async (req: Request, res: Response) => {
  const b = ParseNlcCommandBody.parse(req.body);
  const parsed = parseNLC(b.query);
  res.json({ data: { query: b.query, parsed } });
});

void sql;

export default router;
