import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, gte, inArray, isNull, lte, max, ne, notInArray, sql } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  pipelineStages,
  pricingModels,
  dealTechnicalGates,
  dealScores,
  dealActivityLog,
  dealCompetitors,
  competitors,
  dealMemory,
  dealProductInterests,
  productCatalog,
  dealBlockers,
  blockerCategories,
  lossArchetypes,
  gateDefinitions,
  dealDecisions,
  dealPlaybookAssignments,
  playbooks,
  playbookSteps,
  playbookStepCompletions,
  dealSnapshots,
  pipelineTransitions,
  pipelineTargets,
  commanderAchievements,
} from "@workspace/db";
import {
  runPipelineSimulation,
  parseNLC,
  type SimDeal,
  computeFunnel,
  computeConversionMatrix,
  computeSankeyFlows,
  computeRecycleExit,
  computeCoverage,
  scoreHealthAbsolute,
  DEFAULT_HEALTH_BENCHMARKS,
  computeTransitionBreakdown,
  computePatternLethality,
  scoreLossRisk,
  calculateFlatTCV,
  type StageDef,
  type TransitionRec,
  type OpenDeal,
} from "@workspace/engine";
import {
  GetDealScoreParams,
  GetPricingBenchmarksQueryParams,
  ParseNlcCommandBody,
  GetLossRiskResponse,
  GetCompetitiveLossResponse,
  GetLossDashboardResponse,
} from "@workspace/api-zod";
import { notFound } from "../../lib/http";
import { toISO, getHealthWeights } from "../../lib/intelligence";
import { getActor } from "../../lib/auth";
import { computeDealScore, scoreDeal, rescoreActiveDeals } from "../../lib/scoring";
import { cachedIntel, computeSummary } from "../../lib/portfolio";
import { computeMemoryHealth } from "../../lib/memory-health";
import { computeCompetitorIntel, computePlaybookEffectiveness, percentiles } from "../../lib/memory-intel";
import { pickLatestPerDeal, computeScoreDelta } from "../../lib/roster-enrichment";
import { clusterProductGaps } from "../../lib/product-gaps";
import { notDeletedFilter, CLOSED_STAGES, termAwareTcv } from "../../lib/deal-filters";
import { computeVelocityRows } from "../../lib/velocity";
import { computeLossDashboardMetrics } from "../../lib/loss-dashboard";

const router: IRouter = Router();

function daysBetween(from: Date | string | null, to = new Date()): number {
  if (!from) return 0;
  return Math.max(0, Math.floor((to.getTime() - new Date(from).getTime()) / 86_400_000));
}

/* ----------------------------------------------------------- F3 Scoring */

router.get("/deals/:dealId/score", async (req: Request, res: Response) => {
  const { dealId } = GetDealScoreParams.parse(req.params);
  // Readers get an identical number; they just don't append to deal_scores.
  // A GET must not silently grow an append-only history table every time a
  // reader loads a deal page.
  const isAdmin = getActor(req).role === "admin";
  const score = isAdmin ? await scoreDeal(dealId) : await computeDealScore(dealId);
  if (!score) throw notFound("Deal not found");
  res.json({ data: { ...score, computedAt: new Date().toISOString() } });
});

router.post("/scores/recalculate", async (_req: Request, res: Response) => {
  const count = await rescoreActiveDeals();
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
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    // Closed deals never enter this comparison — a Closed-Won/Closed-Lost
    // deal can't be "overdue," and including it polluted every OPEN deal's
    // benchmark too (this table used to list Closed-Lost deals as "32 days
    // overdue").
    .where(and(notDeletedFilter, notInArray(pipelineStages.stageName, CLOSED_STAGES)));

  // computeVelocityRows (lib/velocity.ts) computes each deal's benchmark as
  // a leave-one-out median — excluding the deal itself — and returns null
  // (not a self-fulfilling "exactly at benchmark") when it's the only open
  // deal in its stage.
  const rows = computeVelocityRows(
    deals.map((d) => ({ id: d.id, stageName: d.stageName, daysInStage: daysBetween(d.stageEnteredAt) })),
  );
  const byId = new Map(deals.map((d) => [d.id, d]));

  const out = rows.map((r) => {
    const d = byId.get(r.id)!;
    return {
      id: r.id,
      dealName: d.dealName,
      accountName: d.accountName,
      stage: r.stageName,
      daysInStage: r.daysInStage,
      benchmarkDays: r.benchmarkDays,
      deltaDays: r.deltaDays,
      velocity: r.velocity,
    };
  });
  // Rows with no benchmark (insufficient data) sort to the bottom — they're
  // neither overdue nor ahead, so they don't belong at either end of a
  // "most overdue first" list.
  out.sort((a, b) => (b.deltaDays ?? -Infinity) - (a.deltaDays ?? -Infinity));
  res.json({ data: { deals: out } });
});

router.get("/analytics/velocity/benchmarks", async (_req: Request, res: Response) => {
  const rows = await db
    .select({
      stageEnteredAt: enterpriseDeals.stageEnteredAt,
      stageName: pipelineStages.stageName,
      sortOrder: pipelineStages.sortOrder,
    })
    .from(enterpriseDeals)
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    // Closed stages aren't pipeline benchmarks — a "Closed-Lost median: 67d"
    // entry read as if it were a stage a deal could still be progressing
    // through.
    .where(and(notDeletedFilter, notInArray(pipelineStages.stageName, CLOSED_STAGES)));
  const byStage = new Map<string, { sortOrder: number; days: number[] }>();
  for (const r of rows) {
    const entry = byStage.get(r.stageName) ?? { sortOrder: r.sortOrder, days: [] };
    entry.days.push(daysBetween(r.stageEnteredAt));
    byStage.set(r.stageName, entry);
  }
  const pct = (xs: number[], p: number) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0;
  };
  const benchmarks = [...byStage.entries()]
    .sort((a, b) => a[1].sortOrder - b[1].sortOrder)
    .map(([stageName, { days }]) => ({
      stageName,
      p25: pct(days, 0.25),
      median: pct(days, 0.5),
      p75: pct(days, 0.75),
      p90: pct(days, 0.9),
      sampleSize: days.length,
    }));
  res.json({ data: { benchmarks } });
});

