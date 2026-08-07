import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import crypto from "node:crypto";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  createStakeholdersRepo,
  createDealTechnicalGatesRepo,
  createDealCompetitorsRepo,
  createCompetitorsRepo,
  formatCatalystDateTime,
} from "@workspace/db/catalyst";
import { QUESTION_CATALOG } from "@workspace/engine";
import {
  installCatalystFake,
  seedStandardLookups,
  STAGES,
  PRICING_MODEL_ID,
  SERVICES_TIER_ID,
  type CatalystTestStore,
} from "../../test-support/catalyst-test-app";
import {
  computeMeddpiccScoreForDeal,
  getMeddpiccAssessment,
  recalculateMeddpiccAssessment,
  upsertMeddpiccAnswer,
} from "./meddpicc";
import { cache } from "../cache";

// Ported from the Drizzle `lib/meddpicc-playbook-gate.test.ts`. The gate is the
// one place MEDDPICC writes back into the playbook, and the rule it enforces is
// asymmetric: the system may complete and re-open its OWN grant, but must never
// touch a step a human acted on.

const ACTOR = "vitest";
const MEDDPICC_STEP_NAME = "MEDDPICC qualification scored";
const DISCOVERY_PLAYBOOK = "Discovery / Qualification Playbook";

let store: CatalystTestStore;
let seq = 0;
let playbookId: string;
let meddpiccStepId: string;

const app = () => initCatalystApp({ headers: {} });

function seedQuestions(): void {
  store.seedRaw(
    "v2_meddpicc_questions",
    QUESTION_CATALOG.map((q) => ({
      id: crypto.randomUUID(),
      question_order: String(q.questionOrder),
      pillar: q.pillar,
      stage_tag: q.stageTag,
      question_text: q.questionText,
      help_text: q.helpText ?? null,
    })),
  );
}

/** The Discovery playbook, with the MEDDPICC step the gate looks for by name. */
function seedDiscoveryPlaybook(): void {
  playbookId = crypto.randomUUID();
  meddpiccStepId = crypto.randomUUID();
  store.seedRaw("v2_playbooks", [
    {
      id: playbookId,
      playbook_name: DISCOVERY_PLAYBOOK,
      applicable_stage: "Discovery",
      is_active: "true",
      created_by: "seed",
      created_at: formatCatalystDateTime(new Date()),
    },
  ]);
  store.seedRaw("v2_playbook_steps", [
    {
      id: meddpiccStepId,
      playbook_id: playbookId,
      step_order: "1",
      step_name: MEDDPICC_STEP_NAME,
      recommended_action: "Score the deal against MEDDPICC",
      expected_duration_days: "3",
      is_critical: "true",
      natural_key: `${playbookId}:1`,
    },
    {
      id: crypto.randomUUID(),
      playbook_id: playbookId,
      step_order: "2",
      step_name: "Other Discovery step",
      recommended_action: "a",
      expected_duration_days: "3",
      is_critical: "false",
      natural_key: `${playbookId}:2`,
    },
  ]);
}

function assignDiscoveryPlaybook(dealId: string): string {
  const id = crypto.randomUUID();
  store.seedRaw("v2_deal_playbook_assignments", [
    {
      id,
      deal_id: dealId,
      playbook_id: playbookId,
      current_step_id: meddpiccStepId,
      status: "Active",
      assigned_at: formatCatalystDateTime(new Date()),
      completed_at: null,
      natural_key: `${dealId}:${playbookId}`,
    },
  ]);
  return id;
}

function seedCompletion(
  assignmentId: string,
  status: string,
  completedBy: string,
  skipReason?: string,
): void {
  store.seedRaw("v2_playbook_step_completions", [
    {
      id: crypto.randomUUID(),
      assignment_id: assignmentId,
      step_id: meddpiccStepId,
      completed_at: formatCatalystDateTime(new Date()),
      skipped: status === "skipped" ? "true" : "false",
      skip_reason: skipReason ?? null,
      status,
      completed_by: completedBy,
    },
  ]);
}

function stepRows(assignmentId: string) {
  return store
    .rows("v2_playbook_step_completions")
    .filter((r) => r["assignment_id"] === assignmentId && r["step_id"] === meddpiccStepId);
}

function stepStatus(assignmentId: string): string | undefined {
  return stepRows(assignmentId)[0]?.["status"];
}

function scoreRowCount(dealId: string): number {
  return store.rows("v2_deal_meddpicc_scores").filter((r) => r["deal_id"] === dealId).length;
}

