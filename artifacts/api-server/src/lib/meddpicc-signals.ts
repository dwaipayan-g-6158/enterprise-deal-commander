import { and, eq } from "drizzle-orm";
import {
  db,
  stakeholders,
  dealMemory,
  dealTechnicalGates,
  dealCompetitors,
  dealPlaybookAssignments,
  playbooks,
  playbookSteps,
  playbookStepCompletions,
} from "@workspace/db";
import { competitorWinRates } from "./competitive";

export interface MeddpiccComputedAnswer {
  questionOrder: number;
  score: number;
  reason: string;
}

async function computeEconomicBuyer(dealId: string): Promise<MeddpiccComputedAnswer> {
  const [ebRows, gates] = await Promise.all([
    db
      .select({ name: stakeholders.name })
      .from(stakeholders)
      .where(and(eq(stakeholders.dealId, dealId), eq(stakeholders.roleType, "Economic Buyer")))
      .limit(1),
    db
      .select({ gateCode: dealTechnicalGates.gateCode, isCompleted: dealTechnicalGates.isCompleted })
      .from(dealTechnicalGates)
      .where(eq(dealTechnicalGates.dealId, dealId)),
  ]);
  const eb = ebRows[0];
  const gateDone = gates.some((g) => g.isCompleted && g.gateCode === "G1_EXECUTIVE_AGREED");
  const score = eb && gateDone ? 3 : eb || gateDone ? 2 : 0;
  const reason = [
    eb ? `Economic Buyer tagged (${eb.name})` : "no Economic Buyer stakeholder tagged",
    gateDone ? "executive-agreement gate completed" : "executive-agreement gate not yet completed",
  ].join("; ");
  return { questionOrder: 2, score, reason };
}

async function computeDecisionCriteria(dealId: string): Promise<MeddpiccComputedAnswer> {
  const gates = await db
    .select({ gateCode: dealTechnicalGates.gateCode, isCompleted: dealTechnicalGates.isCompleted })
    .from(dealTechnicalGates)
    .where(eq(dealTechnicalGates.dealId, dealId));
  const done = gates.some((g) => g.isCompleted && g.gateCode === "G1_CRITERIA_LOCKED");
  return {
    questionOrder: 3,
    score: done ? 3 : 0,
    reason: done
      ? "Technical success criteria gate (G1_CRITERIA_LOCKED) completed"
      : "Technical success criteria gate not yet completed",
  };
}

async function computeDecisionProcess(dealId: string): Promise<MeddpiccComputedAnswer> {
  const rows = await db
    .select({ id: stakeholders.id })
    .from(stakeholders)
    .where(and(eq(stakeholders.dealId, dealId), eq(stakeholders.isDecisionMaker, true)));
  const count = rows.length;
  const score = count >= 2 ? 3 : count === 1 ? 2 : 0;
  const reason =
    count === 0
      ? "no stakeholders tagged as decision-makers yet"
      : `${count} stakeholder(s) tagged as decision-maker${count === 1 ? "" : "s"}`;
  return { questionOrder: 4, score, reason };
}

const PAPER_PROCESS_PLAYBOOK = "Procurement / Legal Playbook";

async function completedStepNames(dealId: string, playbookName: string): Promise<Set<string> | null> {
  const [assignment] = await db
    .select({ id: dealPlaybookAssignments.id })
    .from(dealPlaybookAssignments)
    .innerJoin(playbooks, eq(dealPlaybookAssignments.playbookId, playbooks.id))
    .where(and(eq(dealPlaybookAssignments.dealId, dealId), eq(playbooks.playbookName, playbookName)))
    .limit(1);
  if (!assignment) return null; // no assignment yet — nothing to compute from

  const rows = await db
    .select({ stepName: playbookSteps.stepName, status: playbookStepCompletions.status })
    .from(playbookSteps)
    .innerJoin(playbooks, eq(playbookSteps.playbookId, playbooks.id))
    .leftJoin(
      playbookStepCompletions,
      and(
        eq(playbookStepCompletions.assignmentId, assignment.id),
        eq(playbookStepCompletions.stepId, playbookSteps.id),
      ),
    )
    .where(eq(playbooks.playbookName, playbookName));
  return new Set(rows.filter((r) => r.status === "completed").map((r) => r.stepName));
}

async function computePaperProcess(dealId: string): Promise<MeddpiccComputedAnswer> {
  const [completed, gates] = await Promise.all([
    completedStepNames(dealId, PAPER_PROCESS_PLAYBOOK),
    db
      .select({ gateCode: dealTechnicalGates.gateCode, isCompleted: dealTechnicalGates.isCompleted })
      .from(dealTechnicalGates)
      .where(eq(dealTechnicalGates.dealId, dealId)),
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

async function computeIdentifyPain(dealId: string, accountName: string): Promise<MeddpiccComputedAnswer> {
  const [wonBefore] = await db
    .select({ id: dealMemory.id })
    .from(dealMemory)
    .where(and(eq(dealMemory.accountName, accountName), eq(dealMemory.outcome, "Won")))
    .limit(1);
  return {
    questionOrder: 6,
    score: wonBefore ? 3 : 2,
    reason: wonBefore
      ? `${accountName} has a prior Won deal on record`
      : `No prior Won deal on record for ${accountName} — treated as a net-new relationship`,
  };
}

async function computeChampion(dealId: string): Promise<MeddpiccComputedAnswer> {
  const [champions, gates] = await Promise.all([
    db
      .select({ name: stakeholders.name })
      .from(stakeholders)
      .where(and(eq(stakeholders.dealId, dealId), eq(stakeholders.sentiment, "Champion"))),
    db
      .select({ gateCode: dealTechnicalGates.gateCode, isCompleted: dealTechnicalGates.isCompleted })
      .from(dealTechnicalGates)
      .where(eq(dealTechnicalGates.dealId, dealId)),
  ]);
  const hasChampion = champions.length > 0;
  const gateDone = gates.some((g) => g.isCompleted && g.gateCode === "G2_CHAMPION_DEFENSIBLE");
  const score = hasChampion && gateDone ? 3 : hasChampion || gateDone ? 2 : 1;
  const reason = [
    hasChampion ? `Champion tagged (${champions.map((c) => c.name).join(", ")})` : "no Champion stakeholder tagged",
    gateDone ? "internal-defensibility gate completed" : "internal-defensibility gate not yet completed",
  ].join("; ");
  return { questionOrder: 7, score, reason };
}

async function computeCompetition(dealId: string): Promise<MeddpiccComputedAnswer> {
  const rows = await db
    .select({ competitorId: dealCompetitors.competitorId })
    .from(dealCompetitors)
    .where(eq(dealCompetitors.dealId, dealId));
  if (rows.length === 0) {
    return { questionOrder: 8, score: 0, reason: "no competitor tracked on this deal yet" };
  }
  const winRates = await competitorWinRates();
  const rates = rows
    .map((r) => winRates.get(r.competitorId)?.winRate)
    .filter((r): r is number => typeof r === "number");
  if (rates.length === 0) {
    return {
      questionOrder: 8,
      score: 0,
      reason: `${rows.length} competitor(s) tracked but no historical win-rate evidence yet`,
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
  dealId: string,
  accountName: string,
): Promise<MeddpiccComputedAnswer[]> {
  return Promise.all([
    computeEconomicBuyer(dealId),
    computeDecisionCriteria(dealId),
    computeDecisionProcess(dealId),
    computePaperProcess(dealId),
    computeIdentifyPain(dealId, accountName),
    computeChampion(dealId),
    computeCompetition(dealId),
  ]);
}
