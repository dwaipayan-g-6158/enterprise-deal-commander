import { and, eq } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  dealMemory,
  stakeholders,
  dealTechnicalGates,
  dealCompetitors,
  dealPlaybookAssignments,
  playbooks,
  playbookSteps,
  playbookStepCompletions,
} from "@workspace/db";
import { competitorWinRates } from "./competitive";

export interface MeddpiccSuggestion {
  questionOrder: number;
  suggestedScore: number;
  reason: string;
}

async function suggestEconomicBuyerKnown(dealId: string): Promise<MeddpiccSuggestion> {
  const [eb] = await db
    .select({ id: stakeholders.id })
    .from(stakeholders)
    .where(and(eq(stakeholders.dealId, dealId), eq(stakeholders.roleType, "Economic Buyer")))
    .limit(1);
  return {
    questionOrder: 6,
    suggestedScore: eb ? 3 : 0,
    reason: eb
      ? "An Economic Buyer stakeholder is tracked on this deal"
      : "No stakeholder tagged Economic Buyer yet",
  };
}

async function suggestBudgetApproved(dealId: string): Promise<MeddpiccSuggestion> {
  const gates = await db
    .select({ gateCode: dealTechnicalGates.gateCode, isCompleted: dealTechnicalGates.isCompleted })
    .from(dealTechnicalGates)
    .where(eq(dealTechnicalGates.dealId, dealId));
  const executiveAgreed = gates.some((g) => g.isCompleted && g.gateCode === "G1_EXECUTIVE_AGREED");
  return {
    questionOrder: 9,
    suggestedScore: executiveAgreed ? 3 : 0,
    reason: executiveAgreed
      ? "Executive-agreement gate is completed"
      : "Executive-agreement gate not yet completed",
  };
}

async function suggestChampionIdentified(dealId: string): Promise<MeddpiccSuggestion> {
  const champions = await db
    .select({ id: stakeholders.id })
    .from(stakeholders)
    .where(and(eq(stakeholders.dealId, dealId), eq(stakeholders.sentiment, "Champion")));
  return {
    questionOrder: 34,
    suggestedScore: champions.length > 0 ? 3 : 1,
    reason:
      champions.length > 0
        ? `${champions.length} stakeholder(s) tagged Champion`
        : "No stakeholder tagged Champion yet",
  };
}

async function suggestExistingCustomer(dealId: string): Promise<MeddpiccSuggestion | null> {
  const [deal] = await db
    .select({ accountName: enterpriseDeals.accountName })
    .from(enterpriseDeals)
    .where(eq(enterpriseDeals.id, dealId))
    .limit(1);
  if (!deal) return null;
  const [wonBefore] = await db
    .select({ id: dealMemory.id })
    .from(dealMemory)
    .where(and(eq(dealMemory.accountName, deal.accountName), eq(dealMemory.outcome, "Won")))
    .limit(1);
  return {
    questionOrder: 24,
    suggestedScore: wonBefore ? 3 : 2,
    reason: wonBefore
      ? `${deal.accountName} has a prior Won deal on record`
      : `No prior Won deal on record for ${deal.accountName} — treated as a net-new relationship`,
  };
}

async function suggestCompetitionAdvantage(dealId: string): Promise<MeddpiccSuggestion | null> {
  const rows = await db
    .select({ competitorId: dealCompetitors.competitorId })
    .from(dealCompetitors)
    .where(eq(dealCompetitors.dealId, dealId));
  if (rows.length === 0) return null;
  const winRates = await competitorWinRates();
  const rates = rows
    .map((r) => winRates.get(r.competitorId)?.winRate)
    .filter((r): r is number => typeof r === "number");
  if (rates.length === 0) return null;
  const avg = rates.reduce((s, r) => s + r, 0) / rates.length;
  const suggestedScore = Math.min(3, Math.max(0, Math.round(avg * 3)));
  return {
    questionOrder: 39,
    suggestedScore,
    reason: `Average historical win rate vs. ${rates.length} tracked competitor(s): ${Math.round(avg * 100)}%`,
  };
}

const PAPER_PROCESS_PLAYBOOK = "Procurement / Legal Playbook";

async function completedStepNames(dealId: string, playbookName: string): Promise<Set<string> | null> {
  const [assignment] = await db
    .select({ id: dealPlaybookAssignments.id })
    .from(dealPlaybookAssignments)
    .innerJoin(playbooks, eq(dealPlaybookAssignments.playbookId, playbooks.id))
    .where(and(eq(dealPlaybookAssignments.dealId, dealId), eq(playbooks.playbookName, playbookName)))
    .limit(1);
  if (!assignment) return null; // no assignment yet — nothing to suggest from

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

async function suggestPaperProcessSteps(dealId: string): Promise<MeddpiccSuggestion[]> {
  const completed = await completedStepNames(dealId, PAPER_PROCESS_PLAYBOOK);
  if (completed === null) return [];

  const redlinesDone = completed.has("Resolve legal redlines");
  const ndaDone = completed.has("NDA, DPA & compliance evidence provided");
  return [
    {
      questionOrder: 21,
      suggestedScore: redlinesDone ? 3 : 0,
      reason: redlinesDone
        ? '"Resolve legal redlines" playbook step is completed'
        : '"Resolve legal redlines" playbook step not yet completed',
    },
    {
      questionOrder: 22,
      suggestedScore: ndaDone ? 3 : 0,
      reason: ndaDone
        ? '"NDA, DPA & compliance evidence provided" playbook step is completed'
        : '"NDA, DPA & compliance evidence provided" playbook step not yet completed',
    },
  ];
}

export async function getMeddpiccSuggestions(dealId: string): Promise<MeddpiccSuggestion[]> {
  const [eb, budget, champion, existingCustomer, competition, paperProcess] = await Promise.all([
    suggestEconomicBuyerKnown(dealId),
    suggestBudgetApproved(dealId),
    suggestChampionIdentified(dealId),
    suggestExistingCustomer(dealId),
    suggestCompetitionAdvantage(dealId),
    suggestPaperProcessSteps(dealId),
  ]);
  return [eb, budget, champion, existingCustomer, competition, ...paperProcess].filter(
    (s): s is MeddpiccSuggestion => s !== null,
  );
}