async function createDiscoveryDeal(accountName?: string): Promise<string> {
  const acct = accountName ?? `Playbook Gate Acct ${++seq}`;
  const deal = await createEnterpriseDealsRepo(app()).create({
    dealName: `Playbook Gate Test ${seq}`,
    accountName: acct,
    accountManager: "AM",
    technicalLead: "TL",
    salesStageId: STAGES.Discovery,
    pricingModelId: PRICING_MODEL_ID,
    servicesTierId: SERVICES_TIER_ID,
    productRevenue: "100000",
    servicesRevenue: "0",
    contractTermYears: 1,
    dealCurrency: "USD",
  });
  return deal.id;
}

async function answerAllGreen(dealId: string): Promise<void> {
  for (let order = 1; order <= 8; order++) {
    await upsertMeddpiccAnswer(app(), dealId, order, { score: 3 }, ACTOR);
  }
}

beforeAll(() => {
  ({ store } = installCatalystFake());
});

beforeEach(() => {
  store.reset();
  seq = 0;
  seedStandardLookups(store);
  seedQuestions();
  seedDiscoveryPlaybook();
  cache.clear();
});

describe("MEDDPICC playbook gate", () => {
  it("auto-completes the MEDDPICC step when the score reaches Green via manual answers", async () => {
    const dealId = await createDiscoveryDeal();
    const assignmentId = assignDiscoveryPlaybook(dealId);

    await answerAllGreen(dealId);
    // The real PATCH route recalculates (persists + syncs the gate) right after
    // every upsert — mirror that here, since this test calls the lib function
    // directly and needs the gate-sync side effect only the write path triggers.
    await recalculateMeddpiccAssessment(app(), dealId);

    expect(stepStatus(assignmentId)).toBe("completed");
  });

  it("does not auto-complete the step if the rep already skipped it explicitly", async () => {
    const dealId = await createDiscoveryDeal();
    const assignmentId = assignDiscoveryPlaybook(dealId);
    seedCompletion(assignmentId, "skipped", ACTOR, "Not applicable for this deal");

    await answerAllGreen(dealId);
    // Confirm the score actually reached Green before asserting the skip was
    // respected — otherwise this passes vacuously even if the auto-complete
    // check were broken, because it would simply never have run.
    const assessment = await recalculateMeddpiccAssessment(app(), dealId);
    expect(assessment?.score.ragStatus).toBe("Green");

    expect(stepStatus(assignmentId)).toBe("skipped"); // untouched — rep's decision
  });

  it("produces exactly one completion row when computeMeddpiccScoreForDeal is called twice back-to-back", async () => {
    const dealId = await createDiscoveryDeal();
    const assignmentId = assignDiscoveryPlaybook(dealId);
    await answerAllGreen(dealId);

    // Two calls in flight simultaneously, with no await between them — the race
    // the per-assignment serialization in meddpicc-playbook-gate.ts guards.
    await Promise.all([
      computeMeddpiccScoreForDeal(app(), dealId),
      computeMeddpiccScoreForDeal(app(), dealId),
    ]);

    expect(stepStatus(assignmentId)).toBe("completed");
    expect(stepRows(assignmentId)).toHaveLength(1);
  });

  it("auto-completes purely from auto-computed answers, with zero manual answers ever given", async () => {
    const accountName = "Auto Signals Acct";
    const dealId = await createDiscoveryDeal(accountName);
    const assignmentId = assignDiscoveryPlaybook(dealId);

    // Economic Buyer + Decision Process (2+ decision-makers) + Champion signals.
    const stakeholders = createStakeholdersRepo(app());
    await stakeholders.create(dealId, {
      name: "Big Boss",
      roleType: "Economic Buyer",
      influenceLevel: "High",
      sentiment: "Champion",
      isDecisionMaker: true,
    });
    await stakeholders.create(dealId, {
      name: "Second Decider",
      roleType: "Influencer",
      influenceLevel: "High",
      sentiment: "Neutral",
      isDecisionMaker: true,
    });

    // Decision Criteria + Economic Buyer + Champion + partial Paper Process gates.
    const gates = createDealTechnicalGatesRepo(app());
    for (const gateCode of [
      "G1_EXECUTIVE_AGREED",
      "G1_CRITERIA_LOCKED",
      "G2_CHAMPION_DEFENSIBLE",
      "G4_COMPLIANCE_VALIDATED",
    ]) {
      await gates.upsert(dealId, gateCode, {
        isCompleted: true,
        completedAt: new Date(),
        completedBy: "test",
        notes: null,
      });
    }

    // Identify Pain: prior Won deal for this account.
    store.seedRaw("v2_deal_memory", [
      {
        id: crypto.randomUUID(),
        deal_id: "00000000-0000-0000-0000-000000000000",
        account_name: accountName,
        deal_name: "Prior Deal",
        outcome: "Won",
      },
    ]);

    // Competition: a tracked competitor already "Won Against" gives a 100%
    // historical win rate for that competitor.
    const competitor = await createCompetitorsRepo(app()).create({ name: "Gate Test Competitor" });
    await createDealCompetitorsRepo(app()).create({
      dealId,
      competitorId: competitor.id,
      status: "Won Against",
    });
    // The win-rate lookup is cached in-process; clear it so this fixture's data
    // is never shadowed by an earlier (empty) result.
    cache.clear();

    // Totals Economic Buyer(3) + Decision Criteria(3) + Decision Process(3) +
    // Paper Process(1, gate only) + Identify Pain(3) + Champion(3) +
    // Competition(3) = 19 of 24 (79%) — Green (>75) — with Metrics, the one
    // manual-only question, left completely unanswered.
    const assessment = await recalculateMeddpiccAssessment(app(), dealId);
    expect(assessment?.score.ragStatus).toBe("Green");
    expect(assessment?.answers.find((a) => a.questionOrder === 1)?.source).toBe("unanswered");

    expect(stepStatus(assignmentId)).toBe("completed");
  });

  it("reopens a system-completed step when the score subsequently drops below Green", async () => {
    const dealId = await createDiscoveryDeal();
    const assignmentId = assignDiscoveryPlaybook(dealId);

    await answerAllGreen(dealId);
    let assessment = await recalculateMeddpiccAssessment(app(), dealId);
    expect(assessment?.score.ragStatus).toBe("Green");
    expect(stepStatus(assignmentId)).toBe("completed");

    // For Discovery (Qualification bucket), stagePct only counts stageTag-"Q"
    // questions: 1 (Metrics), 3 (DecisionCriteria), 4 (DecisionProcess),
    // 6 (IdentifyPain), 8 (Competition) = 5 questions, 15 max. Start at 15/15
    // (100% Green); dropping 1 and 3 to zero gives 9/15 (60%) — Amber.
    await upsertMeddpiccAnswer(app(), dealId, 1, { score: 0 }, ACTOR);
    await upsertMeddpiccAnswer(app(), dealId, 3, { score: 0 }, ACTOR);
    assessment = await recalculateMeddpiccAssessment(app(), dealId);
    expect(assessment?.score.ragStatus).not.toBe("Green");
    expect(stepStatus(assignmentId)).toBeUndefined();
  });

  it("does not reopen a step a rep manually completed, even when the score is Red", async () => {
    const dealId = await createDiscoveryDeal();
    const assignmentId = assignDiscoveryPlaybook(dealId);
    // Simulates the manual "set step state" route, which persists the acting
    // rep's name as completedBy (not "system").
    seedCompletion(assignmentId, "completed", "A Human Rep");

    const assessment = await recalculateMeddpiccAssessment(app(), dealId);
    expect(assessment?.score.ragStatus).toBe("Red"); // brand-new deal, no signals

    expect(stepStatus(assignmentId)).toBe("completed"); // a human's call, not the system's
    expect(stepRows(assignmentId)[0]?.["completed_by"]).toBe("A Human Rep");
  });

  it("does no harm when the deal has no assignment for the Discovery playbook", async () => {
    // The early return in syncMeddpiccPlaybookGate. Without it, reaching Green
    // on an unassigned deal would throw inside the score write path.
    const dealId = await createDiscoveryDeal();
    await answerAllGreen(dealId);

    const assessment = await recalculateMeddpiccAssessment(app(), dealId);
    expect(assessment?.score.ragStatus).toBe("Green");
    expect(store.rows("v2_playbook_step_completions")).toHaveLength(0);
  });

  it("getMeddpiccAssessment (read path) does not append a new dealMeddpiccScores row", async () => {
    const dealId = await createDiscoveryDeal();
    await getMeddpiccAssessment(app(), dealId);
    const countAfterFirst = scoreRowCount(dealId);
    await getMeddpiccAssessment(app(), dealId);
    expect(scoreRowCount(dealId)).toBe(countAfterFirst);
    expect(countAfterFirst).toBe(0);
  });
});
