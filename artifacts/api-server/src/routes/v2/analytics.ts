import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, inArray, isNull, lte, max, ne, notInArray, sql } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  pipelineStages,
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
  playbookSteps,
  playbookStepCompletions,
  dealSnapshots,
  pipelineTransitions,
  pipelineTargets,
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
  computeHealthScore,
  computePatternLethality,
  scoreLossRisk,
  type StageDef,
  type TransitionRec,
  type OpenDeal,
} from "@workspace/engine";
import { GetDealScoreParams, GetPricingBenchmarksQueryParams, ParseNlcCommandBody } from "@workspace/api-zod";
import { notFound } from "../../lib/http";
import { toISO, getHealthWeights } from "../../lib/intelligence";
import { scoreDeal, rescoreActiveDeals } from "../../lib/scoring";
import { cachedIntel } from "../../lib/portfolio";
import { computeMemoryHealth } from "../../lib/memory-health";
import { computeCompetitorIntel, computePlaybookEffectiveness, percentiles } from "../../lib/memory-intel";
import { pickLatestPerDeal, computeScoreDelta } from "../../lib/roster-enrichment";
import { clusterProductGaps } from "../../lib/product-gaps";

const router: IRouter = Router();

const activeFilter = and(isNull(enterpriseDeals.deletedAt), isNull(enterpriseDeals.archivedAt));

function daysBetween(from: Date | string | null, to = new Date()): number {
  if (!from) return 0;
  return Math.max(0, Math.round((to.getTime() - new Date(from).getTime()) / 86_400_000));
}

/* ----------------------------------------------------------- F3 Scoring */

