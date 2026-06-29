import { and, eq } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  pipelineStages,
  dealTechnicalGates,
  dealCompetitors,
  competitors,
  stakeholders,
} from "@workspace/db";
import {
  evaluateCompetitivePatterns,
  evaluateStakeholderPatterns,
  type Severity,
  type Explanation,
} from "@workspace/engine";
import { competitorWinRates } from "./competitive";

/** An alert shaped to match the engine `Alert` consumed by the intelligence response. */
export interface MergeableAlert {
  code: string;
  severity: Severity;
  message: string;
  explanation: Explanation;
  disposition: null;
}

/**
 * Compute the V2 competitive (F2) and stakeholder (F8) risk alerts for a deal so
 * they surface alongside the built-in engine patterns in the cockpit Risk tab.
 */
export async function contextualAlertsFor(dealId: string): Promise<MergeableAlert[]> {
  // Global per-competitor win rate (Won Against / (Won + Lost)), via the shared
  // cached helper. No history → 0 (preserves the prior inline behavior).
  const rates = await competitorWinRates();
  const winRate = (competitorId: number) => rates.get(competitorId)?.winRate ?? 0;

  const dealLinks = await db
    .select({
      competitorId: dealCompetitors.competitorId,
      name: competitors.name,
      status: dealCompetitors.status,
    })
    .from(dealCompetitors)
    .leftJoin(competitors, eq(dealCompetitors.competitorId, competitors.id))
    .where(eq(dealCompetitors.dealId, dealId));
  const activeCompetitors = dealLinks.filter((l) => l.status === "Active").length;

  // Technical progress for the bake-off pattern.
  const gates = await db
    .select({ isCompleted: dealTechnicalGates.isCompleted })
    .from(dealTechnicalGates)
    .where(eq(dealTechnicalGates.dealId, dealId));
  const technicalProgressPct = gates.length
    ? Math.round((gates.filter((g) => g.isCompleted).length / gates.length) * 100)
    : 0;

  void enterpriseDeals;
  void pipelineStages;
  void and;

  const competitive = evaluateCompetitivePatterns({
    activeCompetitors,
    technicalProgressPct,
    competitorProfiles: dealLinks.map((l) => ({
      competitorName: l.name ?? "Unknown",
      status: l.status,
      historicalWinRate: winRate(l.competitorId),
    })),
  });

  const people = await db
    .select({
      name: stakeholders.name,
      title: stakeholders.title,
      sentiment: stakeholders.sentiment,
      isDecisionMaker: stakeholders.isDecisionMaker,
    })
    .from(stakeholders)
    .where(eq(stakeholders.dealId, dealId));
  const stakeholderAlerts = evaluateStakeholderPatterns(
    people.map((p) => ({
      name: p.name,
      title: p.title,
      sentiment: p.sentiment,
      isDecisionMaker: p.isDecisionMaker,
    })),
  );

  return [...competitive, ...stakeholderAlerts].map((a) => ({
    code: a.code,
    severity: a.severity,
    message: a.message,
    explanation: {
      inputs: [],
      thresholdsUsed: [],
      clearsWhen:
        "Resolve the underlying competitive or stakeholder condition that triggered this alert.",
    },
    disposition: null,
  }));
}
