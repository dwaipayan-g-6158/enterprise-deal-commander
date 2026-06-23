import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, isNull, gt } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  pipelineStages,
  lossArchetypes,
  dealReviewMarkers,
  dealAuditLog,
} from "@workspace/db";
import {
  GetDealIntelligenceParams,
  GetDealIntelligenceResponse,
  GetIntelligenceSummaryResponse,
  GetPortfolioAnalysisResponse,
  GetAutopsyQueryParams,
  GetAutopsyResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { notFound } from "../lib/http";
import { assembleDealIntelligence, getThresholds } from "../lib/intelligence";

const router: IRouter = Router();

router.use(requireAuth);

router.get(
  "/deals/:dealId/intelligence",
  async (req: Request, res: Response) => {
    const { dealId } = GetDealIntelligenceParams.parse(req.params);
    const data = await assembleDealIntelligence(dealId);
    if (!data) throw notFound("Deal not found");
    res.json(GetDealIntelligenceResponse.parse({ data }));
  },
);

async function activeDealIds(): Promise<string[]> {
  const rows = await db
    .select({ id: enterpriseDeals.id })
    .from(enterpriseDeals)
    .where(
      and(
        isNull(enterpriseDeals.deletedAt),
        isNull(enterpriseDeals.archivedAt),
      ),
    );
  return rows.map((r) => r.id);
}

type Intel = NonNullable<Awaited<ReturnType<typeof assembleDealIntelligence>>>;

async function loadActiveIntel(): Promise<Intel[]> {
  const ids = await activeDealIds();
  const results = await Promise.all(
    ids.map((id) => assembleDealIntelligence(id)),
  );
  return results.filter((r): r is Intel => r !== null);
}

router.get(
  "/intelligence/summary",
  async (_req: Request, res: Response) => {
    const { thresholds } = await getThresholds();
    const reportingCurrency = String(thresholds.reporting_currency || "USD");
    const staleStageDays = Number(thresholds.stale_stage_days) || 21;
    const deals = await loadActiveIntel();

    const dealsByHealth = { GREEN: 0, YELLOW: 0, RED: 0 };
    const dealsByStage: Record<string, number> = {};
    let totalTCV = 0;
    const criticalAlerts: {
      dealId: string;
      dealName: string;
      accountName: string;
      alert: Intel["governance"]["alerts"][number];
    }[] = [];
    const staleDeals: {
      dealId: string;
      dealName: string;
      daysInStage: number;
    }[] = [];

    for (const d of deals) {
      dealsByHealth[d.governance.healthStatus] += 1;
      dealsByStage[d.salesStage] = (dealsByStage[d.salesStage] ?? 0) + 1;
      totalTCV += d.financials.normalizedTCV;
      for (const alert of d.governance.alerts) {
        if (alert.severity === "RED") {
          criticalAlerts.push({
            dealId: d.id,
            dealName: d.dealName,
            accountName: d.accountName,
            alert,
          });
        }
      }
      if (d.daysInStage > staleStageDays) {
        staleDeals.push({
          dealId: d.id,
          dealName: d.dealName,
          daysInStage: d.daysInStage,
        });
      }
    }

    criticalAlerts.sort(
      (a, b) => (b.alert.weight ?? 0) - (a.alert.weight ?? 0),
    );
    staleDeals.sort((a, b) => b.daysInStage - a.daysInStage);

    const markers = await db.select().from(dealReviewMarkers);
    const markerMap = new Map(markers.map((m) => [m.dealId, m.lastReviewedAt]));
    let dealsWithChanges = 0;
    const movers: { dealId: string; dealName: string; changeCount: number }[] =
      [];
    for (const d of deals) {
      const since = markerMap.get(d.id);
      if (!since) continue;
      const changes = await db
        .select({ id: dealAuditLog.id })
        .from(dealAuditLog)
        .where(
          and(
            eq(dealAuditLog.dealId, d.id),
            gt(dealAuditLog.changedAt, since),
          ),
        );
      if (changes.length > 0) {
        dealsWithChanges += 1;
        movers.push({
          dealId: d.id,
          dealName: d.dealName,
          changeCount: changes.length,
        });
      }
    }
    movers.sort((a, b) => b.changeCount - a.changeCount);

    res.json(
      GetIntelligenceSummaryResponse.parse({
        data: {
          totalDealsMonitored: deals.length,
          totalTCV,
          reportingCurrency,
          dealsByHealth,
          dealsByStage,
          criticalAlerts: criticalAlerts.slice(0, 10),
          staleDeals: staleDeals.slice(0, 10),
          changesSinceLastReview: {
            dealsWithChanges,
            topMovers: movers.slice(0, 5),
          },
        },
      }),
    );
  },
);

interface PortfolioRecord {
  accountManager: string;
  technicalLead: string;
  daysInStage: number;
  alertCodes: string[];
  products: string[];
  stalled: boolean;
}

function correlations(
  records: PortfolioRecord[],
  globalShares: Map<string, number>,
) {
  const codeCounts = new Map<string, number>();
  for (const r of records) {
    for (const code of new Set(r.alertCodes)) {
      codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    }
  }
  const out: { code: string; share: number; lift: number }[] = [];
  for (const [code, count] of codeCounts) {
    const share = records.length > 0 ? count / records.length : 0;
    const global = globalShares.get(code) ?? 0;
    const lift = global > 0 ? share / global : 0;
    out.push({ code, share, lift });
  }
  out.sort((a, b) => b.share - a.share);
  return out;
}

router.get(
  "/intelligence/portfolio-analysis",
  async (_req: Request, res: Response) => {
    const deals = await loadActiveIntel();
    const records: PortfolioRecord[] = deals.map((d) => ({
      accountManager: d.team.accountManager,
      technicalLead: d.team.technicalLead,
      daysInStage: d.daysInStage,
      alertCodes: [...d.governance.alerts, ...d.governance.managedAlerts].map(
        (a) => a.code,
      ),
      products: d.financials.crossSells.map((c) => c.productName),
      stalled: d.governance.alerts.some(
        (a) => a.code === "STALLED_VALIDATION",
      ),
    }));

    const globalShares = new Map<string, number>();
    {
      const codeCounts = new Map<string, number>();
      for (const r of records) {
        for (const code of new Set(r.alertCodes)) {
          codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
        }
      }
      for (const [code, count] of codeCounts) {
        globalShares.set(code, records.length > 0 ? count / records.length : 0);
      }
    }

    const groupBy = (key: "accountManager" | "technicalLead") => {
      const groups = new Map<string, PortfolioRecord[]>();
      for (const r of records) {
        const k = r[key] || "Unassigned";
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(r);
      }
      return groups;
    };

    const amGroups = groupBy("accountManager");
    const byAccountManager = [...amGroups.entries()].map(([am, recs]) => ({
      accountManager: am,
      dealCount: recs.length,
      alertCorrelations: correlations(recs, globalShares),
      avgCycleTimeDays:
        recs.reduce((s, r) => s + r.daysInStage, 0) / Math.max(1, recs.length),
    }));

    const tlGroups = groupBy("technicalLead");
    const byTechnicalLead = [...tlGroups.entries()]
      .filter(([tl]) => tl !== "Unassigned")
      .map(([tl, recs]) => ({
        technicalLead: tl,
        dealCount: recs.length,
        alertCorrelations: correlations(recs, globalShares),
        avgCycleTimeDays:
          recs.reduce((s, r) => s + r.daysInStage, 0) /
          Math.max(1, recs.length),
      }));

    const noTlRecs = tlGroups.get("Unassigned") ?? [];
    const noTechnicalLeadCycleTimeDays =
      noTlRecs.length > 0
        ? noTlRecs.reduce((s, r) => s + r.daysInStage, 0) / noTlRecs.length
        : null;

    const productGroups = new Map<string, PortfolioRecord[]>();
    for (const r of records) {
      for (const product of new Set(r.products)) {
        if (!productGroups.has(product)) productGroups.set(product, []);
        productGroups.get(product)!.push(r);
      }
    }
    const totalStalled = records.filter((r) => r.stalled).length;
    const byProduct = [...productGroups.entries()].map(([product, recs]) => ({
      productName: product,
      dealCount: recs.length,
      presentInStalledShare:
        totalStalled > 0
          ? recs.filter((r) => r.stalled).length / totalStalled
          : 0,
      alertCorrelations: correlations(recs, globalShares),
    }));

    res.json(
      GetPortfolioAnalysisResponse.parse({
        data: {
          byAccountManager,
          byTechnicalLead,
          byProduct,
          noTechnicalLeadCycleTimeDays,
        },
      }),
    );
  },
);

router.get("/analytics/autopsy", async (req: Request, res: Response) => {
  const q = GetAutopsyQueryParams.parse(req.query);

  const lostRows = await db
    .select({
      id: enterpriseDeals.id,
      lossArchetypeId: enterpriseDeals.lossArchetypeId,
      archetypeName: lossArchetypes.archetypeName,
    })
    .from(enterpriseDeals)
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .innerJoin(
      lossArchetypes,
      eq(enterpriseDeals.lossArchetypeId, lossArchetypes.id),
    )
    .where(eq(pipelineStages.stageName, "Closed-Lost"));

  const filtered = q.archetypeId
    ? lostRows.filter((r) => r.lossArchetypeId === q.archetypeId)
    : lostRows;

  const groups = new Map<
    number,
    { name: string; deals: Intel[] }
  >();
  for (const row of filtered) {
    const intel = await assembleDealIntelligence(row.id);
    if (!intel) continue;
    const aid = row.lossArchetypeId!;
    if (!groups.has(aid)) {
      groups.set(aid, { name: row.archetypeName, deals: [] });
    }
    groups.get(aid)!.deals.push(intel);
  }

  const byArchetype = [...groups.entries()].map(([archetypeId, group]) => {
    const lossCount = group.deals.length;
    const avgGateCompletionPct =
      group.deals.reduce(
        (s, d) => s + d.technicalTrack.progressPercentage,
        0,
      ) / Math.max(1, lossCount);
    const servicesAttachShare =
      group.deals.filter((d) => d.financials.servicesTier !== "None").length /
      Math.max(1, lossCount);
    const patternCounts = new Map<string, number>();
    for (const d of group.deals) {
      for (const a of [
        ...d.governance.alerts,
        ...d.governance.managedAlerts,
      ]) {
        patternCounts.set(a.code, (patternCounts.get(a.code) ?? 0) + 1);
      }
    }
    const patternsThatFired = [...patternCounts.entries()]
      .map(([code, count]) => ({ code, share: count / Math.max(1, lossCount) }))
      .sort((a, b) => b.share - a.share);
    const neverPassedGate2 = group.deals.filter((d) =>
      d.technicalTrack.gates.some((g) => g.gateGroup <= 2 && !g.isCompleted),
    ).length;
    return {
      archetypeId,
      archetypeName: group.name,
      lossCount,
      avgGateCompletionPct,
      servicesAttachShare,
      patternsThatFired,
      neverPassedGate2Share: neverPassedGate2 / Math.max(1, lossCount),
    };
  });

  res.json(GetAutopsyResponse.parse({ data: { byArchetype } }));
});

export default router;