router.get("/analytics/pipeline", async (_req: Request, res: Response) => {
  const rows = await db
    .select({
      productRevenue: enterpriseDeals.productRevenue,
      servicesRevenue: enterpriseDeals.servicesRevenue,
      contractTermYears: enterpriseDeals.contractTermYears,
      pricingModel: pricingModels.modelName,
      stageName: pipelineStages.stageName,
    })
    .from(enterpriseDeals)
    .leftJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .leftJoin(pricingModels, eq(enterpriseDeals.pricingModelId, pricingModels.id))
    .where(notDeletedFilter);
  let totalTcv = 0;
  let openTcv = 0;
  let openDealCount = 0;
  const byStage = new Map<string, { count: number; tcv: number }>();
  for (const r of rows) {
    const tcv = calculateFlatTCV({
      productRevenue: Number(r.productRevenue) || 0,
      servicesRevenue: Number(r.servicesRevenue) || 0,
      contractTermYears: r.contractTermYears,
      pricingModel: r.pricingModel ?? "",
    });
    totalTcv += tcv;
    const key = r.stageName ?? "?";
    const cur = byStage.get(key) ?? { count: 0, tcv: 0 };
    cur.count++;
    cur.tcv += tcv;
    byStage.set(key, cur);
    // totalTcv/activeDeals below deliberately span EVERY stage (including
    // Closed-Won/Closed-Lost) — analytics.archive-parity.test.ts depends on
    // a Closed-Lost deal staying in this same byStage breakdown after
    // archiving. openTcv/openDealCount are additive fields for callers that
    // want the header/"active pipeline" read the header text already
    // implies — pages/analytics.tsx's header used to say "$6.6M across 16
    // active deals" while summing every closed deal in the book too.
    if (!CLOSED_STAGES.includes(key)) {
      openTcv += tcv;
      openDealCount++;
    }
  }
  res.json({
    data: {
      totalTcv,
      activeDeals: rows.length,
      openTcv,
      openDealCount,
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
  return pickLatestPerDeal(rows);
}

// Each deal's score as of `cutoff` (latest row at or before it) — the baseline
// for the roster score-trend arrow.
async function scoresAsOf(cutoff: Date): Promise<Map<string, number>> {
  const rows = await db
    .select({ dealId: dealScores.dealId, score: dealScores.score, computedAt: dealScores.computedAt })
    .from(dealScores)
    .where(lte(dealScores.computedAt, cutoff))
    .orderBy(desc(dealScores.computedAt));
  return pickLatestPerDeal(rows);
}

router.get("/analytics/simulation", async (req: Request, res: Response) => {
  const iterations = Math.min(50_000, Math.max(1000, Number(req.query.iterations) || 10000));
  // Closed deals (Won or Lost) never enter the forecast, regardless of
  // archive state — a booked/lost deal has no remaining outcome to simulate.
  // Before archiving stopped meaning "excluded from everything," archiving a
  // closed deal was the only way to remove it from this Monte Carlo run;
  // this stage filter is what replaces that escape hatch now that archived
  // deals still count elsewhere in analytics. CLOSED_STAGES imported from
  // lib/deal-filters (was locally re-declared here and twice more below).
  const deals = await db
    .select({
      id: enterpriseDeals.id,
      productRevenue: enterpriseDeals.productRevenue,
      servicesRevenue: enterpriseDeals.servicesRevenue,
      contractTermYears: enterpriseDeals.contractTermYears,
      pricingModel: pricingModels.modelName,
      winProbabilityPct: enterpriseDeals.winProbabilityPct,
    })
    .from(enterpriseDeals)
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .leftJoin(pricingModels, eq(enterpriseDeals.pricingModelId, pricingModels.id))
    .where(and(notDeletedFilter, notInArray(pipelineStages.stageName, CLOSED_STAGES)));
  const scores = await latestScores();
  const sim: SimDeal[] = deals.map((d) => ({
    calculatedTCV: calculateFlatTCV({
      productRevenue: Number(d.productRevenue) || 0,
      servicesRevenue: Number(d.servicesRevenue) || 0,
      contractTermYears: d.contractTermYears,
      pricingModel: d.pricingModel ?? "",
    }),
    predictiveScore: scores.get(d.id) ?? null,
    winProbabilityPct: d.winProbabilityPct ?? null,
  }));
  // The engine's own `weightedPipeline` (in runPipelineSimulation's result)
  // is Σ tcv × dealProbability, where dealProbability blends in the AI
  // predictive score (falling back to winProbabilityPct, then a 30%
  // default) — it's the simulation's own mean, not an independent
  // cross-check of it. traditionalWeightedPipeline is the actual
  // stage-weighted figure ("weighted pipeline" as sales teams usually mean
  // it): Σ tcv × winProbabilityPct, deals without a manually-set win
  // probability excluded rather than defaulted — same convention as
  // computeCoverage's "weighted" ratio (lib/engine/src/flow.ts) and
  // exports.ts's weightedTcv.
  const withWinProb = deals.filter((d) => d.winProbabilityPct != null);
  const traditionalWeightedPipeline = withWinProb.reduce((s, d) => {
    const tcv = (Number(d.productRevenue) || 0) + (Number(d.servicesRevenue) || 0);
    return s + tcv * (Number(d.winProbabilityPct) / 100);
  }, 0);
  res.json({
    data: {
      ...runPipelineSimulation(sim, iterations),
      traditionalWeightedPipeline: Math.round(traditionalWeightedPipeline),
      dealsWithoutWinProbability: deals.length - withWinProb.length,
    },
  });
});

/* ----------------------------------------------------------- F2 Competitive analytics */

// A competitor with only 1-2 resolved encounters can't support a definitive
// win-rate percentage — "1 encounter, 1 loss" reading as a stark "0%" is
// noise, not signal. Mirrors /analytics/memory-insights's MIN_SAMPLE floor.
const MIN_COMPETITIVE_SAMPLE = 3;

router.get("/analytics/competitive", async (_req: Request, res: Response) => {
  const rows = await db
    .select({ name: competitors.name, status: dealCompetitors.status })
    .from(dealCompetitors)
    .innerJoin(enterpriseDeals, eq(dealCompetitors.dealId, enterpriseDeals.id))
    .leftJoin(competitors, eq(dealCompetitors.competitorId, competitors.id))
    .where(notDeletedFilter);
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
      winRatePct:
        v.wins + v.losses >= MIN_COMPETITIVE_SAMPLE ? Math.round((v.wins / (v.wins + v.losses)) * 100) : null,
    }))
    .sort((a, b) => b.encounters - a.encounters);
  res.json({ data: { competitors: competitorsOut } });
});

/* ----------------------------------------------------------- F5 Win/Loss analytics */

router.get("/analytics/win-loss", async (_req: Request, res: Response) => {
  const rows = await db
    .select({ outcome: dealMemory.outcome, finalTcv: dealMemory.finalTcv })
    .from(dealMemory)
    .innerJoin(enterpriseDeals, eq(dealMemory.dealId, enterpriseDeals.id))
    .where(notDeletedFilter);
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

/* ------------------------------------------- Dashboard: Gate Completion Funnel */

// Completion percentage per gate across all active deals. Reveals systemic
// technical bottlenecks (e.g. "only 50% of deals have cleared Gate 3").
router.get("/analytics/gates", async (_req: Request, res: Response) => {
  const defs = await db
    .select({
      gateCode: gateDefinitions.gateCode,
      label: gateDefinitions.label,
      gateGroup: gateDefinitions.gateGroup,
      sortOrder: gateDefinitions.sortOrder,
    })
    .from(gateDefinitions)
    .where(eq(gateDefinitions.isActive, true))
    .orderBy(asc(gateDefinitions.sortOrder));

  const gateRows = await db
    .select({
      gateCode: dealTechnicalGates.gateCode,
      isCompleted: dealTechnicalGates.isCompleted,
    })
    .from(dealTechnicalGates)
    .innerJoin(enterpriseDeals, eq(dealTechnicalGates.dealId, enterpriseDeals.id))
    .where(notDeletedFilter);

  const agg = new Map<string, { completed: number; total: number }>();
  for (const r of gateRows) {
    const cur = agg.get(r.gateCode) ?? { completed: 0, total: 0 };
    cur.total++;
    if (r.isCompleted) cur.completed++;
    agg.set(r.gateCode, cur);
  }

  const gates = defs.map((d) => {
    const a = agg.get(d.gateCode) ?? { completed: 0, total: 0 };
    return {
      gateCode: d.gateCode,
      label: d.label,
      gateGroup: d.gateGroup,
      completedCount: a.completed,
      totalCount: a.total,
      pct: a.total ? Math.round((a.completed / a.total) * 100) : 0,
    };
  });

  const withDeals = gates.filter((g) => g.totalCount > 0);
  const bottleneck = withDeals.length
    ? withDeals.reduce((min, g) => (g.pct < min.pct ? g : min))
    : null;

  res.json({ data: { gates, bottleneck } });
});

/* ------------------------------------------------- Dashboard: Next Actions */

interface ActionItem {
  id: string;
  dealId: string;
  dealName: string;
  accountName: string;
  action: string;
  owner: string;
  dueDate: string;
}

// The Commander's 48-hour priority queue: overdue + due-soon decisions, the
// next open playbook step per active assignment, and imminent close dates.
router.get("/analytics/next-actions", async (_req: Request, res: Response) => {
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86_400_000);
  const in30 = new Date(now.getTime() + 30 * 86_400_000);

  // next-actions is a reminder surface, so closed deals (Won or Lost) are
  // excluded — which also excludes archived deals for free, since archiving
  // requires a closed stage (enforced on /deals/:id/archive and on later
  // stage edits — see routes/deals.ts). CLOSED_STAGES imported from
  // lib/deal-filters.

  const decisions = await db
    .select({
      id: dealDecisions.id,
      dealId: dealDecisions.dealId,
      dealName: enterpriseDeals.dealName,
      accountName: enterpriseDeals.accountName,
      action: dealDecisions.decisionText,
      owner: dealDecisions.owner,
      dueDate: dealDecisions.dueDate,
    })
    .from(dealDecisions)
    .innerJoin(enterpriseDeals, eq(dealDecisions.dealId, enterpriseDeals.id))
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(
      and(
        notDeletedFilter,
        eq(dealDecisions.status, "Pending"),
        notInArray(pipelineStages.stageName, CLOSED_STAGES),
      ),
    );

  const overdue: ActionItem[] = [];
  const dueThisWeek: ActionItem[] = [];
  for (const d of decisions) {
    if (!d.dueDate) continue;
    const due = new Date(d.dueDate);
    const item: ActionItem = {
      id: d.id,
      dealId: d.dealId,
      dealName: d.dealName,
      accountName: d.accountName,
      action: d.action,
      owner: d.owner,
      dueDate: d.dueDate,
    };
    if (due < now) overdue.push(item);
    else if (due <= in7) dueThisWeek.push(item);
  }
  const byDue = (a: ActionItem, b: ActionItem) =>
    new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  overdue.sort(byDue);
  dueThisWeek.sort(byDue);

  // Next open playbook step per active assignment. A deal can now legitimately
  // hold 2+ concurrent assignments (one per stage it has touched on its
  // journey), so each row carries the playbook name to stay disambiguated.
  const assignments = await db
    .select({
      assignmentId: dealPlaybookAssignments.id,
      dealId: dealPlaybookAssignments.dealId,
      dealName: enterpriseDeals.dealName,
      playbookId: dealPlaybookAssignments.playbookId,
      playbookName: playbooks.playbookName,
    })
    .from(dealPlaybookAssignments)
    .innerJoin(enterpriseDeals, eq(dealPlaybookAssignments.dealId, enterpriseDeals.id))
    .innerJoin(playbooks, eq(dealPlaybookAssignments.playbookId, playbooks.id))
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(
      and(
        notDeletedFilter,
        eq(dealPlaybookAssignments.status, "Active"),
        notInArray(pipelineStages.stageName, CLOSED_STAGES),
      ),
    );

  const playbookStepsOut: {
    dealId: string;
    dealName: string;
    playbookName: string;
    action: string;
    stepOrder: number;
    totalSteps: number;
  }[] = [];
  for (const a of assignments) {
    const steps = await db
      .select({ id: playbookSteps.id, stepName: playbookSteps.stepName, stepOrder: playbookSteps.stepOrder })
      .from(playbookSteps)
      .where(eq(playbookSteps.playbookId, a.playbookId))
      .orderBy(asc(playbookSteps.stepOrder));
    const completions = await db
      .select({
        stepId: playbookStepCompletions.stepId,
        status: playbookStepCompletions.status,
      })
      .from(playbookStepCompletions)
      .where(eq(playbookStepCompletions.assignmentId, a.assignmentId));
    // Completed/skipped are terminal; a blocked step still needs attention, so it
    // surfaces as the next open action.
    const doneIds = new Set(
      completions
        .filter((c) => c.status === "completed" || c.status === "skipped")
        .map((c) => c.stepId),
    );
    const next = steps.find((s) => !doneIds.has(s.id));
    if (next) {
      playbookStepsOut.push({
        dealId: a.dealId,
        dealName: a.dealName,
        playbookName: a.playbookName,
        action: next.stepName,
        stepOrder: next.stepOrder,
        totalSteps: steps.length,
      });
    }
  }

  // Imminent close dates: deals still OPEN (i.e. not Closed-Won/Closed-Lost)
  // within 30 days. "Open" here is distinct from "active" (= just not-deleted
  // elsewhere in this file, per notDeletedFilter above) — a closed deal has
  // no meaningful close date left to remind anyone about.
  const closeRows = await db
    .select({
      id: enterpriseDeals.id,
      dealName: enterpriseDeals.dealName,
      accountName: enterpriseDeals.accountName,
      expectedCloseDate: enterpriseDeals.expectedCloseDate,
    })
    .from(enterpriseDeals)
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(and(notDeletedFilter, notInArray(pipelineStages.stageName, CLOSED_STAGES)));
  const upcomingCloses = closeRows
    .filter((d) => {
      if (!d.expectedCloseDate) return false;
      const c = new Date(d.expectedCloseDate);
      return c >= now && c <= in30;
    })
    .map((d) => ({
      id: d.id,
      dealName: d.dealName,
      accountName: d.accountName,
      expectedCloseDate: d.expectedCloseDate,
      daysToClose: Math.round((new Date(d.expectedCloseDate!).getTime() - now.getTime()) / 86_400_000),
    }))
    .sort((a, b) => a.daysToClose - b.daysToClose);

  res.json({
    data: {
      overdue,
      dueThisWeek,
      playbookSteps: playbookStepsOut,
      upcomingCloses,
      pendingCount:
        overdue.length + dueThisWeek.length + playbookStepsOut.length + upcomingCloses.length,
    },
  });
});

/* --------------------------------------------- Dashboard: Vital Signs + deltas */

// Weighted pipeline (TCV × close probability) plus a ~7-day-ago baseline drawn
// from per-deal snapshots, so the dashboard can render week-over-week deltas.
// Baseline is null when no snapshot history exists (deltas then hide).
router.get("/analytics/vital-signs", async (_req: Request, res: Response) => {
  const deals = await db
    .select({
      id: enterpriseDeals.id,
      productRevenue: enterpriseDeals.productRevenue,
      servicesRevenue: enterpriseDeals.servicesRevenue,
      contractTermYears: enterpriseDeals.contractTermYears,
      pricingModel: pricingModels.modelName,
      winProbabilityPct: enterpriseDeals.winProbabilityPct,
    })
    .from(enterpriseDeals)
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .leftJoin(pricingModels, eq(enterpriseDeals.pricingModelId, pricingModels.id))
    .where(and(notDeletedFilter, notInArray(pipelineStages.stageName, CLOSED_STAGES)));
  const openIds = new Set(deals.map((d) => d.id));
  const scores = await latestScores();

  let totalTCV = 0;
  let weightedPipeline = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  for (const d of deals) {
    const tcv = calculateFlatTCV({
      productRevenue: Number(d.productRevenue) || 0,
      servicesRevenue: Number(d.servicesRevenue) || 0,
      contractTermYears: d.contractTermYears,
      pricingModel: d.pricingModel ?? "",
    });
    totalTCV += tcv;
    const pct = scores.get(d.id) ?? d.winProbabilityPct ?? 30;
    weightedPipeline += tcv * Math.max(0, Math.min(1, pct / 100));
    const s = scores.get(d.id);
    if (s != null) {
      scoreSum += s;
      scoreCount++;
    }
  }
  const avgScore = scoreCount ? Math.round(scoreSum / scoreCount) : null;

  const cutoff = new Date(Date.now() - 7 * 86_400_000);
  const snaps = await db
    .select({
      dealId: dealSnapshots.dealId,
      healthStatus: dealSnapshots.healthStatus,
      calculatedTcv: dealSnapshots.calculatedTcv,
      snapshotAt: dealSnapshots.snapshotAt,
    })
    .from(dealSnapshots)
    .where(lte(dealSnapshots.snapshotAt, cutoff))
    .orderBy(desc(dealSnapshots.snapshotAt));
  const latestPerDeal = new Map<string, { health: string | null; tcv: number }>();
  for (const s of snaps) {
    // Deliberately "currently open, applied retroactively" rather than true
    // point-in-time stage history (which dealSnapshots.salesStage would
    // support) — keeping both sides of the delta over the same population
    // means the week-over-week numbers reflect change within the open
    // cohort, not deals entering or leaving it.
    if (!openIds.has(s.dealId)) continue;
    if (!latestPerDeal.has(s.dealId)) {
      latestPerDeal.set(s.dealId, { health: s.healthStatus, tcv: Number(s.calculatedTcv) || 0 });
    }
  }
  let baseline: { totalTCV: number; activeDeals: number; redAlerts: number } | null = null;
  if (latestPerDeal.size > 0) {
    let bTcv = 0;
    let bRed = 0;
    for (const v of latestPerDeal.values()) {
      bTcv += v.tcv;
      if (v.health === "RED") bRed++;
    }
    baseline = { totalTCV: bTcv, activeDeals: latestPerDeal.size, redAlerts: bRed };
  }

  res.json({
    data: {
      totalTCV,
      weightedPipeline: Math.round(weightedPipeline),
      activeDeals: deals.length,
      avgScore,
      baseline,
    },
  });
});

/* ----------------------------------------------- Dashboard: Roster enrichment */

// Per-deal score / gate-progress / velocity, keyed by id. Health, TCV, stage and
// close date come from /v1/deals (engine-computed health); the dashboard roster
// merges this enrichment onto that list by id.
router.get("/analytics/roster", async (_req: Request, res: Response) => {
  const deals = await db
    .select({
      id: enterpriseDeals.id,
      dealName: enterpriseDeals.dealName,
      stageEnteredAt: enterpriseDeals.stageEnteredAt,
      stageName: pipelineStages.stageName,
    })
    .from(enterpriseDeals)
    .leftJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(notDeletedFilter);

  const scores = await latestScores();
  // Score trend: baseline = each deal's score as of 7 days ago (null delta when
  // there's no prior score to compare against).
  const baselineScores = await scoresAsOf(new Date(Date.now() - 7 * 86_400_000));

  // Last-activity age: newest activity-log entry per deal, excluding the
  // auto-generated health.changed churn so the metric reflects real work.
  const activityRows = await db
    .select({ dealId: dealActivityLog.dealId, last: max(dealActivityLog.occurredAt) })
    .from(dealActivityLog)
    .where(ne(dealActivityLog.eventType, "health.changed"))
    .groupBy(dealActivityLog.dealId);
  const lastActivityByDeal = new Map(activityRows.map((r) => [r.dealId, r.last]));

  const gateRows = await db
    .select({ dealId: dealTechnicalGates.dealId, isCompleted: dealTechnicalGates.isCompleted })
    .from(dealTechnicalGates)
    .innerJoin(enterpriseDeals, eq(dealTechnicalGates.dealId, enterpriseDeals.id))
    .where(notDeletedFilter);
  const gateAgg = new Map<string, { c: number; t: number }>();
  for (const g of gateRows) {
    const cur = gateAgg.get(g.dealId) ?? { c: 0, t: 0 };
    cur.t++;
    if (g.isCompleted) cur.c++;
    gateAgg.set(g.dealId, cur);
  }

  // Benchmark = median days-in-stage across active deals in the same stage
  // (matches the /analytics/velocity handler).
  const byStage = new Map<string, number[]>();
  for (const d of deals) {
    const k = d.stageName ?? "?";
    const arr = byStage.get(k) ?? [];
    arr.push(daysBetween(d.stageEnteredAt));
    byStage.set(k, arr);
  }
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };

  // Fetch per-deal risk from the cached intelligence tier (intel: prefix,
  // 30 s TTL, event-bus-invalidated on mutation). cachedIntel() wraps
  // assembleDealIntelligence() in cache.wrap(CacheKeys.intelligence(dealId),
  // CacheTtl.intelligence, ...) so this is the same cached path used by the
  // portfolio summary and the single-deal intelligence route — not an uncached
  // O(N) loop.
  const intelResults = await Promise.all(deals.map((d) => cachedIntel(d.id)));
  const riskByDeal = new Map(
    deals.map((d, i) => {
      const intel = intelResults[i];
      return [
        d.id,
        {
          riskScore: intel?.risk?.compositeScore ?? null,
          riskLevel: intel?.risk?.riskLevel ?? null,
        },
      ];
    }),
  );

  const rows = deals.map((d) => {
    const g = gateAgg.get(d.id) ?? { c: 0, t: 0 };
    const days = daysBetween(d.stageEnteredAt);
    const bench = median(byStage.get(d.stageName ?? "?") ?? [days]);
    const risk = riskByDeal.get(d.id);
    const scoreNow = scores.get(d.id) ?? null;
    const lastActivity = lastActivityByDeal.get(d.id);
    return {
      id: d.id,
      dealName: d.dealName,
      score: scoreNow,
      scoreDelta: computeScoreDelta(scoreNow, baselineScores.get(d.id) ?? null),
      gatesPct: g.t ? Math.round((g.c / g.t) * 100) : 0,
      daysInStage: days,
      daysSinceLastActivity: lastActivity ? daysBetween(lastActivity) : null,
      benchmarkDays: bench,
      deltaDays: days - bench,
      velocityStatus: days > bench * 1.5 ? "SLOW" : days < bench * 0.5 ? "FAST" : "NORMAL",
      riskScore: risk?.riskScore ?? null,
      riskLevel: risk?.riskLevel ?? null,
    };
  });

  res.json({ data: { deals: rows } });
});

/* ------------------------------------------------- Product-gap register */

// Cluster the free-text product gaps captured in loss autopsies across Lost
// deals, augmented by unresolved Technical blockers, into a "what to build/fix"
// register with TCV-at-risk. Computed on read — no new tables.
router.get("/analytics/product-gaps", async (_req: Request, res: Response) => {
  // Joined to enterpriseDeals (never hard-deleted, so innerJoin is safe) for
  // termAwareTcv — deal_memory.finalTcv was a flat sum, which disagreed with
  // Archetypes/Competitive for a multi-year deal. notDeletedFilter excludes a
  // soft-deleted deal's archived gaps from the TCV-at-risk math, same as
  // every other Autopsy tab.
  const lostMemories = await db
    .select({
      dealId: dealMemory.dealId,
      dealName: dealMemory.dealName,
      productGaps: dealMemory.productGaps,
      productRevenue: enterpriseDeals.productRevenue,
      servicesRevenue: enterpriseDeals.servicesRevenue,
      contractTermYears: enterpriseDeals.contractTermYears,
      pricingModel: pricingModels.modelName,
    })
    .from(dealMemory)
    .innerJoin(enterpriseDeals, eq(dealMemory.dealId, enterpriseDeals.id))
    .leftJoin(pricingModels, eq(enterpriseDeals.pricingModelId, pricingModels.id))
    .where(and(eq(dealMemory.outcome, "Lost"), notDeletedFilter));

  const techBlockers = await db
    .select({
      dealId: dealBlockers.dealId,
      dealName: enterpriseDeals.dealName,
      description: dealBlockers.description,
      productRevenue: enterpriseDeals.productRevenue,
      servicesRevenue: enterpriseDeals.servicesRevenue,
      contractTermYears: enterpriseDeals.contractTermYears,
      pricingModel: pricingModels.modelName,
    })
    .from(dealBlockers)
    .innerJoin(enterpriseDeals, eq(dealBlockers.dealId, enterpriseDeals.id))
    .innerJoin(blockerCategories, eq(dealBlockers.categoryId, blockerCategories.id))
    .leftJoin(pricingModels, eq(enterpriseDeals.pricingModelId, pricingModels.id))
    .where(and(eq(dealBlockers.isResolved, false), eq(blockerCategories.categoryName, "Technical"), notDeletedFilter));

  const catalog = await db
    .select({ id: productCatalog.id, productName: productCatalog.productName, code: productCatalog.code })
    .from(productCatalog);

  const clusters = clusterProductGaps(
    lostMemories.map((m) => ({
      dealId: m.dealId,
      dealName: m.dealName,
      finalTcv: termAwareTcv(m),
      productGaps: (m.productGaps as string[] | null) ?? [],
    })),
    techBlockers.map((b) => ({
      dealId: b.dealId,
      dealName: b.dealName,
      description: b.description,
      tcv: termAwareTcv(b),
    })),
    catalog,
  );

  res.json({ data: { clusters } });
});

/* ------------------------------------------ Dashboard: Deal Memory Insights */

// Deterministic (no-LLM) pattern matching of archived deals against the current
// pipeline. Each rule emits an insight only when its sample size is sufficient.
router.get("/analytics/memory-insights", async (_req: Request, res: Response) => {
  const MIN_SAMPLE = 3;
  const memory = await db.select().from(dealMemory);
  const archivedCount = memory.length;

  const active = await db
    .select({
      id: enterpriseDeals.id,
      dealName: enterpriseDeals.dealName,
      productRevenue: enterpriseDeals.productRevenue,
      servicesRevenue: enterpriseDeals.servicesRevenue,
      contractTermYears: enterpriseDeals.contractTermYears,
      pricingModel: pricingModels.modelName,
      competitorName: competitors.name,
    })
    .from(enterpriseDeals)
    .leftJoin(competitors, eq(enterpriseDeals.competitorId, competitors.id))
    .leftJoin(pricingModels, eq(enterpriseDeals.pricingModelId, pricingModels.id))
    .where(notDeletedFilter);
  const tcvOf = (d: {
    productRevenue: unknown;
    servicesRevenue: unknown;
    contractTermYears: number;
    pricingModel: string | null;
  }) =>
    calculateFlatTCV({
      productRevenue: Number(d.productRevenue) || 0,
      servicesRevenue: Number(d.servicesRevenue) || 0,
      contractTermYears: d.contractTermYears,
      pricingModel: d.pricingModel ?? "",
    });

  interface Insight {
    text: string;
    matchedDeals: { id: string; dealName: string }[];
  }
  const insights: Insight[] = [];
  const winRate = (arr: typeof memory) => {
    const decided = arr.filter((m) => m.outcome === "Won" || m.outcome === "Lost");
    if (decided.length === 0) return null;
    return Math.round((decided.filter((m) => m.outcome === "Won").length / decided.length) * 100);
  };

  if (archivedCount >= MIN_SAMPLE) {
    // Rule A — services attach correlation.
    const hasSvc = (t: string | null) => !!t && t !== "None";
    const withSvc = memory.filter((m) => hasSvc(m.servicesTier));
    const noSvc = memory.filter((m) => !hasSvc(m.servicesTier));
    const wrWith = winRate(withSvc);
    const wrNo = winRate(noSvc);
    if (wrWith != null && wrNo != null && withSvc.length >= 2 && noSvc.length >= 2 && wrWith > wrNo) {
      const matched = active
        .filter((d) => tcvOf(d) >= 500_000 && (Number(d.servicesRevenue) || 0) === 0)
        .map((d) => ({ id: d.id, dealName: d.dealName }));
      insights.push({
        text: `Archived deals with a services attachment closed ${wrWith}% of the time vs ${wrNo}% without. Deals above $500K with no services carry the higher-risk profile.`,
        matchedDeals: matched,
      });
    }

    // Rule B — win rate by TCV band (flag the weakest band).
    const ranges = [
      { label: "< $500K", min: 0, max: 500_000 },
      { label: "$500K–$1M", min: 500_000, max: 1_000_000 },
      { label: "$1M–$2M", min: 1_000_000, max: 2_000_000 },
      { label: "> $2M", min: 2_000_000, max: Infinity },
    ];
    const bands = ranges
      .map((rg) => {
        const inRange = memory.filter((m) => {
          const t = Number(m.finalTcv) || 0;
          return t >= rg.min && t < rg.max;
        });
        return { ...rg, count: inRange.length, wr: winRate(inRange) };
      })
      .filter((b) => b.count >= MIN_SAMPLE && b.wr != null);
    if (bands.length > 0) {
      const weakest = bands.reduce((lo, b) => ((b.wr as number) < (lo.wr as number) ? b : lo));
      const matched = active
        .filter((d) => tcvOf(d) >= weakest.min && tcvOf(d) < weakest.max)
        .map((d) => ({ id: d.id, dealName: d.dealName }));
      if (matched.length > 0) {
        insights.push({
          text: `Historically, deals in the ${weakest.label} band closed only ${weakest.wr}% of the time (${weakest.count} archived). You have ${matched.length} active deal${matched.length === 1 ? "" : "s"} in this band.`,
          matchedDeals: matched,
        });
      }
    }

    // Rule C — competitor loss pattern.
    const lossByCompetitor = new Map<string, { losses: number; total: number }>();
    for (const m of memory) {
      for (const c of m.competitorsFaced ?? []) {
        const cur = lossByCompetitor.get(c) ?? { losses: 0, total: 0 };
        cur.total++;
        if (m.outcome === "Lost") cur.losses++;
        lossByCompetitor.set(c, cur);
      }
    }
    let worst: { name: string; lossRate: number; total: number } | null = null;
    for (const [name, v] of lossByCompetitor.entries()) {
      if (v.total < MIN_SAMPLE) continue;
      const lossRate = Math.round((v.losses / v.total) * 100);
      if (!worst || lossRate > worst.lossRate) worst = { name, lossRate, total: v.total };
    }
    if (worst && worst.lossRate > 0) {
      const matched = active
        .filter((d) => d.competitorName === worst!.name)
        .map((d) => ({ id: d.id, dealName: d.dealName }));
      if (matched.length > 0) {
        insights.push({
          text: `Against ${worst.name}, the historical loss rate is ${worst.lossRate}% (${worst.total} archived encounters). ${matched.length} active deal${matched.length === 1 ? " faces" : "s face"} ${worst.name} now.`,
          matchedDeals: matched,
        });
      }
    }
  }

  res.json({ data: { insights, archivedCount } });
});

router.get("/analytics/memory-health", async (_req: Request, res: Response) => {
  const rows = await db.select().from(dealMemory);
  res.json({ data: computeMemoryHealth(rows) });
});

/* ------------------------------------------ Dashboard: Engagement (Achievements) */

interface AchievementDef {
  code: string;
  name: string;
  description: string;
}

// Rescaled to this app's actual data volume (~12-14 deals) rather than the
// PRD's literal examples (100 closes, 25-deal veteran) — see the design spec
// for why. Permanence comes from the commander_achievements table, not from
// these live metrics being monotonic: dealPlaybookAssignments.status CAN
// revert on a reopened step, but once earned, an achievement stays earned.
const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { code: "first_close", name: "First Deal Closed", description: "Every journey starts with a single close." },
  { code: "playbooks_3", name: "3 Playbooks Completed", description: "Process is what separates good from great." },
  { code: "giant_slayer", name: "Giant Slayer", description: "You don't just close deals — you win them." },
  { code: "clean_pipeline", name: "Clean Pipeline", description: "Zero stalled deals, zero red alerts. Enjoy the calm." },
];

