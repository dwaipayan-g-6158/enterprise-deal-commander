// Catalyst-backed reimplementation of ../contextual-alerts.ts — see the
// module docstring in ./intelligence.ts for why this is a parallel file
// rather than an in-place rewrite.
import {
  type CatalystApp,
  createDealCompetitorsRepo,
  createCompetitorsRepo,
  createDealTechnicalGatesRepo,
  createStakeholdersRepo,
} from "@workspace/db/catalyst";
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
export async function contextualAlertsFor(catalystApp: CatalystApp, dealId: string): Promise<MergeableAlert[]> {
  // Global per-competitor win rate (Won Against / (Won + Lost)), via the shared
  // cached helper. No history → 0 (preserves the prior inline behavior).
  const rates = await competitorWinRates(catalystApp);
  const winRate = (competitorId: number) => rates.get(competitorId)?.winRate ?? 0;

  const [dealCompetitorLinks, allCompetitors] = await Promise.all([
    createDealCompetitorsRepo(catalystApp).list(dealId),
    createCompetitorsRepo(catalystApp).listAll(),
  ]);
  const competitorNameById = new Map(allCompetitors.map((c) => [c.id, c.name]));
  const dealLinks = dealCompetitorLinks.map((l) => ({
    competitorId: l.competitorId,
    name: competitorNameById.get(l.competitorId) ?? null,
    status: l.status,
  }));
  const activeCompetitors = dealLinks.filter((l) => l.status === "Active").length;

  // Technical progress for the bake-off pattern.
  const gates = await createDealTechnicalGatesRepo(catalystApp).list(dealId);
  const technicalProgressPct = gates.length
    ? Math.round((gates.filter((g) => g.isCompleted).length / gates.length) * 100)
    : 0;

  const competitive = evaluateCompetitivePatterns({
    activeCompetitors,
    technicalProgressPct,
    competitorProfiles: dealLinks.map((l) => ({
      competitorName: l.name ?? "Unknown",
      status: l.status,
      ourWinRate: winRate(l.competitorId),
    })),
  });

  const people = await createStakeholdersRepo(catalystApp).list(dealId);
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
