import type { QueryClient } from "@tanstack/react-query";
import {
  getGetDealIntelligenceQueryKey,
  getGetDealQueryKey,
  getGetDealScoreQueryKey,
  getGetPlaybookJourneyQueryKey,
  getGetRosterEnrichmentQueryKey,
  getListGatesQueryKey,
  getListDealsQueryKey,
} from "@workspace/api-client-react";

/**
 * What each write has to refresh once the server has confirmed it.
 *
 * Kept in one file because the interesting part is not the mechanics but the
 * REACH — every one of these actions changes more than the panel it was
 * performed on, and the panels that go stale are the ones nobody thinks about
 * because they are one tap away.
 */

/**
 * Ticking a playbook step moves adherence, which the predictive score consumes
 * as a factor and the risk engine consumes as PLAYBOOK_EXECUTION_GAP. Refreshing
 * only the journey leaves the deal's own score contradicting its playbook.
 */
export function invalidatePlaybook(qc: QueryClient, dealId: string, assignmentId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: getGetPlaybookJourneyQueryKey(dealId) }),
    qc.invalidateQueries({ queryKey: getGetDealIntelligenceQueryKey(dealId) }),
    qc.invalidateQueries({ queryKey: getGetDealScoreQueryKey(dealId) }),
  ]);
}

/** Gates feed the technical track, which feeds risk. */
export function invalidateGates(qc: QueryClient, dealId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: getListGatesQueryKey(dealId) }),
    qc.invalidateQueries({ queryKey: getGetDealIntelligenceQueryKey(dealId) }),
    qc.invalidateQueries({ queryKey: getGetDealScoreQueryKey(dealId) }),
  ]);
}

/**
 * A disposition changes the governance block, and an `accept` additionally
 * clears the stage guardrail — so the roster's own view of whether this deal can
 * advance is now wrong too.
 */
export function invalidateDisposition(qc: QueryClient, dealId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: getGetDealIntelligenceQueryKey(dealId) }),
    qc.invalidateQueries({ queryKey: getGetRosterEnrichmentQueryKey() }),
  ]);
}

/**
 * A stage change touches nearly everything.
 *
 * Roster enrichment is the one that is easy to miss and matters most: risk and
 * velocity are stage-dependent, nothing else refreshes it, and a stale
 * enrichment leaves every roster card showing the previous stage's health long
 * after the deal has moved.
 */
export function invalidateStage(qc: QueryClient, dealId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: getListDealsQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetRosterEnrichmentQueryKey() }),
    qc.invalidateQueries({ queryKey: getGetDealQueryKey(dealId) }),
    qc.invalidateQueries({ queryKey: getGetDealIntelligenceQueryKey(dealId) }),
    qc.invalidateQueries({ queryKey: getGetDealScoreQueryKey(dealId) }),
  ]);
}