async function evaluateAchievements(): Promise<Record<string, boolean>> {
  // Only true deletions are excluded here (same predicate as the file's
  // `notDeletedFilter`, inlined for locality) — a Closed-Won deal is
  // typically archived shortly after closing (post-mortem subscriber), so
  // excluding archived deals would undercount "ever closed."
  const [closedWonRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(enterpriseDeals)
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(and(eq(pipelineStages.stageName, "Closed-Won"), isNull(enterpriseDeals.deletedAt)));

  const [playbooksRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(dealPlaybookAssignments)
    .where(eq(dealPlaybookAssignments.status, "Completed"));

  const wonAgainst = await db
    .select({ competitorId: dealCompetitors.competitorId })
    .from(dealCompetitors)
    .where(eq(dealCompetitors.status, "Won Against"));
  const distinctCompetitorsBeaten = new Set(wonAgainst.map((r) => r.competitorId)).size;

  const summary = await computeSummary();

  return {
    first_close: Number(closedWonRow.count) >= 1,
    playbooks_3: Number(playbooksRow.count) >= 3,
    giant_slayer: distinctCompetitorsBeaten >= 2,
    clean_pipeline: summary.staleDeals.length === 0 && summary.dealsByHealth.RED === 0,
  };
}

router.get("/analytics/engagement", async (req: Request, res: Response) => {
  const since = typeof req.query.since === "string" ? req.query.since : undefined;

  const trueNow = await evaluateAchievements();
  const existingRows = await db.select().from(commanderAchievements);
  const existingCodes = new Set(existingRows.map((r) => r.achievementCode));
  // First-ever evaluation (empty table): silently backfill whatever's
  // already true rather than reporting it as "newly earned" — the live dev
  // DB already has real history predating this feature, and toasting 2-3
  // "achievement unlocked" celebrations on the first load after deploy
  // would misrepresent things that actually happened weeks ago.
  const isFirstEverEvaluation = existingRows.length === 0;

  // commander_achievements has no per-commander column at all (its PK is
  // achievement_code alone) — the ledger is app-global, not per-user. A
  // reader's page load must not be able to mint a row here: that would be a
  // reader silently earning the owner's achievement. Readers still see the
  // full achievement list below (locked/earned as of the last admin
  // evaluation) — only the write is gated.
  if (getActor(req).role === "admin") {
    for (const def of ACHIEVEMENT_DEFS) {
      if (trueNow[def.code] && !existingCodes.has(def.code)) {
        await db.insert(commanderAchievements).values({ achievementCode: def.code }).onConflictDoNothing();
      }
    }
  }

  const finalRows = await db.select().from(commanderAchievements);
  const earnedMap = new Map(finalRows.map((r) => [r.achievementCode, r.earnedAt]));
  const achievements = ACHIEVEMENT_DEFS.map((def) => ({
    code: def.code,
    name: def.name,
    description: def.description,
    earnedAt: earnedMap.get(def.code)?.toISOString() ?? null,
    locked: !earnedMap.has(def.code),
  }));

  // Derived from earnedAt vs `since`, NOT "inserted during this exact call".
  // This route is hit by two independent callers (AchievementsSettings with no
  // `since`, CelebrationWatcher with `since: previousVisitAt`) that share the
  // same unconditional upsert above. If "newly earned" meant "this call did
  // the insert," whichever caller happened to hit the server first after a
  // criterion became true would silently claim it — and a later caller would
  // just see the code already in `existingCodes` and never report it, even
  // though it genuinely became earned within its own `since` window. Comparing
  // timestamps instead makes the answer caller-order-independent: every caller
  // that passes `since` gets a consistent, timestamp-derived result.
  // isFirstEverEvaluation still silences the very first evaluation (empty
  // table) so backfilled pre-existing history is never reported as "new",
  // even if a caller's `since` happens to be old.
  const sinceDate = !isFirstEverEvaluation && since ? new Date(since) : null;
  const newlyEarnedCodes =
    sinceDate && !Number.isNaN(sinceDate.getTime())
      ? finalRows.filter((r) => r.earnedAt.getTime() > sinceDate.getTime()).map((r) => r.achievementCode)
      : [];

  let dealsClosedWonSince: { dealId: string; dealName: string }[] = [];
  if (since) {
    const rows = await db
      .select({ id: enterpriseDeals.id, dealName: enterpriseDeals.dealName })
      .from(enterpriseDeals)
      .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
      .where(
        and(
          eq(pipelineStages.stageName, "Closed-Won"),
          isNull(enterpriseDeals.deletedAt),
          gte(enterpriseDeals.stageEnteredAt, new Date(since)),
        ),
      );
    dealsClosedWonSince = rows.map((d) => ({ dealId: d.id, dealName: d.dealName }));
  }

  res.json({ data: { achievements, newlyEarnedCodes, dealsClosedWonSince } });
});

/* ------------------------------------- Competitive & Pricing Intelligence */

router.get("/analytics/competitor-intel", async (_req: Request, res: Response) => {
  const rows = await db.select().from(dealMemory);
  res.json({ data: computeCompetitorIntel(rows) });
});

router.get("/analytics/pricing-benchmarks", async (req: Request, res: Response) => {
  const q = GetPricingBenchmarksQueryParams.parse(req.query);
  const conditions = [];
  if (q.pricingModel) conditions.push(eq(dealMemory.pricingModel, q.pricingModel));
  if (q.servicesTier) conditions.push(eq(dealMemory.servicesTier, q.servicesTier));
  if (q.outcome) conditions.push(eq(dealMemory.outcome, q.outcome));
  const rows = conditions.length
    ? await db.select().from(dealMemory).where(and(...conditions))
    : await db.select().from(dealMemory);

  const tcvs = rows.map((r) => Number(r.finalTcv) || 0).filter((n) => n > 0);
  const cycles = rows.map((r) => r.totalDaysActive ?? 0).filter((n) => n > 0);

  res.json({
    data: {
      sampleSize: rows.length,
      // Separate from sampleSize: rows with a null/zero TCV or cycle time are
      // excluded from their respective percentiles, so the two counts can be
      // smaller than the matched-row total. Surfacing both keeps a full sample
      // of empty values from looking like a healthy "$0 across N deals".
      tcvSampleSize: tcvs.length,
      cycleSampleSize: cycles.length,
      tcv: percentiles(tcvs),
      cycleDays: percentiles(cycles),
    },
  });
});

router.get("/analytics/playbook-effectiveness", async (_req: Request, res: Response) => {
  const memory = await db.select({ dealId: dealMemory.dealId, outcome: dealMemory.outcome }).from(dealMemory);
  const assignments = await db.select({ dealId: dealPlaybookAssignments.dealId }).from(dealPlaybookAssignments);
  const assignedIds = new Set(assignments.map((a) => a.dealId));
  res.json({ data: computePlaybookEffectiveness(memory, assignedIds) });
});

/* ------------------------------------------ Closed-Lost Autopsy: Early Warning */

// Cross-references each ACTIVE deal's currently-firing pattern codes against
// how often those same patterns fired on deals that were ultimately
// Closed-Lost (lib/engine/src/loss-risk.ts). This is a small enrichment on top
// of the same cachedIntel() tier the roster/summary already use — it
// complements the Risk Engine v2 composite score, not a competing model.
router.get("/analytics/loss-risk", async (_req: Request, res: Response) => {
  const lostDeals = await db
    .select({ id: enterpriseDeals.id })
    .from(enterpriseDeals)
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(and(notDeletedFilter, eq(pipelineStages.stageName, "Closed-Lost")));

  const lostIntel = await Promise.all(lostDeals.map((d) => cachedIntel(d.id)));
  const lostAlertCodes = lostIntel
    .filter((i): i is NonNullable<typeof i> => i != null)
    .map((i) => [...i.governance.alerts, ...i.governance.managedAlerts].map((a) => a.code));
  const lethality = computePatternLethality(lostAlertCodes);

  const activeDeals = await db
    .select({
      id: enterpriseDeals.id,
      dealName: enterpriseDeals.dealName,
      accountName: enterpriseDeals.accountName,
    })
    .from(enterpriseDeals)
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(and(notDeletedFilter, notInArray(pipelineStages.stageName, CLOSED_STAGES)));

  const activeIntel = await Promise.all(activeDeals.map((d) => cachedIntel(d.id)));
  const deals = activeDeals
    .map((d, i) => {
      const intel = activeIntel[i];
      if (!intel) return null;
      const codes = [...intel.governance.alerts, ...intel.governance.managedAlerts].map((a) => a.code);
      const { score, matchedPatterns } = scoreLossRisk(codes, lethality);
      return { dealId: d.id, dealName: d.dealName, accountName: d.accountName, score, matchedPatterns };
    })
    .filter((r): r is NonNullable<typeof r> => r != null && r.score > 0)
    .sort((a, b) => b.score - a.score);

  res.json(GetLossRiskResponse.parse({ data: { deals, lostDealCount: lostDeals.length } }));
});

/* ------------------------------------------- Closed-Lost Autopsy: Competitive */

// Aggregates the EXISTING per-deal deal_competitors tracking (captured today
// via the Competitive tab on the deal cockpit — components/cockpit/v2/
// competitive-panel.tsx) into a portfolio-wide view: which competitors we
// lose to most, and a sparse product-suite x competitor win/loss matrix. No
// new capture UI needed — deal_competitors already holds this data.
router.get("/analytics/competitive-loss", async (_req: Request, res: Response) => {
  const rows = await db
    .select({
      dealId: dealCompetitors.dealId,
      competitorId: dealCompetitors.competitorId,
      competitorName: competitors.name,
      status: dealCompetitors.status,
      salesStage: pipelineStages.stageName,
      productRevenue: enterpriseDeals.productRevenue,
      servicesRevenue: enterpriseDeals.servicesRevenue,
      contractTermYears: enterpriseDeals.contractTermYears,
      pricingModel: pricingModels.modelName,
      lossArchetypeId: enterpriseDeals.lossArchetypeId,
    })
    .from(dealCompetitors)
    .innerJoin(competitors, eq(dealCompetitors.competitorId, competitors.id))
    .innerJoin(enterpriseDeals, eq(dealCompetitors.dealId, enterpriseDeals.id))
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .leftJoin(pricingModels, eq(enterpriseDeals.pricingModelId, pricingModels.id))
    .where(and(notDeletedFilter, inArray(dealCompetitors.status, ["Lost To", "Won Against"])));

  const archetypeRows = await db.select().from(lossArchetypes);
  const archetypeName = (id: number | null) =>
    archetypeRows.find((a) => a.id === id)?.archetypeName ?? null;

  const suiteRows = await db
    .select({ dealId: dealProductInterests.dealId, suite: productCatalog.suite })
    .from(dealProductInterests)
    .innerJoin(productCatalog, eq(dealProductInterests.productId, productCatalog.id));
  const suitesByDeal = new Map<string, Set<string>>();
  for (const r of suiteRows) {
    if (!r.suite) continue;
    const s = suitesByDeal.get(r.dealId) ?? new Set<string>();
    s.add(r.suite);
    suitesByDeal.set(r.dealId, s);
  }

  const byCompetitor = new Map<
    number,
    { competitorId: number; name: string; lossCount: number; lossTcv: number; archetypeCounts: Map<string, number> }
  >();
  const matrix = new Map<string, { suite: string; competitorName: string; losses: number; wins: number }>();

  for (const r of rows) {
    // A "Lost To"/"Won Against" competitor tag used to be booked as a win or
    // loss immediately, even on a deal that hadn't closed yet — so an open
    // deal already flagged "Won Against" inflated a competitor's win count
    // before the deal ever reached Closed-Won. Only count a row once the
    // deal has ACTUALLY closed in the direction its status claims; anything
    // else (open, or closed the other way) is excluded entirely.
    const isClosedLoss = r.salesStage === "Closed-Lost" && r.status === "Lost To";
    const isClosedWin = r.salesStage === "Closed-Won" && r.status === "Won Against";
    if (!isClosedLoss && !isClosedWin) continue;

    const tcv = termAwareTcv(r);
    if (isClosedLoss) {
      const c = byCompetitor.get(r.competitorId) ?? {
        competitorId: r.competitorId,
        name: r.competitorName,
        lossCount: 0,
        lossTcv: 0,
        archetypeCounts: new Map<string, number>(),
      };
      c.lossCount++;
      c.lossTcv += tcv;
      const an = archetypeName(r.lossArchetypeId);
      if (an) c.archetypeCounts.set(an, (c.archetypeCounts.get(an) ?? 0) + 1);
      byCompetitor.set(r.competitorId, c);
    }
    for (const suite of suitesByDeal.get(r.dealId) ?? []) {
      const key = `${suite}::${r.competitorName}`;
      const cell = matrix.get(key) ?? { suite, competitorName: r.competitorName, losses: 0, wins: 0 };
      if (isClosedLoss) cell.losses++;
      else cell.wins++;
      matrix.set(key, cell);
    }
  }

  const byCompetitorList = [...byCompetitor.values()]
    .map((c) => {
      let topArchetype: string | null = null;
      let max = 0;
      for (const [name, count] of c.archetypeCounts.entries()) {
        if (count > max) {
          max = count;
          topArchetype = name;
        }
      }
      return { competitorId: c.competitorId, name: c.name, lossCount: c.lossCount, lossTcv: c.lossTcv, topArchetype };
    })
    .sort((a, b) => b.lossTcv - a.lossTcv);

  res.json(GetCompetitiveLossResponse.parse({ data: { byCompetitor: byCompetitorList, matrix: [...matrix.values()] } }));
});

/* -------------------------------------------- Closed-Lost Autopsy: Dashboard */

// Loss Pulse is a transparent average of a FEW legible, currently-computable
// inputs (autopsy completeness, autopsy quality, loss rate) — deliberately not
// a tuned/weighted model. False precision would be worse than an honest
// average at the loss volumes this single-user product will ever see.
router.get("/analytics/loss-dashboard", async (_req: Request, res: Response) => {
  // Stage is the canonical loss cohort (not deal_memory.outcome — the two can
  // disagree whenever the post-mortem subscriber missed a row), with
  // dealMemory as a left-joined enrichment. termAwareTcv (not
  // deal_memory.finalTcv's flat sum) so this tab's TCV agrees with Archetypes
  // and Competitive for multi-year deals, and notDeletedFilter so an archived
  // loss doesn't disappear from one tab but not another.
  const lostRows = await db
    .select({
      dealId: enterpriseDeals.id,
      productRevenue: enterpriseDeals.productRevenue,
      servicesRevenue: enterpriseDeals.servicesRevenue,
      contractTermYears: enterpriseDeals.contractTermYears,
      pricingModel: pricingModels.modelName,
      primaryLossCategory: dealMemory.primaryLossCategory,
      autopsyCompletedAt: dealMemory.autopsyCompletedAt,
      qualityScore: dealMemory.qualityScore,
    })
    .from(enterpriseDeals)
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .leftJoin(pricingModels, eq(enterpriseDeals.pricingModelId, pricingModels.id))
    .leftJoin(dealMemory, eq(dealMemory.dealId, enterpriseDeals.id))
    .where(and(notDeletedFilter, eq(pipelineStages.stageName, "Closed-Lost")));

  const [{ n: wonCount }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(enterpriseDeals)
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(and(notDeletedFilter, eq(pipelineStages.stageName, "Closed-Won")));

  const lostIntel = await Promise.all(lostRows.map((r) => cachedIntel(r.dealId)));
  const alertCodeLists = lostIntel
    .filter((i): i is NonNullable<typeof i> => i != null)
    .map((i) => [...i.governance.alerts, ...i.governance.managedAlerts].map((a) => a.code));
  const topPatterns = computePatternLethality(alertCodeLists)
    .sort((a, b) => b.lethality - a.lethality)
    .slice(0, 10)
    .map((p) => ({ code: p.code, share: p.lethality }));

  const metrics = computeLossDashboardMetrics(
    lostRows.map((r) => ({
      tcv: termAwareTcv(r),
      primaryLossCategory: r.primaryLossCategory,
      autopsyCompletedAt: r.autopsyCompletedAt,
      qualityScore: r.qualityScore,
    })),
    wonCount,
  );

  res.json(GetLossDashboardResponse.parse({ data: { ...metrics, topPatterns } }));
});

/* ------------------------------------------- Deal Trajectory (time-series) */

// Time-ordered, merged metric series for a single deal: predictive close score,
// gate-completion %, governance health, sales stage, and TCV. Snapshots and
// scores are independent time series; we merge their timestamps into one
// ascending axis and CARRY FORWARD the last-known value of each metric so every
// point is fully populated (leading nulls until a metric first appears are
// expected). `gatePct` is derived from the snapshot `payload.gates` array
// (GateView[] with `isCompleted`) written by the snapshot service.
router.get("/analytics/deals/:dealId/trajectory", async (req: Request, res: Response) => {
  const dealId = String(req.params.dealId);

  const snapRows = await db
    .select({
      healthStatus: dealSnapshots.healthStatus,
      salesStage: dealSnapshots.salesStage,
      calculatedTcv: dealSnapshots.calculatedTcv,
      payload: dealSnapshots.payload,
      snapshotAt: dealSnapshots.snapshotAt,
    })
    .from(dealSnapshots)
    .where(eq(dealSnapshots.dealId, dealId))
    .orderBy(asc(dealSnapshots.snapshotAt));

  const scoreRows = await db
    .select({ score: dealScores.score, computedAt: dealScores.computedAt })
    .from(dealScores)
    .where(eq(dealScores.dealId, dealId))
    .orderBy(asc(dealScores.computedAt));

  // Derive gate completion % from the snapshot payload's gate array, if present.
  const gatePctOf = (payload: Record<string, unknown> | null): number | null => {
    const gates = (payload as { gates?: unknown } | null)?.gates;
    if (!Array.isArray(gates) || gates.length === 0) return null;
    const completed = gates.filter(
      (g) => (g as { isCompleted?: unknown })?.isCompleted === true,
    ).length;
    return Math.round((100 * completed) / gates.length);
  };

  // Playbook adherence % from the snapshot payload (added 2026-07); null on older
  // snapshots taken before playbooks fed the trajectory.
  const playbookPctOf = (payload: Record<string, unknown> | null): number | null => {
    const pb = (payload as { playbook?: { adherencePct?: unknown } } | null)?.playbook;
    const pct = pb?.adherencePct;
    return typeof pct === "number" ? pct : null;
  };

  // MEDDPICC overall % from the snapshot payload (added 2026-07-24); null on
  // snapshots taken before MEDDPICC scoring existed.
  const meddpiccPctOf = (payload: Record<string, unknown> | null): number | null => {
    const mp = (payload as { meddpicc?: { overallPct?: unknown } } | null)?.meddpicc;
    const pct = mp?.overallPct;
    return typeof pct === "number" ? pct : null;
  };

  interface SnapPoint {
    at: string;
    health: string | null;
    stage: string | null;
    tcv: number | null;
    gatePct: number | null;
    playbookPct: number | null;
    meddpiccPct: number | null;
  }
  const snapshots: SnapPoint[] = snapRows.map((r) => ({
    at: toISO(r.snapshotAt) ?? new Date().toISOString(),
    health: r.healthStatus ?? null,
    stage: r.salesStage ?? null,
    tcv: r.calculatedTcv != null ? Number(r.calculatedTcv) : null,
    gatePct: gatePctOf(r.payload),
    playbookPct: playbookPctOf(r.payload),
    meddpiccPct: meddpiccPctOf(r.payload),
  }));

  const scores = scoreRows.map((r) => ({
    at: toISO(r.computedAt) ?? new Date().toISOString(),
    score: r.score,
  }));

  // Stage-change markers: consecutive snapshot stage transitions (first stage is
  // the baseline, not a change).
  const stageChanges: { at: string; from: string | null; to: string | null }[] = [];
  let prevStage: string | null | undefined = undefined;
  for (const s of snapshots) {
    if (prevStage !== undefined && s.stage !== prevStage) {
      stageChanges.push({ at: s.at, from: prevStage, to: s.stage });
    }
    prevStage = s.stage;
  }

  // Merge both timestamp sets into one ascending, de-duplicated axis.
  const snapByAt = new Map(snapshots.map((s) => [s.at, s]));
  const scoreByAt = new Map(scores.map((s) => [s.at, s.score]));
  const timestamps = [...new Set([...snapshots.map((s) => s.at), ...scores.map((s) => s.at)])].sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime(),
  );

  // Carry-forward last-known value of each metric across the merged axis.
  let curScore: number | null = null;
  let curGatePct: number | null = null;
  let curHealth: string | null = null;
  let curStage: string | null = null;
  let curTcv: number | null = null;
  let curPlaybookPct: number | null = null;
  let curMeddpiccPct: number | null = null;
  const points = timestamps.map((at) => {
    if (scoreByAt.has(at)) curScore = scoreByAt.get(at) ?? curScore;
    const snap = snapByAt.get(at);
    if (snap) {
      if (snap.gatePct != null) curGatePct = snap.gatePct;
      if (snap.health != null) curHealth = snap.health;
      if (snap.stage != null) curStage = snap.stage;
      if (snap.tcv != null) curTcv = snap.tcv;
      if (snap.playbookPct != null) curPlaybookPct = snap.playbookPct;
      if (snap.meddpiccPct != null) curMeddpiccPct = snap.meddpiccPct;
    }
    return {
      at,
      score: curScore,
      gatePct: curGatePct,
      health: curHealth,
      stage: curStage,
      tcv: curTcv,
      playbookPct: curPlaybookPct,
      meddpiccPct: curMeddpiccPct,
    };
  });

  res.json({ data: { points, stageChanges } });
});

/* ----------------------------------------------------------- F19 NLC */

router.post("/nlc/parse", async (req: Request, res: Response) => {
  const b = ParseNlcCommandBody.parse(req.body);
  const parsed = parseNLC(b.query);
  res.json({ data: { query: b.query, parsed } });
});

/* ------------------------------------------------- Pipeline Flow Analytics */

// Shared loaders for the flow engine. These are not cached — the flow
// endpoints are low-traffic analytics calls; caching is deferred to a future
// task if needed.

async function loadFlowStages(): Promise<StageDef[]> {
  const rows = await db.select().from(pipelineStages);
  return rows.map((s) => ({
    id: s.id,
    name: s.stageName,
    sortOrder: s.sortOrder,
    terminal:
      s.stageName === "Closed-Won"
        ? "won"
        : s.stageName === "Closed-Lost"
          ? "lost"
          : undefined,
  }));
}

async function loadTransitions(): Promise<TransitionRec[]> {
  // Joined to enterpriseDeals + notDeletedFilter — pipelineTransitions has
  // no soft-delete column of its own, so a soft-deleted deal's history was
  // otherwise still summed into every Flow tab metric (funnel, conversion
  // matrix, Sankey, recycle/exit rates, the value-bridge waterfall) even
  // though loadOpenDeals below already excludes that same deal — the two
  // halves of the Flow tab were drawing from two differently-scoped deal
  // populations.
  const rows = await db
    .select({
      dealId: pipelineTransitions.dealId,
      fromStageId: pipelineTransitions.fromStageId,
      toStageId: pipelineTransitions.toStageId,
      transitionType: pipelineTransitions.transitionType,
      tcvAtTransition: pipelineTransitions.tcvAtTransition,
      daysInFromStage: pipelineTransitions.daysInFromStage,
      transitionedAt: pipelineTransitions.transitionedAt,
    })
    .from(pipelineTransitions)
    .innerJoin(enterpriseDeals, eq(pipelineTransitions.dealId, enterpriseDeals.id))
    .where(notDeletedFilter)
    .orderBy(asc(pipelineTransitions.transitionedAt));
  return rows.map((r) => ({
    dealId: r.dealId,
    fromStageId: r.fromStageId,
    toStageId: r.toStageId,
    transitionType: r.transitionType as TransitionRec["transitionType"],
    tcv: Number(r.tcvAtTransition ?? 0),
    daysInFromStage: r.daysInFromStage,
    transitionedAt: new Date(r.transitionedAt).toISOString(),
  }));
}

async function loadOpenDeals(): Promise<OpenDeal[]> {
  const rows = await db
    .select({
      id: enterpriseDeals.id,
      stageId: enterpriseDeals.salesStageId,
      productRevenue: enterpriseDeals.productRevenue,
      servicesRevenue: enterpriseDeals.servicesRevenue,
      contractTermYears: enterpriseDeals.contractTermYears,
      pricingModel: pricingModels.modelName,
      wp: enterpriseDeals.winProbabilityPct,
      createdAt: enterpriseDeals.createdAt,
      landedAt: enterpriseDeals.landedAt,
    })
    .from(enterpriseDeals)
    .leftJoin(pricingModels, eq(enterpriseDeals.pricingModelId, pricingModels.id))
    .where(notDeletedFilter);

  // AI win-probability from latest deal_scores per deal.
  // dealScores.score is an integer 0-100; OpenDeal.aiWinProbability is 0..1.
  // Take the latest score per deal (scores are ordered desc by computedAt in
  // the latestScores() helper above; we replicate that pattern inline here).
  const scoreRows = await db
    .select({ dealId: dealScores.dealId, score: dealScores.score, computedAt: dealScores.computedAt })
    .from(dealScores)
    .orderBy(desc(dealScores.computedAt));
  const aiByDeal = new Map<string, number>();
  for (const s of scoreRows) {
    if (!aiByDeal.has(s.dealId)) aiByDeal.set(s.dealId, s.score);
  }

  return rows.map((r) => {
    const tcv = calculateFlatTCV({
      productRevenue: Number(r.productRevenue) || 0,
      servicesRevenue: Number(r.servicesRevenue) || 0,
      contractTermYears: r.contractTermYears,
      pricingModel: r.pricingModel ?? "",
    });
    const rawScore = aiByDeal.get(r.id);
    return {
      id: r.id,
      stageId: r.stageId ?? 0,
      tcv,
      winProbabilityPct: r.wp == null ? null : Number(r.wp),
      aiWinProbability: rawScore != null ? rawScore / 100 : null,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
      landedAt: r.landedAt ? new Date(r.landedAt).toISOString() : null,
    };
  });
}

/** Returns the ISO date string (YYYY-MM-DD) for the first day of the active calendar quarter. */
function activeQuarterStart(now = new Date()): string {
  const q = Math.floor(now.getUTCMonth() / 3);
  return new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1)).toISOString().slice(0, 10);
}