router.get("/deals/:dealId/score", async (req: Request, res: Response) => {
  const { dealId } = GetDealScoreParams.parse(req.params);
  const score = await scoreDeal(dealId);
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
    .where(activeFilter);

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
    .where(and(activeFilter, eq(dealDecisions.status, "Pending")));

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

  // Next open playbook step per active assignment.
  const assignments = await db
    .select({
      assignmentId: dealPlaybookAssignments.id,
      dealId: dealPlaybookAssignments.dealId,
      dealName: enterpriseDeals.dealName,
      playbookId: dealPlaybookAssignments.playbookId,
    })
    .from(dealPlaybookAssignments)
    .innerJoin(enterpriseDeals, eq(dealPlaybookAssignments.dealId, enterpriseDeals.id))
    .where(and(activeFilter, eq(dealPlaybookAssignments.status, "Active")));

  const playbookStepsOut: {
    dealId: string;
    dealName: string;
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
        action: next.stepName,
        stepOrder: next.stepOrder,
        totalSteps: steps.length,
      });
    }
  }

  // Imminent close dates (active deals within 30 days).
  const closeRows = await db
    .select({
      id: enterpriseDeals.id,
      dealName: enterpriseDeals.dealName,
      accountName: enterpriseDeals.accountName,
      expectedCloseDate: enterpriseDeals.expectedCloseDate,
    })
    .from(enterpriseDeals)
    .where(activeFilter);
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
      winProbabilityPct: enterpriseDeals.winProbabilityPct,
    })
    .from(enterpriseDeals)
    .where(activeFilter);
  const scores = await latestScores();

  let totalTCV = 0;
  let weightedPipeline = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  for (const d of deals) {
    const tcv = (Number(d.productRevenue) || 0) + (Number(d.servicesRevenue) || 0);
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
    .where(activeFilter);

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
    .where(activeFilter);
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
  const lostMemories = await db
    .select({
      dealId: dealMemory.dealId,
      dealName: dealMemory.dealName,
      finalTcv: dealMemory.finalTcv,
      productGaps: dealMemory.productGaps,
    })
    .from(dealMemory)
    .where(eq(dealMemory.outcome, "Lost"));

  const techBlockers = await db
    .select({
      dealId: dealBlockers.dealId,
      dealName: enterpriseDeals.dealName,
      description: dealBlockers.description,
      productRevenue: enterpriseDeals.productRevenue,
      servicesRevenue: enterpriseDeals.servicesRevenue,
    })
    .from(dealBlockers)
    .innerJoin(enterpriseDeals, eq(dealBlockers.dealId, enterpriseDeals.id))
    .innerJoin(blockerCategories, eq(dealBlockers.categoryId, blockerCategories.id))
    .where(and(eq(dealBlockers.isResolved, false), eq(blockerCategories.categoryName, "Technical")));

  const catalog = await db
    .select({ id: productCatalog.id, productName: productCatalog.productName, code: productCatalog.code })
    .from(productCatalog);

  const clusters = clusterProductGaps(
    lostMemories.map((m) => ({
      dealId: m.dealId,
      dealName: m.dealName,
      finalTcv: m.finalTcv == null ? null : Number(m.finalTcv),
      productGaps: (m.productGaps as string[] | null) ?? [],
    })),
    techBlockers.map((b) => ({
      dealId: b.dealId,
      dealName: b.dealName,
      description: b.description,
      tcv: (Number(b.productRevenue) || 0) + (Number(b.servicesRevenue) || 0),
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
      competitorName: competitors.name,
    })
    .from(enterpriseDeals)
    .leftJoin(competitors, eq(enterpriseDeals.competitorId, competitors.id))
    .where(activeFilter);
  const tcvOf = (d: { productRevenue: unknown; servicesRevenue: unknown }) =>
    (Number(d.productRevenue) || 0) + (Number(d.servicesRevenue) || 0);

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
    .where(and(activeFilter, eq(pipelineStages.stageName, "Closed-Lost")));

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
    .where(and(activeFilter, notInArray(pipelineStages.stageName, ["Closed-Won", "Closed-Lost"])));

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

  res.json({ data: { deals, lostDealCount: lostDeals.length } });
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
      productRevenue: enterpriseDeals.productRevenue,
      servicesRevenue: enterpriseDeals.servicesRevenue,
      lossArchetypeId: enterpriseDeals.lossArchetypeId,
    })
    .from(dealCompetitors)
    .innerJoin(competitors, eq(dealCompetitors.competitorId, competitors.id))
    .innerJoin(enterpriseDeals, eq(dealCompetitors.dealId, enterpriseDeals.id))
    .where(inArray(dealCompetitors.status, ["Lost To", "Won Against"]));

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
    const tcv = (Number(r.productRevenue) || 0) + (Number(r.servicesRevenue) || 0);
    const isLoss = r.status === "Lost To";
    if (isLoss) {
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
      if (isLoss) cell.losses++;
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

  res.json({ data: { byCompetitor: byCompetitorList, matrix: [...matrix.values()] } });
});

/* -------------------------------------------- Closed-Lost Autopsy: Dashboard */

