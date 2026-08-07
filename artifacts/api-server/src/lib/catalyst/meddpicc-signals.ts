// Auto-computed MEDDPICC answers, derived from signals the deal already
// carries (stakeholders, gates, competitors, memory, playbook progress) rather
// than asked of the user.
//
// This began as a parallel Catalyst twin of a Drizzle `../meddpicc-signals.ts`
// that could not be retired while the periodic snapshot job ran off an
// in-process timer with no request to derive an app from. Catalyst Job
// Scheduling removed that constraint and the Drizzle original is gone; this is
// now the only implementation.
import {
  type CatalystApp,
  createStakeholdersRepo,
  createDealTechnicalGatesRepo,
  createDealCompetitorsRepo,
  createDealMemoryRepo,
  createPlaybooksRepo,
  createPlaybookStepsRepo,
  createPlaybookStepCompletionsRepo,
  createDealPlaybookAssignmentsRepo,
} from "@workspace/db/catalyst";
import { competitorWinRates } from "./competitive";

/** One auto-computed answer: which question it satisfies, the score it earns,
 *  and the human-readable evidence for that score. */
export interface MeddpiccComputedAnswer {
  questionOrder: number;
  score: number;
  reason: string;
}

async function computeEconomicBuyer(catalystApp: CatalystApp, dealId: string): Promise<MeddpiccComputedAnswer> {
  const [stakeholders, gates] = await Promise.all([
    createStakeholdersRepo(catalystApp).list(dealId),
    createDealTechnicalGatesRepo(catalystApp).list(dealId),
  ]);
  const eb = stakeholders.find((s) => s.roleType === "Economic Buyer");
  const gateDone = gates.some((g) => g.isCompleted && g.gateCode === "G1_EXECUTIVE_AGREED");
  const score = eb && gateDone ? 3 : eb || gateDone ? 2 : 0;
  const reason = [
    eb ? `Economic Buyer tagged (${eb.name})` : "no Economic Buyer stakeholder tagged",
    gateDone ? "executive-agreement gate completed" : "executive-agreement gate not yet completed",
  ].join("; ");
  return { questionOrder: 2, score, reason };
}

async function computeDecisionCriteria(catalystApp: CatalystApp, dealId: string): Promise<MeddpiccComputedAnswer> {
  const gates = await createDealTechnicalGatesRepo(catalystApp).list(dealId);
  const done = gates.some((g) => g.isCompleted && g.gateCode === "G1_CRITERIA_LOCKED");
  return {
    questionOrder: 3,
    score: done ? 3 : 0,
    reason: done
      ? "Technical success criteria gate (G1_CRITERIA_LOCKED) completed"
      : "Technical success criteria gate not yet completed",
  };
}

async function computeDecisionProcess(catalystApp: CatalystApp, dealId: string): Promise<MeddpiccComputedAnswer> {
  const stakeholders = await createStakeholdersRepo(catalystApp).list(dealId);
  const count = stakeholders.filter((s) => s.isDecisionMaker).length;
  const score = count >= 2 ? 3 : count === 1 ? 2 : 0;
  const reason =
    count === 0
      ? "no stakeholders tagged as decision-makers yet"
      : `${count} stakeholder(s) tagged as decision-maker${count === 1 ? "" : "s"}`;
  return { questionOrder: 4, score, reason };
}

const PAPER_PROCESS_PLAYBOOK = "Procurement / Legal Playbook";

/**
 * Which of a playbook's steps are completed for a given deal, or null if the
 * deal has no assignment for that playbook yet. Reimplements the original's
 * two-table join (assignment lookup, then steps+completions) as an explicit
 * ID intersection over the existing repos rather than a new joined query.
 */
async function completedStepNames(
  catalystApp: CatalystApp,
  dealId: string,
  playbookName: string,
): Promise<Set<string> | null> {
  const playbook = (await createPlaybooksRepo(catalystApp).listAll()).find((p) => p.playbookName === playbookName);
  if (!playbook) return null;
  const assignment = (await createDealPlaybookAssignmentsRepo(catalystApp).list(dealId)).find(
    (a) => a.playbookId === playbook.id,
  );
  if (!assignment) return null; // no assignment yet — nothing to compute from

  const [steps, completions] = await Promise.all([
    createPlaybookStepsRepo(catalystApp).listByPlaybookId(playbook.id),
    createPlaybookStepCompletionsRepo(catalystApp).listByAssignmentId(assignment.id),
  ]);
  const completedStepIds = new Set(completions.filter((c) => c.status === "completed").map((c) => c.stepId));
  return new Set(steps.filter((s) => completedStepIds.has(s.id)).map((s) => s.stepName));
}