// NOTE: literal paths registered before any param-based routes per repo convention.

router.get("/analytics/flow/funnel", async (_req: Request, res: Response) => {
  const [stages, deals, transitions] = await Promise.all([
    loadFlowStages(),
    loadOpenDeals(),
    loadTransitions(),
  ]);
  res.json({ data: computeFunnel(deals, transitions, stages) });
});

router.get("/analytics/flow/conversion-matrix", async (req: Request, res: Response) => {
  const windowDays = Math.max(1, Math.min(365, Number(req.query.windowDays ?? 90)));
  const [stages, transitions] = await Promise.all([loadFlowStages(), loadTransitions()]);
  res.json({
    data: computeConversionMatrix(transitions, stages, windowDays, new Date().toISOString()),
  });
});

router.get("/analytics/flow/sankey", async (req: Request, res: Response) => {
  const mode = req.query.mode === "value" ? "value" : "count";
  const [stages, transitions] = await Promise.all([loadFlowStages(), loadTransitions()]);
  res.json({
    data: {
      ...computeSankeyFlows(transitions, stages, mode),
      // The Sankey only ever shows forward progression (self-loops and
      // regressions are filtered client-side). `breakdown` accounts for every
      // transition — advances, recycles, and both exit outcomes — so the
      // widget can show the full picture alongside the diagram.
      breakdown: computeTransitionBreakdown(transitions),
    },
  });
});

