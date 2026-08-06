import { Router, type IRouter, type Request, type Response } from "express";
import {
  initCatalystApp,
  type CatalystApp,
  createEnterpriseDealsRepo,
  createPipelineStagesRepo,
  createPricingModelsRepo,
  createDealTechnicalGatesRepo,
  createDealScoresRepo,
  createDealActivityLogRepo,
  createDealCompetitorsRepo,
  createCompetitorsRepo,
  createDealMemoryRepo,
  createDealProductInterestsRepo,
  createProductCatalogRepo,
  createDealBlockersRepo,
  createBlockerCategoriesRepo,
  createLossArchetypesRepo,
  createGateDefinitionsRepo,
  createDealDecisionsRepo,
  createDealPlaybookAssignmentsRepo,
  createPlaybooksRepo,
  createPlaybookStepsRepo,
  createPlaybookStepCompletionsRepo,
  createDealSnapshotsRepo,
  createPipelineTransitionsRepo,
  createPipelineTargetsRepo,
  createCommanderAchievementsRepo,
  type EnterpriseDeal,
} from "@workspace/db/catalyst";
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
  quarterStartUTC,
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
import { toISO, getHealthWeights, getThresholds, getFxRate } from "../../lib/catalyst/intelligence";
import { getActor } from "../../lib/auth";
import { computeDealScore, scoreDeal, rescoreActiveDeals } from "../../lib/catalyst/scoring";
import { cachedIntel, computeSummary, mapWithConcurrency, INTEL_CONCURRENCY } from "../../lib/catalyst/portfolio";
import { computeMemoryHealth, type MemoryRow as MemoryHealthRow } from "../../lib/memory-health";
import { computeCompetitorIntel, computePlaybookEffectiveness, percentiles, type MemoryRow as CompetitorMemoryRow } from "../../lib/memory-intel";
import { pickLatestPerDeal, computeScoreDelta } from "../../lib/roster-enrichment";
import { clusterProductGaps } from "../../lib/product-gaps";
import { CLOSED_STAGES, termAwareTcv, normalizeTcv } from "../../lib/deal-filters";
import { computeVelocityRows } from "../../lib/velocity";
import { computeLossDashboardMetrics } from "../../lib/loss-dashboard";
import { calendarDaysUntil, isWithinDays } from "../../lib/calendar-days";

const router: IRouter = Router();

function daysBetween(from: Date | string | null, to = new Date()): number {
  if (!from) return 0;
  return Math.max(0, Math.floor((to.getTime() - new Date(from).getTime()) / 86_400_000));
}

// -------------------------------------------------------------- Shared loaders
//
// Every handler below does its own independent fetch (no cross-request
// caching) — matching the original Drizzle version, which issued its own
// queries per handler too. These helpers only remove IN-HANDLER duplication.

async function loadPricingModelNames(catalystApp: CatalystApp): Promise<Map<number, string>> {
  const models = await createPricingModelsRepo(catalystApp).listAll();
  return new Map(models.map((m) => [m.id, m.modelName]));
}

async function loadStageNames(catalystApp: CatalystApp): Promise<Map<number, string>> {
  const stages = await createPipelineStagesRepo(catalystApp).listAll();
  return new Map(stages.map((s) => [s.id, s.stageName]));
}

interface DealWithStage {
  deal: EnterpriseDeal;
  stageName: string | null;
}

/** Every not-hard-deleted deal, joined to its stage name (dangling stage id -> null, mirrors the original innerJoin dropping the row). */
async function loadLiveDealsWithStage(catalystApp: CatalystApp): Promise<DealWithStage[]> {
  const [deals, stageNameById] = await Promise.all([
    createEnterpriseDealsRepo(catalystApp).list(),
    loadStageNames(catalystApp),
  ]);
  return deals
    .filter((d) => d.deletedAt == null)
    .map((deal) => ({ deal, stageName: stageNameById.get(deal.salesStageId) ?? null }));
}

/** Live, OPEN (not Closed-Won/Closed-Lost) deals with a resolved stage name — the population /analytics/velocity, /analytics/simulation, and the health-score aging dimension all share. */
async function loadOpenDealsWithStage(catalystApp: CatalystApp): Promise<DealWithStage[]> {
  const all = await loadLiveDealsWithStage(catalystApp);
  return all.filter((d) => d.stageName != null && !CLOSED_STAGES.includes(d.stageName));
}

async function latestScores(catalystApp: CatalystApp): Promise<Map<string, number>> {
  const rows = await createDealScoresRepo(catalystApp).listAll();
  return pickLatestPerDeal(rows);
}

// Each deal's score as of `cutoff` (latest row at or before it) — the baseline
// for the roster score-trend arrow.
async function scoresAsOf(catalystApp: CatalystApp, cutoff: Date): Promise<Map<string, number>> {
  const rows = await createDealScoresRepo(catalystApp).listAll();
  return pickLatestPerDeal(rows.filter((r) => r.computedAt.getTime() <= cutoff.getTime()));
}

function toMemoryHealthRow(r: Awaited<ReturnType<ReturnType<typeof createDealMemoryRepo>["listAll"]>>[number]): MemoryHealthRow {
  return {
    id: r.id,
    outcome: r.outcome,
    finalTcv: r.finalTcv != null ? String(r.finalTcv) : null,
    competitorsFaced: r.competitorsFaced,
    winLossNarrative: r.winLossNarrative,
    keyLessons: r.keyLessons,
    archivedAt: r.archivedAt,
    autopsyCompletedAt: r.autopsyCompletedAt,
  };
}

function toCompetitorMemoryRow(r: Awaited<ReturnType<ReturnType<typeof createDealMemoryRepo>["listAll"]>>[number]): CompetitorMemoryRow {
  return {
    id: r.id,
    outcome: r.outcome,
    finalTcv: r.finalTcv != null ? String(r.finalTcv) : null,
    totalDaysActive: r.totalDaysActive,
    competitorsFaced: r.competitorsFaced,
    pricingModel: r.pricingModel,
    servicesTier: r.servicesTier,
    primaryLossCategory: r.primaryLossCategory,
  };
}

/* ----------------------------------------------------------- F3 Scoring */

router.get("/deals/:dealId/score", async (req: Request, res: Response) => {
  const { dealId } = GetDealScoreParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  // Readers get an identical number; they just don't append to deal_scores.
  // A GET must not silently grow an append-only history table every time a
  // reader loads a deal page.
  const isAdmin = getActor(req).role === "admin";
  const score = isAdmin ? await scoreDeal(catalystApp, dealId) : await computeDealScore(catalystApp, dealId);
  if (!score) throw notFound("Deal not found");
  res.json({ data: { ...score, computedAt: new Date().toISOString() } });
});