async function computePaperProcess(catalystApp: CatalystApp, dealId: string): Promise<MeddpiccComputedAnswer> {
  const [completed, gates] = await Promise.all([
    completedStepNames(catalystApp, dealId, PAPER_PROCESS_PLAYBOOK),
    createDealTechnicalGatesRepo(catalystApp).list(dealId),
  ]);
  const redlinesDone = completed?.has("Resolve legal redlines") ?? false;
  const ndaDone = completed?.has("NDA, DPA & compliance evidence provided") ?? false;
  const complianceGateDone = gates.some((g) => g.isCompleted && g.gateCode === "G4_COMPLIANCE_VALIDATED");
  const score = [redlinesDone, ndaDone, complianceGateDone].filter(Boolean).length;
  const reason = `${score} of 3 signals complete: redlines ${redlinesDone ? "done" : "not done"}, NDA/DPA ${
    ndaDone ? "done" : "not done"
  }, compliance gate ${complianceGateDone ? "done" : "not done"}`;
  return { questionOrder: 5, score, reason };
}

async function computeIdentifyPain(catalystApp: CatalystApp, accountName: string): Promise<MeddpiccComputedAnswer> {
  const memory = await createDealMemoryRepo(catalystApp).listAll();
  const wonBefore = memory.some((m) => m.accountName === accountName && m.outcome === "Won");
  return {
    questionOrder: 6,
    score: wonBefore ? 3 : 2,
    reason: wonBefore
      ? `${accountName} has a prior Won deal on record`
      : `No prior Won deal on record for ${accountName} — treated as a net-new relationship`,
  };
}

async function computeChampion(catalystApp: CatalystApp, dealId: string): Promise<MeddpiccComputedAnswer> {
  const [stakeholders, gates] = await Promise.all([
    createStakeholdersRepo(catalystApp).list(dealId),
    createDealTechnicalGatesRepo(catalystApp).list(dealId),
  ]);
  const champions = stakeholders.filter((s) => s.sentiment === "Champion");
  const hasChampion = champions.length > 0;
  const gateDone = gates.some((g) => g.isCompleted && g.gateCode === "G2_CHAMPION_DEFENSIBLE");
  const score = hasChampion && gateDone ? 3 : hasChampion || gateDone ? 2 : 1;
  const reason = [
    hasChampion ? `Champion tagged (${champions.map((c) => c.name).join(", ")})` : "no Champion stakeholder tagged",
    gateDone ? "internal-defensibility gate completed" : "internal-defensibility gate not yet completed",
  ].join("; ");
  return { questionOrder: 7, score, reason };
}

async function computeCompetition(catalystApp: CatalystApp, dealId: string): Promise<MeddpiccComputedAnswer> {
  const links = await createDealCompetitorsRepo(catalystApp).list(dealId);
  if (links.length === 0) {
    return { questionOrder: 8, score: 0, reason: "no competitor tracked on this deal yet" };
  }
  const winRates = await competitorWinRates(catalystApp);
  const rates = links
    .map((l) => winRates.get(l.competitorId)?.winRate)
    .filter((r): r is number => typeof r === "number");
  if (rates.length === 0) {
    return {
      questionOrder: 8,
      score: 0,
      reason: `${links.length} competitor(s) tracked but no historical win-rate evidence yet`,
    };
  }
  const avg = rates.reduce((s, r) => s + r, 0) / rates.length;
  const score = Math.min(3, Math.max(0, Math.round(avg * 3)));
  return {
    questionOrder: 8,
    score,
    reason: `Average historical win rate vs. ${rates.length} tracked competitor(s): ${Math.round(avg * 100)}%`,
  };
}

export async function getMeddpiccComputedAnswers(
  catalystApp: CatalystApp,
  dealId: string,
  accountName: string,
): Promise<MeddpiccComputedAnswer[]> {
  return Promise.all([
    computeEconomicBuyer(catalystApp, dealId),
    computeDecisionCriteria(catalystApp, dealId),
    computeDecisionProcess(catalystApp, dealId),
    computePaperProcess(catalystApp, dealId),
    computeIdentifyPain(catalystApp, accountName),
    computeChampion(catalystApp, dealId),
    computeCompetition(catalystApp, dealId),
  ]);
}