// Loss Pulse is a transparent average of a FEW legible, currently-computable
// inputs (autopsy completeness, autopsy quality, loss rate) — deliberately not
// a tuned/weighted model. False precision would be worse than an honest
// average at the loss volumes this single-user product will ever see.
router.get("/analytics/loss-dashboard", async (_req: Request, res: Response) => {
  const memory = await db.select().from(dealMemory);
  const lost = memory.filter((m) => m.outcome === "Lost");
  const won = memory.filter((m) => m.outcome === "Won");

  const lostDeals = await db
    .select({ id: enterpriseDeals.id })
    .from(enterpriseDeals)
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(and(activeFilter, eq(pipelineStages.stageName, "Closed-Lost")));
  const lostIntel = await Promise.all(lostDeals.map((d) => cachedIntel(d.id)));
  const alertCodeLists = lostIntel
    .filter((i): i is NonNullable<typeof i> => i != null)
    .map((i) => [...i.governance.alerts, ...i.governance.managedAlerts].map((a) => a.code));
  const topPatterns = computePatternLethality(alertCodeLists)
    .sort((a, b) => b.lethality - a.lethality)
    .slice(0, 10)
    .map((p) => ({ code: p.code, share: p.lethality }));

  const lossCount = lost.length;
  const lossValue = lost.reduce((s, m) => s + (Number(m.finalTcv) || 0), 0);

  const byCategory = new Map<string, { count: number; value: number }>();
  for (const m of lost) {
    const cat = m.primaryLossCategory ?? "uncategorized";
    const cur = byCategory.get(cat) ?? { count: 0, value: 0 };
    cur.count++;
    cur.value += Number(m.finalTcv) || 0;
    byCategory.set(cat, cur);
  }
  const compositionByCategory = [...byCategory.entries()]
    .map(([category, v]) => ({ category, count: v.count, value: v.value }))
    .sort((a, b) => b.value - a.value);

  const completed = lost.filter((m) => m.autopsyCompletedAt != null);
  const autopsyCompletenessPct = lossCount > 0 ? Math.round((completed.length / lossCount) * 100) : 0;
  const avgQualityScore =
    completed.length > 0
      ? Math.round(completed.reduce((s, m) => s + (m.qualityScore ?? 0), 0) / completed.length)
      : null;
  const decided = lost.length + won.length;
  const lossRatePct = decided > 0 ? Math.round((lost.length / decided) * 100) : null;

  const components = [autopsyCompletenessPct, avgQualityScore, lossRatePct != null ? 100 - lossRatePct : null].filter(
    (c): c is number => c != null,
  );
  const lossPulse = components.length > 0 ? Math.round(components.reduce((s, c) => s + c, 0) / components.length) : null;

  res.json({
    data: {
      lossPulse,
      lossPulseComponents: { autopsyCompletenessPct, avgQualityScore, lossRatePct },
      volume: { lossCount, lossValue },
      compositionByCategory,
      topPatterns,
    },
  });
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

  interface SnapPoint {
    at: string;
    health: string | null;
    stage: string | null;
    tcv: number | null;
    gatePct: number | null;
    playbookPct: number | null;
  }
  const snapshots: SnapPoint[] = snapRows.map((r) => ({
    at: toISO(r.snapshotAt) ?? new Date().toISOString(),
    health: r.healthStatus ?? null,
    stage: r.salesStage ?? null,
    tcv: r.calculatedTcv != null ? Number(r.calculatedTcv) : null,
    gatePct: gatePctOf(r.payload),
    playbookPct: playbookPctOf(r.payload),
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
  const points = timestamps.map((at) => {
    if (scoreByAt.has(at)) curScore = scoreByAt.get(at) ?? curScore;
    const snap = snapByAt.get(at);
    if (snap) {
      if (snap.gatePct != null) curGatePct = snap.gatePct;
      if (snap.health != null) curHealth = snap.health;
      if (snap.stage != null) curStage = snap.stage;
      if (snap.tcv != null) curTcv = snap.tcv;
      if (snap.playbookPct != null) curPlaybookPct = snap.playbookPct;
    }
    return {
      at,
      score: curScore,
      gatePct: curGatePct,
      health: curHealth,
      stage: curStage,
      tcv: curTcv,
      playbookPct: curPlaybookPct,
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
  const rows = await db
    .select()
    .from(pipelineTransitions)
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
      wp: enterpriseDeals.winProbabilityPct,
      createdAt: enterpriseDeals.createdAt,
      landedAt: enterpriseDeals.landedAt,
    })
    .from(enterpriseDeals)
    .where(activeFilter);

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
    const tcv = (Number(r.productRevenue) || 0) + (Number(r.servicesRevenue) || 0);
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
  res.json({ data: computeSankeyFlows(transitions, stages, mode) });
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
  const inputs = {
    coverageQualified: coverage.qualified,
    velocityIndex: Math.round(avgResidence),
    winRate,
    generationRatio: coverage.netNew,
    agingScore: Math.round(avgResidence),
    retentionRate: 1 - recycle.overallRecycleRate / 100,
  };
  const history = { coverage: [], velocity: [], conversion: [], generation: [], age: [], attrition: [] };
  const weights = await getHealthWeights();
  res.json({ data: { ...computeHealthScore(inputs, history, weights), coverage } });
});

void sql;

export default router;