router.post("/scores/recalculate", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const count = await rescoreActiveDeals(catalystApp);
  res.json({ data: { rescored: count } });
});

/* ----------------------------------------------------------- F4 Velocity / pipeline */

router.get("/analytics/velocity", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  // Closed deals never enter this comparison — a Closed-Won/Closed-Lost
  // deal can't be "overdue," and including it polluted every OPEN deal's
  // benchmark too (this table used to list Closed-Lost deals as "32 days
  // overdue").
  const candidates = await loadOpenDealsWithStage(catalystApp);

  // computeVelocityRows (lib/velocity.ts) computes each deal's benchmark as
  // a leave-one-out median — excluding the deal itself — and returns null
  // (not a self-fulfilling "exactly at benchmark") when it's the only open
  // deal in its stage.
  const rows = computeVelocityRows(
    candidates.map((d) => ({ id: d.deal.id, stageName: d.stageName as string, daysInStage: daysBetween(d.deal.stageEnteredAt) })),
  );
  const byId = new Map(candidates.map((d) => [d.deal.id, d.deal]));

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

router.get("/analytics/velocity/benchmarks", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const candidates = await loadOpenDealsWithStage(catalystApp);
  const stages = await createPipelineStagesRepo(catalystApp).listAll();
  const sortOrderByName = new Map(stages.map((s) => [s.stageName, s.sortOrder]));

  const byStage = new Map<string, { sortOrder: number; days: number[] }>();
  for (const d of candidates) {
    const stageName = d.stageName as string;
    const entry = byStage.get(stageName) ?? { sortOrder: sortOrderByName.get(stageName) ?? 0, days: [] };
    entry.days.push(daysBetween(d.deal.stageEnteredAt));
    byStage.set(stageName, entry);
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

router.get("/analytics/pipeline", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const [live, pricingModelNameById] = await Promise.all([
    loadLiveDealsWithStage(catalystApp),
    loadPricingModelNames(catalystApp),
  ]);
  let totalTcv = 0;
  let openTcv = 0;
  let openDealCount = 0;
  const byStage = new Map<string, { count: number; tcv: number }>();
  for (const { deal, stageName } of live) {
    const tcv = calculateFlatTCV({
      productRevenue: Number(deal.productRevenue) || 0,
      servicesRevenue: Number(deal.servicesRevenue) || 0,
      contractTermYears: deal.contractTermYears,
      pricingModel: pricingModelNameById.get(deal.pricingModelId) ?? "",
    });
    totalTcv += tcv;
    const key = stageName ?? "?";
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
      activeDeals: live.length,
      openTcv,
      openDealCount,
      byStage: [...byStage.entries()].map(([stage, v]) => ({ stage, ...v })),
    },
  });
});

/* ----------------------------------------------------------- F20 Simulation */

router.get("/analytics/simulation", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const iterations = Math.min(50_000, Math.max(1000, Number(req.query.iterations) || 10000));
  // Closed deals (Won or Lost) never enter the forecast, regardless of
  // archive state — a booked/lost deal has no remaining outcome to simulate.
  const [openDeals, pricingModelNameById, scores] = await Promise.all([
    loadOpenDealsWithStage(catalystApp),
    loadPricingModelNames(catalystApp),
    latestScores(catalystApp),
  ]);
  const sim: SimDeal[] = openDeals.map(({ deal }) => ({
    calculatedTCV: calculateFlatTCV({
      productRevenue: Number(deal.productRevenue) || 0,
      servicesRevenue: Number(deal.servicesRevenue) || 0,
      contractTermYears: deal.contractTermYears,
      pricingModel: pricingModelNameById.get(deal.pricingModelId) ?? "",
    }),
    predictiveScore: scores.get(deal.id) ?? null,
    winProbabilityPct: deal.winProbabilityPct ?? null,
  }));
  // The engine's own `weightedPipeline` (in runPipelineSimulation's result)
  // is Σ tcv × dealProbability, where dealProbability blends in the AI
  // predictive score (falling back to winProbabilityPct, then a 30%
  // default) — it's the simulation's own mean, not an independent
  // cross-check of it. traditionalWeightedPipeline is the actual
  // stage-weighted figure ("weighted pipeline" as sales teams usually mean
  // it): Σ tcv × winProbabilityPct, deals without a manually-set win
  // probability excluded rather than defaulted.
  const traditionalWeightedPipeline = openDeals.reduce((s, { deal }, i) => {
    if (deal.winProbabilityPct == null) return s;
    return s + sim[i].calculatedTCV * (Number(deal.winProbabilityPct) / 100);
  }, 0);
  const dealsWithoutWinProbability = openDeals.filter((d) => d.deal.winProbabilityPct == null).length;
  res.json({
    data: {
      ...runPipelineSimulation(sim, iterations),
      traditionalWeightedPipeline: Math.round(traditionalWeightedPipeline),
      dealsWithoutWinProbability,
    },
  });
});

/* ----------------------------------------------------------- F2 Competitive analytics */

// A competitor with only 1-2 resolved encounters can't support a definitive
// win-rate percentage — "1 encounter, 1 loss" reading as a stark "0%" is
// noise, not signal. Mirrors /analytics/memory-insights's MIN_SAMPLE floor.
const MIN_COMPETITIVE_SAMPLE = 3;

