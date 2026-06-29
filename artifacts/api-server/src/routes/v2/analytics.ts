import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, isNull, lte, sql } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  pipelineStages,
  dealTechnicalGates,
  dealScores,
  dealCompetitors,
  competitors,
  dealMemory,
  gateDefinitions,
  dealDecisions,
  dealPlaybookAssignments,
  playbookSteps,
  playbookStepCompletions,
  dealSnapshots,
} from "@workspace/db";
import {
  runPipelineSimulation,
  parseNLC,
  type SimDeal,
} from "@workspace/engine";
import { GetDealScoreParams, ParseNlcCommandBody } from "@workspace/api-zod";
import { notFound } from "../../lib/http";
import { scoreDeal, rescoreActiveDeals } from "../../lib/scoring";

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
      .select({ stepId: playbookStepCompletions.stepId })
      .from(playbookStepCompletions)
      .where(eq(playbookStepCompletions.assignmentId, a.assignmentId));
    const doneIds = new Set(completions.map((c) => c.stepId));
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

  const rows = deals.map((d) => {
    const g = gateAgg.get(d.id) ?? { c: 0, t: 0 };
    const days = daysBetween(d.stageEnteredAt);
    const bench = median(byStage.get(d.stageName ?? "?") ?? [days]);
    return {
      id: d.id,
      dealName: d.dealName,
      score: scores.get(d.id) ?? null,
      gatesPct: g.t ? Math.round((g.c / g.t) * 100) : 0,
      daysInStage: days,
      benchmarkDays: bench,
      deltaDays: days - bench,
      velocityStatus: days > bench * 1.5 ? "SLOW" : days < bench * 0.5 ? "FAST" : "NORMAL",
    };
  });

  res.json({ data: { deals: rows } });
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

/* ----------------------------------------------------------- F19 NLC */

router.post("/nlc/parse", async (req: Request, res: Response) => {
  const b = ParseNlcCommandBody.parse(req.body);
  const parsed = parseNLC(b.query);
  res.json({ data: { query: b.query, parsed } });
});

void sql;

export default router;
