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
  type Alert,
  type Severity,
  type Explanation,
} from "@workspace/engine";
import { competitorWinRates } from "./competitive";
import { getDealWithLookups, getLiveDispositions } from "./intelligence";

/** An alert shaped to match the engine `Alert` consumed by the intelligence response. */
export interface MergeableAlert {
  code: string;
  severity: Severity;
  message: string;
  explanation: Explanation;
  disposition: Alert["disposition"];
}

/**
 * Compute the V2 competitive (F2) and stakeholder (F8) risk alerts for a deal so
 * they surface alongside the built-in engine patterns in the cockpit Risk tab.
 *
 * ## These carry dispositions, and getting that wrong was invisible
 *
 * These alerts never pass through the engine, so nothing here partitions them
 * into managed/unmanaged for us — this function has to attach the disposition
 * itself. It used to hardcode `null`, and because `routes/dispositions.ts`
 * validates only that the *deal* exists (never that the pattern code is one the
 * engine knows), dispositioning one of these returned 200 and wrote a real row
 * that no read ever looked at. The alert reappeared undispositioned on the very
 * next refetch, so the write looked like a no-op while quietly accumulating
 * rows. It also meant `isBlockingRedAlert` could never see an `accept` here, so
 * a RED contextual alert blocked stage advancement permanently.
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

  const contextual = [...competitive, ...stakeholderAlerts];
  if (contextual.length === 0) return [];

  // Read dispositions only once there is something they could apply to. Both
  // reads are served by the per-request cache in the callers that already
  // loaded the deal (the stage guardrail in routes/deals.ts is one).
  const dealRow = await getDealWithLookups(catalystApp, dealId);
  const dispositions = dealRow
    ? await getLiveDispositions(catalystApp, dealId, dealRow.deal)
    : [];
  const dispositionByCode = new Map(dispositions.map((d) => [d.pattern_code, d]));

  return contextual.map((a) => {
    const disp = dispositionByCode.get(a.code);
    return {
      code: a.code,
      severity: a.severity,
      message: a.message,
      explanation: {
        inputs: [],
        thresholdsUsed: [],
        clearsWhen:
          "Resolve the underlying competitive or stakeholder condition that triggered this alert.",
      },
      // Mirrors the engine's own mapping in buildAlert (lib/engine/src/index.ts)
      // — these alerts bypass the engine, so the shape has to be built here.
      disposition: disp
        ? {
            state: disp.disposition,
            rationale: disp.rationale || null,
            snoozeUntilFieldChange: disp.snooze_until_field_change || null,
            snoozeUntil: disp.snooze_until || null,
            createdBy: disp.created_by || null,
            createdAt: disp.created_at || null,
          }
        : null,
    };
  });
}