router.get("/analytics/flow/recycle", async (_req: Request, res: Response) => {
  const [stages, transitions] = await Promise.all([loadFlowStages(), loadTransitions()]);
  res.json({ data: computeRecycleExit(transitions, stages) });
});

router.get("/analytics/flow/coverage", async (_req: Request, res: Response) => {
  const [stages, deals] = await Promise.all([loadFlowStages(), loadOpenDeals()]);
  const periodStart = activeQuarterStart();
  const [tgt] = await db
    .select()
    .from(pipelineTargets)
    .where(eq(pipelineTargets.periodStart, periodStart));
  const target = tgt ? Number(tgt.targetValue) : null;
  res.json({ data: computeCoverage(deals, stages, target, periodStart) });
});

router.get("/analytics/flow/health-score", async (_req: Request, res: Response) => {
  const [stages, deals, transitions] = await Promise.all([
    loadFlowStages(),
    loadOpenDeals(),
    loadTransitions(),
  ]);
  const periodStart = activeQuarterStart();
  const [tgt] = await db
    .select()
    .from(pipelineTargets)
    .where(eq(pipelineTargets.periodStart, periodStart));
  const target = tgt ? Number(tgt.targetValue) : null;
  const coverage = computeCoverage(deals, stages, target, periodStart);
  const recycle = computeRecycleExit(transitions, stages);
  const winExits = transitions.filter((t) => t.transitionType === "exit_won").length;
  const lossExits = transitions.filter((t) => t.transitionType === "exit_lost").length;
  const winRate = winExits + lossExits > 0 ? winExits / (winExits + lossExits) : 0;
  const daysWithStage = transitions.filter((t) => t.daysInFromStage != null);
  const avgResidence =
    daysWithStage.reduce((s, t) => s + (t.daysInFromStage ?? 0), 0) /
    Math.max(1, daysWithStage.length);

  // Overdue share: fraction of currently-open deals classified SLOW by
  // computeVelocityRows (lib/velocity.ts) — the exact same open-deals-only,
  // leave-one-out benchmark and >1.5x threshold /analytics/velocity uses, so
  // "age" here means the same thing a viewer sees on the Velocity widget.
  // Previously this ran its own inline median-by-stage loop that (a)
  // included closed deals in both the benchmark and the denominator — a
  // Closed-Lost deal can't be "overdue," so this contradicted the Velocity
  // widget's own filtered list — and (b) let a deal's own days-in-stage
  // count toward its own benchmark, the same self-referential bug fixed in
  // /analytics/velocity. This also replaces the ORIGINAL agingScore, which
  // just re-read avgResidence under a second label and so contributed no
  // independent signal to the composite.
  const openStageRows = await db
    .select({
      id: enterpriseDeals.id,
      stageEnteredAt: enterpriseDeals.stageEnteredAt,
      stageName: pipelineStages.stageName,
    })
    .from(enterpriseDeals)
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(and(notDeletedFilter, notInArray(pipelineStages.stageName, CLOSED_STAGES)));
  const velocityRows = computeVelocityRows(
    openStageRows.map((r) => ({ id: r.id, stageName: r.stageName, daysInStage: daysBetween(r.stageEnteredAt) })),
  );
  const overdueCount = velocityRows.filter((r) => r.velocity === "SLOW").length;
  const overdueShare = velocityRows.length > 0 ? overdueCount / velocityRows.length : 0;

  // generationRatio: computeCoverage returns netNew===null in two distinct
  // situations that must be scored differently — no quarterly target
  // configured at all (coverage.total is also null; exclude the dimension),
  // vs. the coverage gap already fully backfilled by weighted pipeline (a
  // GOOD outcome that should score as fully covered, not be dropped).
  const noTargetSet = coverage.total == null;
  const generationRatio = noTargetSet ? null : (coverage.netNew ?? 1);

  const inputs = {
    coverageQualified: coverage.qualified,
    velocityIndex: Math.round(avgResidence),
    winRate,
    generationRatio,
    agingScore: overdueShare,
    retentionRate: 1 - recycle.overallRecycleRate / 100,
  };
  const weights = await getHealthWeights();
  res.json({ data: { ...scoreHealthAbsolute(inputs, DEFAULT_HEALTH_BENCHMARKS, weights), coverage } });
});

void sql;

export default router;