router.get("/analytics/competitive", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const [links, competitors, deals] = await Promise.all([
    createDealCompetitorsRepo(catalystApp).listAll(),
    createCompetitorsRepo(catalystApp).listAll(),
    createEnterpriseDealsRepo(catalystApp).list(),
  ]);
  const nameById = new Map(competitors.map((c) => [c.id, c.name]));
  const liveDealIds = new Set(deals.filter((d) => d.deletedAt == null).map((d) => d.id));

  const agg = new Map<string, { encounters: number; wins: number; losses: number }>();
  for (const link of links) {
    if (!liveDealIds.has(link.dealId)) continue;
    const key = nameById.get(link.competitorId) ?? "Unknown";
    const cur = agg.get(key) ?? { encounters: 0, wins: 0, losses: 0 };
    cur.encounters++;
    if (link.status === "Won Against") cur.wins++;
    if (link.status === "Lost To") cur.losses++;
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

router.get("/analytics/win-loss", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const [memory, deals] = await Promise.all([
    createDealMemoryRepo(catalystApp).listAll(),
    createEnterpriseDealsRepo(catalystApp).list(),
  ]);
  const liveDealIds = new Set(deals.filter((d) => d.deletedAt == null).map((d) => d.id));
  const rows = memory.filter((m) => liveDealIds.has(m.dealId));

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
      const t = r.finalTcv ?? 0;
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
router.get("/analytics/gates", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const [defs, gateRows, deals] = await Promise.all([
    createGateDefinitionsRepo(catalystApp).listActive(),
    createDealTechnicalGatesRepo(catalystApp).listAll(),
    createEnterpriseDealsRepo(catalystApp).list(),
  ]);
  const liveDealIds = new Set(deals.filter((d) => d.deletedAt == null).map((d) => d.id));

  const agg = new Map<string, { completed: number; total: number }>();
  for (const r of gateRows) {
    if (!liveDealIds.has(r.dealId)) continue;
    const cur = agg.get(r.gateCode) ?? { completed: 0, total: 0 };
    cur.total++;
    if (r.isCompleted) cur.completed++;
    agg.set(r.gateCode, cur);
  }

  // defs is already sorted by sortOrder (createGateDefinitionsRepo.listActive) —
  // matches the original ORDER BY sort_order, no additional sort here.
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
router.get("/analytics/next-actions", async (req: Request, res: Response) => {
  // The one clock read for this handler. Both date-only windows below are
  // measured in LOCAL CALENDAR DAYS off it (see lib/calendar-days.ts), not as
  // instant arithmetic, so "due today" and "closing today" land in the right
  // bucket regardless of the host's UTC offset.
  const now = new Date();
  const catalystApp = initCatalystApp(req);

  const [live, decisionsAll, assignmentsAll, playbooksAll] = await Promise.all([
    loadLiveDealsWithStage(catalystApp),
    createDealDecisionsRepo(catalystApp).listAll(),
    createDealPlaybookAssignmentsRepo(catalystApp).listAll(),
    createPlaybooksRepo(catalystApp).listAll(),
  ]);
  const liveById = new Map(live.map((d) => [d.deal.id, d]));
  const playbookNameById = new Map(playbooksAll.map((p) => [p.id, p.playbookName]));

  // next-actions is a reminder surface, so closed deals (Won or Lost) are
  // excluded — which also excludes archived deals for free, since archiving
  // requires a closed stage.
  const decisions = decisionsAll
    .filter((d) => d.status === "Pending")
    .map((d) => ({ decision: d, live: liveById.get(d.dealId) }))
    .filter((x): x is { decision: typeof decisionsAll[number]; live: DealWithStage } =>
      x.live != null && x.live.stageName != null && !CLOSED_STAGES.includes(x.live.stageName),
    );

  const overdue: ActionItem[] = [];
  const dueThisWeek: ActionItem[] = [];
  for (const { decision: d, live } of decisions) {
    if (!d.dueDate) continue;
    const item: ActionItem = {
      id: d.id,
      dealId: d.dealId,
      dealName: live.deal.dealName,
      accountName: live.deal.accountName,
      action: d.decisionText,
      owner: d.owner,
      dueDate: d.dueDate,
    };
    // `due_date` is a date-only column: bucket it by LOCAL CALENDAR DAY, not by
    // instant.
    const daysUntilDue = calendarDaysUntil(d.dueDate, now);
    if (daysUntilDue == null) continue;
    if (daysUntilDue < 0) overdue.push(item);
    else if (daysUntilDue <= 7) dueThisWeek.push(item);
  }
  const byDue = (a: ActionItem, b: ActionItem) => a.dueDate.localeCompare(b.dueDate);
  overdue.sort(byDue);
  dueThisWeek.sort(byDue);

  // Next open playbook step per active assignment. A deal can now legitimately
  // hold 2+ concurrent assignments (one per stage it has touched on its
  // journey), so each row carries the playbook name to stay disambiguated.
  const assignments = assignmentsAll
    .filter((a) => a.status === "Active")
    .map((a) => ({ assignment: a, live: liveById.get(a.dealId) }))
    .filter((x): x is { assignment: typeof assignmentsAll[number]; live: DealWithStage } =>
      x.live != null && x.live.stageName != null && !CLOSED_STAGES.includes(x.live.stageName),
    );

  const playbookStepsOut: {
    dealId: string;
    dealName: string;
    playbookName: string;
    action: string;
    stepOrder: number;
    totalSteps: number;
  }[] = [];
  for (const { assignment: a, live } of assignments) {
    const steps = await createPlaybookStepsRepo(catalystApp).listByPlaybookId(a.playbookId);
    const completions = await createPlaybookStepCompletionsRepo(catalystApp).listByAssignmentId(a.id);
    // Completed/skipped are terminal; a blocked step still needs attention, so it
    // surfaces as the next open action.
    const doneIds = new Set(
      completions.filter((c) => c.status === "completed" || c.status === "skipped").map((c) => c.stepId),
    );
    const next = steps.find((s) => !doneIds.has(s.id));
    if (next) {
      playbookStepsOut.push({
        dealId: a.dealId,
        dealName: live.deal.dealName,
        playbookName: playbookNameById.get(a.playbookId) ?? "",
        action: next.stepName,
        stepOrder: next.stepOrder,
        totalSteps: steps.length,
      });
    }
  }

  // Imminent close dates: deals still OPEN (i.e. not Closed-Won/Closed-Lost)
  // within 30 days.
  const closeRows = live.filter((d) => d.stageName != null && !CLOSED_STAGES.includes(d.stageName));
  // Calendar-day window, inclusive at both ends. `expected_close_date` is a
  // date-only column.
  const upcomingCloses = closeRows
    .filter((d) => isWithinDays(d.deal.expectedCloseDate, 30, now))
    .map((d) => ({
      id: d.deal.id,
      dealName: d.deal.dealName,
      accountName: d.deal.accountName,
      expectedCloseDate: d.deal.expectedCloseDate,
      daysToClose: calendarDaysUntil(d.deal.expectedCloseDate, now) as number,
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
//
// Every money figure here — current AND baseline — is in the REPORTING currency.
router.get("/analytics/vital-signs", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const [openDeals, pricingModelNameById, scores] = await Promise.all([
    loadOpenDealsWithStage(catalystApp),
    loadPricingModelNames(catalystApp),
    latestScores(catalystApp),
  ]);
  const openIds = openDeals.map((d) => d.deal.id);

  // One cached getFxRate lookup per DISTINCT currency in the open cohort (in
  // practice 1-3), not one per deal.
  const { thresholds } = await getThresholds(catalystApp);
  const reportingCurrency = String(thresholds.reporting_currency || "USD");
  const currencies = [...new Set(openDeals.map((d) => d.deal.dealCurrency ?? reportingCurrency))];
  const fxByCurrency = new Map(
    await Promise.all(currencies.map(async (c) => [c, await getFxRate(catalystApp, c, reportingCurrency)] as const)),
  );

  let totalTCV = 0;
  let weightedPipeline = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  for (const { deal } of openDeals) {
    const tcv = normalizeTcv(
      termAwareTcv({
        productRevenue: deal.productRevenue,
        servicesRevenue: deal.servicesRevenue,
        contractTermYears: deal.contractTermYears,
        pricingModel: pricingModelNameById.get(deal.pricingModelId) ?? null,
      }),
      fxByCurrency.get(deal.dealCurrency ?? reportingCurrency),
    );
    totalTCV += tcv;
    const pct = scores.get(deal.id) ?? deal.winProbabilityPct ?? 30;
    weightedPipeline += tcv * Math.max(0, Math.min(1, pct / 100));
    const s = scores.get(deal.id);
    if (s != null) {
      scoreSum += s;
      scoreCount++;
    }
  }
  const avgScore = scoreCount ? Math.round(scoreSum / scoreCount) : null;

  const cutoff = new Date(Date.now() - 7 * 86_400_000);
  const latestSnaps = await createDealSnapshotsRepo(catalystApp).latestAtOrBeforePerDeal(openIds, cutoff);

  let baseline: {
    totalTCV: number;
    activeDeals: number;
    redAlerts: number;
    redDeals: number;
  } | null = null;
  if (latestSnaps.length > 0) {
    let bTcv = 0;
    let bRedAlerts = 0;
    let bRedDeals = 0;
    for (const s of latestSnaps) {
      bTcv += s.normalizedTcv ?? 0;
      // Two DISTINCT baselines, because the dashboard shows two different
      // quantities that used to share this one field: the "Red Alerts" tile
      // counts RED-severity ALERTS, while Pipeline Health's "N RED this week"
      // counts RED-health DEALS.
      if (s.healthStatus === "RED") bRedDeals++;
      const alerts = (s.payload as { governance?: { alerts?: { severity?: string }[] } } | null)
        ?.governance?.alerts;
      if (Array.isArray(alerts)) {
        bRedAlerts += alerts.filter((a) => a?.severity === "RED").length;
      }
    }
    baseline = {
      totalTCV: bTcv,
      activeDeals: latestSnaps.length,
      redAlerts: bRedAlerts,
      redDeals: bRedDeals,
    };
  }

  res.json({
    data: {
      totalTCV,
      weightedPipeline: Math.round(weightedPipeline),
      activeDeals: openDeals.length,
      avgScore,
      reportingCurrency,
      baseline,
    },
  });
});

/* ----------------------------------------------- Dashboard: Roster enrichment */

// Per-deal score / gate-progress / velocity, keyed by id. Health, TCV, stage and
// close date come from /v1/deals (engine-computed health); the dashboard roster
// merges this enrichment onto that list by id.
router.get("/analytics/roster", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const live = await loadLiveDealsWithStage(catalystApp);
  const liveDealIds = new Set(live.map((d) => d.deal.id));

  const scores = await latestScores(catalystApp);
  // Score trend: baseline = each deal's score as of 7 days ago (null delta when
  // there's no prior score to compare against).
  const baselineScores = await scoresAsOf(catalystApp, new Date(Date.now() - 7 * 86_400_000));

  // Last-activity age: newest activity-log entry per deal, excluding the
  // auto-generated health.changed churn so the metric reflects real work.
  const activityRows = await createDealActivityLogRepo(catalystApp).listAll();
  const lastActivityByDeal = new Map<string, Date>();
  for (const r of activityRows) {
    if (r.eventType === "health.changed") continue;
    const cur = lastActivityByDeal.get(r.dealId);
    if (!cur || r.occurredAt.getTime() > cur.getTime()) lastActivityByDeal.set(r.dealId, r.occurredAt);
  }

  const gateRows = await createDealTechnicalGatesRepo(catalystApp).listAll();
  const gateAgg = new Map<string, { c: number; t: number }>();
  for (const g of gateRows) {
    if (!liveDealIds.has(g.dealId)) continue;
    const cur = gateAgg.get(g.dealId) ?? { c: 0, t: 0 };
    cur.t++;
    if (g.isCompleted) cur.c++;
    gateAgg.set(g.dealId, cur);
  }

  // Benchmark/velocity comes from the SHARED computeVelocityRows helper
  // (lib/velocity.ts), the same one /analytics/velocity uses.
  //
  // Only OPEN deals form the population (a Closed-Won deal has no pipeline
  // motion left to benchmark), matching /analytics/velocity's own filter.
  // Closed deals still get a row — with the velocity trio null — because this
  // response's other fields (score, gatesPct, riskLevel, daysSinceLastActivity)
  // are consumed for every non-deleted deal by the roster page.
  const openVelocityById = new Map(
    computeVelocityRows(
      live
        .filter((d) => d.stageName != null && !CLOSED_STAGES.includes(d.stageName))
        .map((d) => ({ id: d.deal.id, stageName: d.stageName as string, daysInStage: daysBetween(d.deal.stageEnteredAt) })),
    ).map((r) => [r.id, r]),
  );

  // Fetch per-deal risk from the cached intelligence tier (intel: prefix,
  // 30 s TTL, event-bus-invalidated on mutation).
  //
  // Bounded, not a raw Promise.all: mapWithConcurrency preserves input order,
  // which the index-keyed zip below depends on.
  const intelResults = await mapWithConcurrency(live, INTEL_CONCURRENCY, (d) => cachedIntel(catalystApp, d.deal.id));
  const riskByDeal = new Map(
    live.map((d, i) => {
      const intel = intelResults[i];
      return [
        d.deal.id,
        {
          riskScore: intel?.risk?.compositeScore ?? null,
          riskLevel: intel?.risk?.riskLevel ?? null,
        },
      ];
    }),
  );

  const rows = live.map(({ deal: d }) => {
    const g = gateAgg.get(d.id) ?? { c: 0, t: 0 };
    const days = daysBetween(d.stageEnteredAt);
    const risk = riskByDeal.get(d.id);
    const scoreNow = scores.get(d.id) ?? null;
    const lastActivity = lastActivityByDeal.get(d.id);
    // Absent for a closed deal (not in the open population above), and null
    // inside the row itself when the stage has no usable benchmark yet.
    const vel = openVelocityById.get(d.id);
    return {
      id: d.id,
      dealName: d.dealName,
      score: scoreNow,
      scoreDelta: computeScoreDelta(scoreNow, baselineScores.get(d.id) ?? null),
      gatesPct: g.t ? Math.round((g.c / g.t) * 100) : 0,
      daysInStage: days,
      daysSinceLastActivity: lastActivity ? daysBetween(lastActivity) : null,
      benchmarkDays: vel?.benchmarkDays ?? null,
      deltaDays: vel?.deltaDays ?? null,
      velocityStatus: vel?.velocity ?? "INSUFFICIENT_DATA",
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
router.get("/analytics/product-gaps", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const [memoryAll, deals, blockersAll, blockerCategories, catalog, pricingModelNameById] = await Promise.all([
    createDealMemoryRepo(catalystApp).listAll(),
    createEnterpriseDealsRepo(catalystApp).list(),
    createDealBlockersRepo(catalystApp).listAll(),
    createBlockerCategoriesRepo(catalystApp).listAll(),
    createProductCatalogRepo(catalystApp).listAll(),
    loadPricingModelNames(catalystApp),
  ]);
  const liveDealById = new Map(deals.filter((d) => d.deletedAt == null).map((d) => [d.id, d]));
  const technicalCategoryId = blockerCategories.find((c) => c.categoryName === "Technical")?.id;

  // Joined to enterpriseDeals (never hard-deleted, so a missing/deleted deal
  // just drops the row) for termAwareTcv — deal_memory.finalTcv was a flat
  // sum, which disagreed with Archetypes/Competitive for a multi-year deal.
  const lostMemories = memoryAll
    .filter((m) => m.outcome === "Lost")
    .map((m) => {
      const deal = liveDealById.get(m.dealId);
      if (!deal) return null;
      return {
        dealId: m.dealId,
        dealName: m.dealName,
        finalTcv: termAwareTcv({
          productRevenue: deal.productRevenue,
          servicesRevenue: deal.servicesRevenue,
          contractTermYears: deal.contractTermYears,
          pricingModel: pricingModelNameById.get(deal.pricingModelId) ?? null,
        }),
        productGaps: m.productGaps ?? [],
      };
    })
    .filter((m): m is NonNullable<typeof m> => m != null);

  const techBlockers = blockersAll
    .filter((b) => !b.isResolved && b.categoryId === technicalCategoryId)
    .map((b) => {
      const deal = liveDealById.get(b.dealId);
      if (!deal) return null;
      return {
        dealId: b.dealId,
        dealName: deal.dealName,
        description: b.description,
        tcv: termAwareTcv({
          productRevenue: deal.productRevenue,
          servicesRevenue: deal.servicesRevenue,
          contractTermYears: deal.contractTermYears,
          pricingModel: pricingModelNameById.get(deal.pricingModelId) ?? null,
        }),
      };
    })
    .filter((b): b is NonNullable<typeof b> => b != null);

  const clusters = clusterProductGaps(lostMemories, techBlockers, catalog);

  res.json({ data: { clusters } });
});

/* ------------------------------------------ Dashboard: Deal Memory Insights */

// Deterministic (no-LLM) pattern matching of archived deals against the current
// pipeline. Each rule emits an insight only when its sample size is sufficient.
router.get("/analytics/memory-insights", async (req: Request, res: Response) => {
  const MIN_SAMPLE = 3;
  const catalystApp = initCatalystApp(req);
  const [memory, deals, competitors, pricingModelNameById] = await Promise.all([
    createDealMemoryRepo(catalystApp).listAll(),
    createEnterpriseDealsRepo(catalystApp).list(),
    createCompetitorsRepo(catalystApp).listAll(),
    loadPricingModelNames(catalystApp),
  ]);
  const archivedCount = memory.length;
  const competitorNameById = new Map(competitors.map((c) => [c.id, c.name]));

  const active = deals
    .filter((d) => d.deletedAt == null)
    .map((d) => ({
      id: d.id,
      dealName: d.dealName,
      productRevenue: d.productRevenue,
      servicesRevenue: d.servicesRevenue,
      contractTermYears: d.contractTermYears,
      pricingModel: pricingModelNameById.get(d.pricingModelId) ?? null,
      competitorName: d.competitorId != null ? competitorNameById.get(d.competitorId) ?? null : null,
    }));
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
          const t = m.finalTcv ?? 0;
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

router.get("/analytics/memory-health", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const rows = await createDealMemoryRepo(catalystApp).listAll();
  res.json({ data: computeMemoryHealth(rows.map(toMemoryHealthRow)) });
});

/* ------------------------------------------ Dashboard: Engagement (Achievements) */

interface AchievementDef {
  code: string;
  name: string;
  description: string;
}

// Rescaled to this app's actual data volume (~12-14 deals) rather than the
// PRD's literal examples (100 closes, 25-deal veteran). Permanence comes from
// the commander_achievements table, not from these live metrics being
// monotonic: dealPlaybookAssignments.status CAN revert on a reopened step,
// but once earned, an achievement stays earned.
const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { code: "first_close", name: "First Deal Closed", description: "Every journey starts with a single close." },
  { code: "playbooks_3", name: "3 Playbooks Completed", description: "Process is what separates good from great." },
  { code: "giant_slayer", name: "Giant Slayer", description: "You don't just close deals — you win them." },
  { code: "clean_pipeline", name: "Clean Pipeline", description: "Zero stalled deals, zero red alerts. Enjoy the calm." },
];

async function evaluateAchievements(catalystApp: CatalystApp): Promise<Record<string, boolean>> {
  // Only true deletions are excluded here — a Closed-Won deal is typically
  // archived shortly after closing (post-mortem subscriber), so excluding
  // archived deals would undercount "ever closed."
  const [live, playbookAssignments, competitorLinks, summary] = await Promise.all([
    loadLiveDealsWithStage(catalystApp),
    createDealPlaybookAssignmentsRepo(catalystApp).listAll(),
    createDealCompetitorsRepo(catalystApp).listAll(),
    computeSummary(catalystApp),
  ]);

  const closedWonCount = live.filter((d) => d.stageName === "Closed-Won").length;
  const playbooksCompletedCount = playbookAssignments.filter((a) => a.status === "Completed").length;
  const wonAgainst = competitorLinks.filter((l) => l.status === "Won Against");
  const distinctCompetitorsBeaten = new Set(wonAgainst.map((r) => r.competitorId)).size;

  return {
    first_close: closedWonCount >= 1,
    playbooks_3: playbooksCompletedCount >= 3,
    giant_slayer: distinctCompetitorsBeaten >= 2,
    clean_pipeline: summary.staleDeals.length === 0 && summary.dealsByHealth.RED === 0,
  };
}

router.get("/analytics/engagement", async (req: Request, res: Response) => {
  const since = typeof req.query.since === "string" ? req.query.since : undefined;
  const catalystApp = initCatalystApp(req);

  const trueNow = await evaluateAchievements(catalystApp);
  const achievementsRepo = createCommanderAchievementsRepo(catalystApp);
  const existingRows = await achievementsRepo.listAll();
  const existingCodes = new Set(existingRows.map((r) => r.achievementCode));
  // First-ever evaluation (empty table): silently backfill whatever's
  // already true rather than reporting it as "newly earned" — the live dev
  // DB already has real history predating this feature, and toasting 2-3
  // "achievement unlocked" celebrations on the first load after deploy
  // would misrepresent things that actually happened weeks ago.
  const isFirstEverEvaluation = existingRows.length === 0;

  // commander_achievements has no per-commander column at all (its PK is
  // achievement_code alone) — the ledger is app-global, not per-user. A
  // reader's page load must not be able to mint a row here.
  if (getActor(req).role === "admin") {
    for (const def of ACHIEVEMENT_DEFS) {
      if (trueNow[def.code] && !existingCodes.has(def.code)) {
        await achievementsRepo.earnIfMissing(def.code);
      }
    }
  }

  const finalRows = await achievementsRepo.listAll();
  const earnedMap = new Map(finalRows.map((r) => [r.achievementCode, r.earnedAt]));
  const achievements = ACHIEVEMENT_DEFS.map((def) => ({
    code: def.code,
    name: def.name,
    description: def.description,
    earnedAt: earnedMap.get(def.code)?.toISOString() ?? null,
    locked: !earnedMap.has(def.code),
  }));

  // Derived from earnedAt vs `since`, NOT "inserted during this exact call" —
  // see the equivalent comment on the original Drizzle version for the full
  // caller-order-independence rationale (two independent callers share this
  // same unconditional upsert-above).
  const sinceDate = !isFirstEverEvaluation && since ? new Date(since) : null;
  const newlyEarnedCodes =
    sinceDate && !Number.isNaN(sinceDate.getTime())
      ? finalRows.filter((r) => r.earnedAt.getTime() > sinceDate.getTime()).map((r) => r.achievementCode)
      : [];

  let dealsClosedWonSince: { dealId: string; dealName: string }[] = [];
  if (since) {
    const sinceTime = new Date(since).getTime();
    const live = await loadLiveDealsWithStage(catalystApp);
    dealsClosedWonSince = live
      .filter((d) => d.stageName === "Closed-Won" && d.deal.stageEnteredAt.getTime() >= sinceTime)
      .map((d) => ({ dealId: d.deal.id, dealName: d.deal.dealName }));
  }

  res.json({ data: { achievements, newlyEarnedCodes, dealsClosedWonSince } });
});

/* ------------------------------------- Competitive & Pricing Intelligence */

router.get("/analytics/competitor-intel", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const rows = await createDealMemoryRepo(catalystApp).listAll();
  res.json({ data: computeCompetitorIntel(rows.map(toCompetitorMemoryRow)) });
});

router.get("/analytics/pricing-benchmarks", async (req: Request, res: Response) => {
  const q = GetPricingBenchmarksQueryParams.parse(req.query);
  const catalystApp = initCatalystApp(req);
  const all = await createDealMemoryRepo(catalystApp).listAll();
  const rows = all.filter(
    (r) =>
      (!q.pricingModel || r.pricingModel === q.pricingModel) &&
      (!q.servicesTier || r.servicesTier === q.servicesTier) &&
      (!q.outcome || r.outcome === q.outcome),
  );

  const tcvs = rows.map((r) => r.finalTcv ?? 0).filter((n) => n > 0);
  const cycles = rows.map((r) => r.totalDaysActive ?? 0).filter((n) => n > 0);

  res.json({
    data: {
      sampleSize: rows.length,
      // Separate from sampleSize: rows with a null/zero TCV or cycle time are
      // excluded from their respective percentiles, so the two counts can be
      // smaller than the matched-row total.
      tcvSampleSize: tcvs.length,
      cycleSampleSize: cycles.length,
      tcv: percentiles(tcvs),
      cycleDays: percentiles(cycles),
    },
  });
});

router.get("/analytics/playbook-effectiveness", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const [memory, assignments] = await Promise.all([
    createDealMemoryRepo(catalystApp).listAll(),
    createDealPlaybookAssignmentsRepo(catalystApp).listAll(),
  ]);
  const assignedIds = new Set(assignments.map((a) => a.dealId));
  res.json({ data: computePlaybookEffectiveness(memory.map((m) => ({ dealId: m.dealId, outcome: m.outcome })), assignedIds) });
});

/* ------------------------------------------ Closed-Lost Autopsy: Early Warning */

// Cross-references each ACTIVE deal's currently-firing pattern codes against
// how often those same patterns fired on deals that were ultimately
// Closed-Lost (lib/engine/src/loss-risk.ts). This is a small enrichment on top
// of the same cachedIntel() tier the roster/summary already use.
router.get("/analytics/loss-risk", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const live = await loadLiveDealsWithStage(catalystApp);
  const lostDeals = live.filter((d) => d.stageName === "Closed-Lost");

  const lostIntel = await Promise.all(lostDeals.map((d) => cachedIntel(catalystApp, d.deal.id)));
  const lostAlertCodes = lostIntel
    .filter((i): i is NonNullable<typeof i> => i != null)
    .map((i) => [...i.governance.alerts, ...i.governance.managedAlerts].map((a) => a.code));
  const lethality = computePatternLethality(lostAlertCodes);

  const activeDeals = live.filter((d) => d.stageName != null && !CLOSED_STAGES.includes(d.stageName));

  const activeIntel = await Promise.all(activeDeals.map((d) => cachedIntel(catalystApp, d.deal.id)));
  const deals = activeDeals
    .map((d, i) => {
      const intel = activeIntel[i];
      if (!intel) return null;
      const codes = [...intel.governance.alerts, ...intel.governance.managedAlerts].map((a) => a.code);
      const { score, matchedPatterns } = scoreLossRisk(codes, lethality);
      return { dealId: d.deal.id, dealName: d.deal.dealName, accountName: d.deal.accountName, score, matchedPatterns };
    })
    .filter((r): r is NonNullable<typeof r> => r != null && r.score > 0)
    .sort((a, b) => b.score - a.score);

  res.json(GetLossRiskResponse.parse({ data: { deals, lostDealCount: lostDeals.length } }));
});

/* ------------------------------------------- Closed-Lost Autopsy: Competitive */

// Aggregates the EXISTING per-deal deal_competitors tracking into a
// portfolio-wide view: which competitors we lose to most, and a sparse
// product-suite x competitor win/loss matrix. No new capture UI needed —
// deal_competitors already holds this data.
router.get("/analytics/competitive-loss", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const [links, competitors, deals, archetypes, productInterests, catalog, pricingModelNameById] = await Promise.all([
    createDealCompetitorsRepo(catalystApp).listAll(),
    createCompetitorsRepo(catalystApp).listAll(),
    createEnterpriseDealsRepo(catalystApp).list(),
    createLossArchetypesRepo(catalystApp).listAll(),
    createDealProductInterestsRepo(catalystApp).listAll(),
    createProductCatalogRepo(catalystApp).listAll(),
    loadPricingModelNames(catalystApp),
  ]);
  const stageNameById = await loadStageNames(catalystApp);
  const competitorNameById = new Map(competitors.map((c) => [c.id, c.name]));
  const liveDealById = new Map(deals.filter((d) => d.deletedAt == null).map((d) => [d.id, d]));
  const archetypeNameById = new Map(archetypes.map((a) => [a.id, a.archetypeName]));
  const archetypeName = (id: number | null) => (id == null ? null : archetypeNameById.get(id) ?? null);

  const productById = new Map(catalog.map((p) => [p.id, p]));
  const suitesByDeal = new Map<string, Set<string>>();
  for (const pi of productInterests) {
    const product = productById.get(pi.productId);
    if (!product?.suite) continue;
    const s = suitesByDeal.get(pi.dealId) ?? new Set<string>();
    s.add(product.suite);
    suitesByDeal.set(pi.dealId, s);
  }

  // Mirrors the original's three inner joins (competitors, enterpriseDeals,
  // pipelineStages) — a link whose competitor, deal, or stage doesn't resolve
  // is dropped entirely, not defaulted. pricingModels stays a left join
  // (null pricingModel falls through to termAwareTcv's own "" fallback).
  const rows = links
    .filter((l) => l.status === "Lost To" || l.status === "Won Against")
    .map((l) => {
      const competitorName = competitorNameById.get(l.competitorId);
      if (competitorName === undefined) return null;
      const deal = liveDealById.get(l.dealId);
      if (!deal) return null;
      const salesStage = stageNameById.get(deal.salesStageId);
      if (salesStage === undefined) return null;
      return {
        dealId: l.dealId,
        competitorId: l.competitorId,
        competitorName,
        status: l.status,
        salesStage,
        productRevenue: deal.productRevenue,
        servicesRevenue: deal.servicesRevenue,
        contractTermYears: deal.contractTermYears,
        pricingModel: pricingModelNameById.get(deal.pricingModelId) ?? null,
        lossArchetypeId: deal.lossArchetypeId,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  const byCompetitor = new Map<
    number,
    { competitorId: number; name: string; lossCount: number; lossTcv: number; archetypeCounts: Map<string, number> }
  >();
  const matrix = new Map<string, { suite: string; competitorName: string; losses: number; wins: number }>();

  for (const r of rows) {
    // A "Lost To"/"Won Against" competitor tag used to be booked as a win or
    // loss immediately, even on a deal that hadn't closed yet — so only count
    // a row once the deal has ACTUALLY closed in the direction its status
    // claims; anything else (open, or closed the other way) is excluded.
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
// a tuned/weighted model.
router.get("/analytics/loss-dashboard", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const [live, memoryAll, pricingModelNameById] = await Promise.all([
    loadLiveDealsWithStage(catalystApp),
    createDealMemoryRepo(catalystApp).listAll(),
    loadPricingModelNames(catalystApp),
  ]);
  const memoryByDeal = new Map(memoryAll.map((m) => [m.dealId, m]));

  // Stage is the canonical loss cohort (not deal_memory.outcome — the two can
  // disagree whenever the post-mortem subscriber missed a row), with
  // dealMemory as a left-joined enrichment. termAwareTcv (not
  // deal_memory.finalTcv's flat sum) so this tab's TCV agrees with Archetypes
  // and Competitive for multi-year deals.
  const lostRows = live
    .filter((d) => d.stageName === "Closed-Lost")
    .map(({ deal }) => {
      const memory = memoryByDeal.get(deal.id);
      return {
        dealId: deal.id,
        tcv: termAwareTcv({
          productRevenue: deal.productRevenue,
          servicesRevenue: deal.servicesRevenue,
          contractTermYears: deal.contractTermYears,
          pricingModel: pricingModelNameById.get(deal.pricingModelId) ?? null,
        }),
        primaryLossCategory: memory?.primaryLossCategory ?? null,
        autopsyCompletedAt: memory?.autopsyCompletedAt ?? null,
        qualityScore: memory?.qualityScore ?? null,
      };
    });

  const wonCount = live.filter((d) => d.stageName === "Closed-Won").length;

  const lostIntel = await Promise.all(lostRows.map((r) => cachedIntel(catalystApp, r.dealId)));
  const alertCodeLists = lostIntel
    .filter((i): i is NonNullable<typeof i> => i != null)
    .map((i) => [...i.governance.alerts, ...i.governance.managedAlerts].map((a) => a.code));
  const topPatterns = computePatternLethality(alertCodeLists)
    .sort((a, b) => b.lethality - a.lethality)
    .slice(0, 10)
    .map((p) => ({ code: p.code, share: p.lethality }));

  const metrics = computeLossDashboardMetrics(
    lostRows.map((r) => ({
      tcv: r.tcv,
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
  const catalystApp = initCatalystApp(req);

  const snapRows = await createDealSnapshotsRepo(catalystApp).listByDealId(dealId);
  const scoreRowsAll = await createDealScoresRepo(catalystApp).listAll();
  const scoreRows = scoreRowsAll
    .filter((r) => r.dealId === dealId)
    .sort((a, b) => a.computedAt.getTime() - b.computedAt.getTime());

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
    tcv: r.calculatedTcv,
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

async function loadFlowStages(catalystApp: CatalystApp): Promise<StageDef[]> {
  const stages = await createPipelineStagesRepo(catalystApp).listAll();
  return stages.map((s) => ({
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

async function loadTransitions(catalystApp: CatalystApp): Promise<TransitionRec[]> {
  // Filtered against the live (not soft-deleted) deal set — pipelineTransitions
  // has no soft-delete column of its own, so a soft-deleted deal's history was
  // otherwise still summed into every Flow tab metric even though
  // loadOpenDeals below already excludes that same deal.
  const [rows, deals] = await Promise.all([
    createPipelineTransitionsRepo(catalystApp).listAll(),
    createEnterpriseDealsRepo(catalystApp).list(),
  ]);
  const liveDealIds = new Set(deals.filter((d) => d.deletedAt == null).map((d) => d.id));
  return rows
    .filter((r) => liveDealIds.has(r.dealId))
    .map((r) => ({
      dealId: r.dealId,
      fromStageId: r.fromStageId,
      toStageId: r.toStageId,
      transitionType: r.transitionType as TransitionRec["transitionType"],
      tcv: r.tcvAtTransition ?? 0,
      daysInFromStage: r.daysInFromStage,
      transitionedAt: r.transitionedAt.toISOString(),
    }));
}

async function loadOpenDeals(catalystApp: CatalystApp): Promise<OpenDeal[]> {
  const [deals, pricingModelNameById, scores] = await Promise.all([
    createEnterpriseDealsRepo(catalystApp).list(),
    loadPricingModelNames(catalystApp),
    latestScores(catalystApp),
  ]);
  const live = deals.filter((d) => d.deletedAt == null);

  return live.map((d) => {
    const tcv = calculateFlatTCV({
      productRevenue: Number(d.productRevenue) || 0,
      servicesRevenue: Number(d.servicesRevenue) || 0,
      contractTermYears: d.contractTermYears,
      pricingModel: pricingModelNameById.get(d.pricingModelId) ?? "",
    });
    // AI win-probability from latest deal_scores per deal. dealScores.score is
    // an integer 0-100; OpenDeal.aiWinProbability is 0..1.
    const rawScore = scores.get(d.id);
    return {
      id: d.id,
      stageId: d.salesStageId ?? 0,
      tcv,
      winProbabilityPct: d.winProbabilityPct == null ? null : Number(d.winProbabilityPct),
      aiWinProbability: rawScore != null ? rawScore / 100 : null,
      createdAt: d.createdAt ? d.createdAt.toISOString() : new Date().toISOString(),
      landedAt: d.landedAt ? new Date(d.landedAt).toISOString() : null,
    };
  });
}

/**
 * Returns the ISO date string (YYYY-MM-DD) for the first day of the active
 * calendar quarter, computed in UTC.
 *
 * UTC is the deliberate, canonical convention for "which quarter is this
 * pipeline target row in" across the whole feature — pipeline_targets.
 * period_start is stored as a bare date-only string with no timezone
 * attached, so there is no "local time" to consult on the read side anyway.
 */
function activeQuarterStart(now = new Date()): string {
  return quarterStartUTC(now);
}

async function targetForActiveQuarter(catalystApp: CatalystApp, periodStart: string): Promise<number | null> {
  const targets = await createPipelineTargetsRepo(catalystApp).listAll();
  // periodType is part of the upsert's conflict key ([periodType, periodStart]
  // in config.ts) — filtering on periodStart alone could match a differently-
  // typed row that happens to share the same date.
  const match = targets.find((t) => t.periodType === "quarter" && t.periodStart === periodStart);
  return match ? match.targetValue : null;
}

// NOTE: literal paths registered before any param-based routes per repo convention.

router.get("/analytics/flow/funnel", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const [stages, deals, transitions] = await Promise.all([
    loadFlowStages(catalystApp),
    loadOpenDeals(catalystApp),
    loadTransitions(catalystApp),
  ]);
  res.json({ data: computeFunnel(deals, transitions, stages) });
});

router.get("/analytics/flow/conversion-matrix", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const windowDays = Math.max(1, Math.min(365, Number(req.query.windowDays ?? 90)));
  const [stages, transitions] = await Promise.all([loadFlowStages(catalystApp), loadTransitions(catalystApp)]);
  res.json({
    data: computeConversionMatrix(transitions, stages, windowDays, new Date().toISOString()),
  });
});

router.get("/analytics/flow/sankey", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const mode = req.query.mode === "value" ? "value" : "count";
  const [stages, transitions] = await Promise.all([loadFlowStages(catalystApp), loadTransitions(catalystApp)]);
  res.json({
    data: {
      ...computeSankeyFlows(transitions, stages, mode),
      // The Sankey only ever shows forward progression (self-loops and
      // regressions are filtered client-side). `breakdown` accounts for every
      // transition — advances, recycles, and both exit outcomes.
      breakdown: computeTransitionBreakdown(transitions),
    },
  });
});

router.get("/analytics/flow/recycle", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const [stages, transitions] = await Promise.all([loadFlowStages(catalystApp), loadTransitions(catalystApp)]);
  res.json({ data: computeRecycleExit(transitions, stages) });
});

router.get("/analytics/flow/coverage", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const [stages, deals] = await Promise.all([loadFlowStages(catalystApp), loadOpenDeals(catalystApp)]);
  const periodStart = activeQuarterStart();
  const target = await targetForActiveQuarter(catalystApp, periodStart);
  res.json({ data: computeCoverage(deals, stages, target, periodStart) });
});

router.get("/analytics/flow/health-score", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const [stages, deals, transitions] = await Promise.all([
    loadFlowStages(catalystApp),
    loadOpenDeals(catalystApp),
    loadTransitions(catalystApp),
  ]);
  const periodStart = activeQuarterStart();
  const target = await targetForActiveQuarter(catalystApp, periodStart);
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
  // leave-one-out benchmark and >1.5x threshold /analytics/velocity uses.
  const openStageRows = await loadOpenDealsWithStage(catalystApp);
  const velocityRows = computeVelocityRows(
    openStageRows.map((d) => ({ id: d.deal.id, stageName: d.stageName as string, daysInStage: daysBetween(d.deal.stageEnteredAt) })),
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
  const weights = await getHealthWeights(catalystApp);
  res.json({ data: { ...scoreHealthAbsolute(inputs, DEFAULT_HEALTH_BENCHMARKS, weights), coverage } });
});

export default router;
