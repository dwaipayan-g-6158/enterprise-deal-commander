# MEDDPICC Simplification (43 -> 8 Questions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 43-question MEDDPICC catalog with 8 questions (one per
MEDDPICC letter). 7 are computed live from existing deal data every time the
score is fetched; 1 (Metrics) stays manual. A manual answer, once given, always
wins over the live-computed value until changed again.

**Architecture:** The pure engine (`lib/engine/src/meddpicc.ts`) only shrinks
its question catalog — its scoring math is already answer-source-agnostic. All
new behavior lives in `artifacts/api-server/src/lib/meddpicc-signals.ts`
(computes the 7 auto-answers from stakeholders/gates/playbooks/competitors/deal
memory) and `artifacts/api-server/src/lib/meddpicc.ts` (merges a manual answer
row, if one exists, over the live-computed value; exposes `source` +`reason`
per answer). The UI collapses from a 43-row collapsible-pillar tree to a flat
8-row list reusing the color-coded buttons shipped in the prior change.

**Tech Stack:** TypeScript, Drizzle ORM, Express 5, React 19, Vitest.

## Global Constraints

- The new 8-question catalog (exact `questionOrder`, `pillar`, `stageTag`,
  `questionText`, `helpText`) is defined once, in Task 1, and is the single
  source of truth every other task refers back to — do not invent alternate
  wording in later tasks.
- **Absence-of-signal defaults to 0 (Unknown) except two pillars that keep
  their already-shipped precedent:** Identify Pain never scores below 2 (a
  net-new account isn't a real "no"); Champion scores 1 (Strong No), not 0,
  when no champion is tagged and the gate isn't complete (an actively-checked
  absence is a real negative, not "we haven't looked").
- `isAutoSuggested` / `suggestedScore` are retired concepts — a
  `deal_meddpicc_answers` row's mere existence *is* the override signal now.
  **Do not** add a DB migration to drop the two now-unused Postgres columns —
  removing them from the Drizzle schema (TS side) is sufficient; Postgres
  defaults (`is_auto_suggested` has a `NOT NULL DEFAULT false`,
  `suggested_score` is nullable) mean the app works correctly with the columns
  physically still present but unreferenced. This avoids a destructive
  `ALTER TABLE` / interactive `db push` prompt for a single-developer local
  tool. If a future unrelated schema change runs `db push` and it offers to
  drop these orphaned columns, accepting that prompt then is fine.
- **The live database reset (deleting the old 43-question catalog and
  reseeding the new 8, via the self-healing `seedMeddpiccQuestions` in
  Task 4) must NOT be run by any task's implementer against the shared dev
  Postgres instance.** All 8 of the old catalog's `questionOrder` values
  1-43 already numerically cover the new catalog's 1-8 range, and the
  question *text* shown to users always comes from the `QUESTION_CATALOG`
  code constant (never from the DB row content) — so every task's automated
  tests pass correctly whether or not the live reseed has happened yet. The
  actual reseed is a one-time step performed once, at the very end of the
  whole plan, by rebuilding and restarting the API server and observing the
  self-heal log line. Do not add it to any task's test/verification steps.
- Every DB query touching `meddpiccQuestions` for merge/lookup purposes must
  filter to the new catalog's `questionOrder` values explicitly (e.g. via
  `inArray`) rather than assuming the table only contains 8 rows — the table
  may still contain the old 43 rows until the final reseed runs.

## The 8-question catalog (defined in Task 1, referenced everywhere)

| questionOrder | pillar | stageTag | questionText | helpText |
|---|---|---|---|---|
| 1 | Metrics | Q | "Is there a clear, quantifiable business case (ROI/value) for this deal?" | *(none — manual, no data source exists)* |
| 2 | EconomicBuyer | P | "Have we identified the Economic Buyer and secured executive agreement on evaluation criteria?" | "Auto-computed from a stakeholder tagged Economic Buyer and the G1_EXECUTIVE_AGREED gate." |
| 3 | DecisionCriteria | Q | "Are the customer's technical success criteria locked and documented?" | "Auto-computed from the G1_CRITERIA_LOCKED gate." |
| 4 | DecisionProcess | Q | "Have we identified the individuals with decision-making power in this deal?" | "Auto-computed from stakeholders flagged as decision-makers." |
| 5 | PaperProcess | N | "Is the legal/paper process (redlines, NDA/DPA, compliance) on track?" | "Auto-computed from Procurement/Legal playbook steps and the G4_COMPLIANCE_VALIDATED gate." |
| 6 | IdentifyPain | Q | "Do we understand the customer's pain and is this an existing relationship?" | "Auto-computed from prior Won deals with this account." |
| 7 | Champion | P | "Have we identified a Champion who can defend us internally?" | "Auto-computed from a stakeholder tagged Champion and the G2_CHAMPION_DEFENSIBLE gate." |
| 8 | Competition | Q | "Do we have a demonstrated competitive advantage against tracked competitors?" | "Auto-computed from tracked competitors and historical win-rate." |

`TOTAL_MAX = 8 x 3 = 24`. Stage buckets: Qualification = Q-tagged only (5
questions: 1,3,4,6,8 = 15 max); Proposition = Q+P (adds 2,7 = 21 max);
Negotiation = all 8 (24 max).

---

### Task 1: Engine catalog shrink

**Files:**
- Modify: `lib/engine/src/meddpicc.ts`
- Modify: `lib/engine/src/meddpicc.test.ts`

**Interfaces:**
- Produces: `QUESTION_CATALOG` (8 entries, per the table above) — every later
  task's `questionOrder` references (2 through 8) come from this file.
- `computeMeddpiccScore()`, `stageBucketForStageName()`, and all other exports
  keep their existing signatures unchanged.

- [ ] **Step 1: Replace `QUESTION_CATALOG`**

In `lib/engine/src/meddpicc.ts`, replace the entire `QUESTION_CATALOG` array
(currently 43 entries) with:

```ts
export const QUESTION_CATALOG: MeddpiccQuestion[] = [
  { questionOrder: 1, pillar: "Metrics", stageTag: "Q", questionText: "Is there a clear, quantifiable business case (ROI/value) for this deal?" },
  { questionOrder: 2, pillar: "EconomicBuyer", stageTag: "P", questionText: "Have we identified the Economic Buyer and secured executive agreement on evaluation criteria?", helpText: "Auto-computed from a stakeholder tagged Economic Buyer and the G1_EXECUTIVE_AGREED gate." },
  { questionOrder: 3, pillar: "DecisionCriteria", stageTag: "Q", questionText: "Are the customer's technical success criteria locked and documented?", helpText: "Auto-computed from the G1_CRITERIA_LOCKED gate." },
  { questionOrder: 4, pillar: "DecisionProcess", stageTag: "Q", questionText: "Have we identified the individuals with decision-making power in this deal?", helpText: "Auto-computed from stakeholders flagged as decision-makers." },
  { questionOrder: 5, pillar: "PaperProcess", stageTag: "N", questionText: "Is the legal/paper process (redlines, NDA/DPA, compliance) on track?", helpText: "Auto-computed from Procurement/Legal playbook steps and the G4_COMPLIANCE_VALIDATED gate." },
  { questionOrder: 6, pillar: "IdentifyPain", stageTag: "Q", questionText: "Do we understand the customer's pain and is this an existing relationship?", helpText: "Auto-computed from prior Won deals with this account." },
  { questionOrder: 7, pillar: "Champion", stageTag: "P", questionText: "Have we identified a Champion who can defend us internally?", helpText: "Auto-computed from a stakeholder tagged Champion and the G2_CHAMPION_DEFENSIBLE gate." },
  { questionOrder: 8, pillar: "Competition", stageTag: "Q", questionText: "Do we have a demonstrated competitive advantage against tracked competitors?", helpText: "Auto-computed from tracked competitors and historical win-rate." },
];
```

Do not change anything else in the file — `PILLAR_ORDER`, `TOTAL_MAX` (it's
computed as `QUESTION_CATALOG.length * 3`, so it auto-updates to 24),
`stageBucketForStageName`, `stageFilter`, `computeMeddpiccScore`, and all
type/interface declarations stay exactly as they are.

- [ ] **Step 2: Rewrite the test file**

Replace the full contents of `lib/engine/src/meddpicc.test.ts` with:

```ts
import { describe, it, expect } from "vitest";
import {
  QUESTION_CATALOG,
  computeMeddpiccScore,
  stageBucketForStageName,
  DEFAULT_MEDDPICC_THRESHOLDS,
  type MeddpiccQuestion,
} from "./meddpicc";

describe("MEDDPICC question catalog", () => {
  it("has exactly 8 questions", () => {
    expect(QUESTION_CATALOG).toHaveLength(8);
  });

  it("has unique, sequential questionOrder values 1-8", () => {
    const orders = QUESTION_CATALOG.map((q) => q.questionOrder).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: 8 }, (_, i) => i + 1));
  });

  it("stage-tag counts: 5 Q, 2 P, 1 N", () => {
    const byTag = (tag: string) => QUESTION_CATALOG.filter((q) => q.stageTag === tag).length;
    expect(byTag("Q")).toBe(5);
    expect(byTag("P")).toBe(2);
    expect(byTag("N")).toBe(1);
  });

  it("pillar max points sum to 24 (8 pillars x 3)", () => {
    const maxByPillar = new Map<string, number>();
    for (const q of QUESTION_CATALOG as MeddpiccQuestion[]) {
      maxByPillar.set(q.pillar, (maxByPillar.get(q.pillar) ?? 0) + 3);
    }
    expect(maxByPillar.size).toBe(8);
    const total = [...maxByPillar.values()].reduce((s, v) => s + v, 0);
    expect(total).toBe(24);
  });
});

describe("stageBucketForStageName", () => {
  it("maps Discovery to Qualification", () => {
    expect(stageBucketForStageName("Discovery")).toBe("Qualification");
  });
  it("maps Validation and Commercial to Proposition", () => {
    expect(stageBucketForStageName("Validation")).toBe("Proposition");
    expect(stageBucketForStageName("Commercial")).toBe("Proposition");
  });
  it("maps Procurement and Closed-Won to Negotiation", () => {
    expect(stageBucketForStageName("Procurement")).toBe("Negotiation");
    expect(stageBucketForStageName("Closed-Won")).toBe("Negotiation");
  });
  it("defaults unknown stage names to Negotiation (full model, safest default)", () => {
    expect(stageBucketForStageName("Some Future Stage")).toBe("Negotiation");
  });
});

describe("computeMeddpiccScore", () => {
  it("scores 0% overall and Red when nothing is answered", () => {
    const r = computeMeddpiccScore({}, "Negotiation");
    expect(r.overallScore).toBe(0);
    expect(r.overallPct).toBe(0);
    expect(r.ragStatus).toBe("Red");
    expect(r.pillarBreakdown).toHaveLength(8);
    expect(r.unknownCount).toBe(8);
    expect(r.strongNoCount).toBe(0);
  });

  it("scores 100% overall and Green when every question is a Strong Yes (3)", () => {
    const answers: Record<number, number> = {};
    for (const q of QUESTION_CATALOG) answers[q.questionOrder] = 3;
    const r = computeMeddpiccScore(answers, "Negotiation");
    expect(r.overallScore).toBe(24);
    expect(r.overallPct).toBe(100);
    expect(r.ragStatus).toBe("Green");
    expect(r.unknownCount).toBe(0);
  });

  it("Metrics pillar max is 3 (1 question) and reflects partial answers", () => {
    const r = computeMeddpiccScore({ 1: 2 }, "Negotiation");
    const metrics = r.pillarBreakdown.find((p) => p.pillar === "Metrics");
    expect(metrics).toEqual({ pillar: "Metrics", raw: 2, max: 3, pct: 67 });
  });

  it("stagePct only counts Q-tagged questions (1,3,4,6,8) in the Qualification bucket", () => {
    const answers: Record<number, number> = { 1: 3, 3: 3, 4: 3, 6: 3, 8: 3 };
    const r = computeMeddpiccScore(answers, "Qualification");
    expect(r.stagePct).toBe(100); // all 5 Q-tagged questions maxed (15/15)
    expect(r.overallPct).toBeLessThan(100); // P/N questions (2,5,7) still unanswered
  });

  it("RAG boundaries: <40 Red, 40-75 inclusive Amber, >75 Green", () => {
    const at = (pct: number) => {
      const score = Math.round((pct / 100) * 24);
      const answers: Record<number, number> = {};
      let remaining = score;
      for (const q of QUESTION_CATALOG) {
        const v = Math.min(3, remaining);
        answers[q.questionOrder] = v;
        remaining -= v;
      }
      return computeMeddpiccScore(answers, "Negotiation").ragStatus;
    };
    expect(at(39)).toBe("Red");
    expect(at(40)).toBe("Amber");
    expect(at(75)).toBe("Amber");
    expect(at(76)).toBe("Green");
  });

  it("respects custom thresholds", () => {
    const answers: Record<number, number> = {};
    for (const q of QUESTION_CATALOG) answers[q.questionOrder] = 2; // 66.7%
    const r = computeMeddpiccScore(answers, "Negotiation", { redMax: 70, greenMin: 90 });
    expect(r.ragStatus).toBe("Red");
  });

  it("counts explicit Strong-No (1) and Unknown (0/unanswered) separately", () => {
    const r = computeMeddpiccScore({ 1: 1, 2: 0 }, "Negotiation");
    expect(r.strongNoCount).toBe(1);
    expect(r.unknownCount).toBe(7); // 6 unanswered + question 2 explicitly rated 0
  });
});
```

Note `DEFAULT_MEDDPICC_THRESHOLDS` is imported but unused in this rewrite —
remove it from the import list if your linter flags unused imports; keep it
only if referenced.

- [ ] **Step 3: Run the engine test suite**

Run: `pnpm --filter @workspace/engine exec vitest run src/meddpicc.test.ts`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/engine/src/meddpicc.ts lib/engine/src/meddpicc.test.ts
git commit -m "Shrink MEDDPICC catalog from 43 to 8 questions (one per letter)"
```

---

### Task 2: Auto-answer signals rewrite

**Files:**
- Modify: `artifacts/api-server/src/lib/meddpicc-signals.ts`
- Modify: `artifacts/api-server/src/lib/meddpicc-signals.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 directly at compile time (this file has no
  dependency on `QUESTION_CATALOG`), but its hardcoded `questionOrder` values
  (2,3,4,5,6,7,8) must match Task 1's catalog exactly.
- Produces: `MeddpiccComputedAnswer { questionOrder: number; score: number;
  reason: string }` and `getMeddpiccComputedAnswers(dealId: string,
  accountName: string): Promise<MeddpiccComputedAnswer[]>` (always returns
  exactly 7 entries, for questionOrders 2-8) — Task 3 consumes this directly.

- [ ] **Step 1: Replace the full contents of `meddpicc-signals.ts`**

```ts
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
```

- [ ] **Step 2: Replace the full contents of `meddpicc-signals.test.ts`**

```ts
import { describe, it, expect, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import {
  db,
  pool,
  enterpriseDeals,
  pricingModels,
  servicesTiers,
  stakeholders,
  dealMemory,
  dealTechnicalGates,
  dealCompetitors,
  competitors,
} from "@workspace/db";
import { getMeddpiccComputedAnswers } from "./meddpicc-signals";

const createdDealIds: string[] = [];
const createdDealMemoryIds: string[] = [];
const createdCompetitorIds: number[] = [];

async function createDeal(stageId: number, accountName: string): Promise<string> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const [row] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Signals Test ${Date.now()}`,
      accountName,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: stageId,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      productRevenue: "100000",
      servicesRevenue: "0",
    })
    .returning({ id: enterpriseDeals.id });
  createdDealIds.push(row.id);
  return row.id;
}

afterAll(async () => {
  if (createdDealMemoryIds.length > 0) {
    await db.delete(dealMemory).where(inArray(dealMemory.id, createdDealMemoryIds));
  }
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  if (createdCompetitorIds.length > 0) {
    await db.delete(competitors).where(inArray(competitors.id, createdCompetitorIds));
  }
  await pool.end();
});

describe("getMeddpiccComputedAnswers — Economic Buyer (Q2)", () => {
  it("scores 0 when neither signal is present", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-a`);
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 2)?.score).toBe(0);
  });

  it("scores 2 when only the Economic Buyer stakeholder is tagged", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-b`);
    await db.insert(stakeholders).values({
      dealId,
      name: "Big Boss",
      roleType: "Economic Buyer",
      influenceLevel: "High",
      sentiment: "Neutral",
    });
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 2)?.score).toBe(2);
  });

  it("scores 2 when only the executive-agreement gate is completed", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-c`);
    await db.insert(dealTechnicalGates).values({ dealId, gateCode: "G1_EXECUTIVE_AGREED", isCompleted: true });
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 2)?.score).toBe(2);
  });

  it("scores 3 when both signals are present", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-d`);
    await db.insert(stakeholders).values({
      dealId,
      name: "Big Boss",
      roleType: "Economic Buyer",
      influenceLevel: "High",
      sentiment: "Neutral",
    });
    await db.insert(dealTechnicalGates).values({ dealId, gateCode: "G1_EXECUTIVE_AGREED", isCompleted: true });
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 2)?.score).toBe(3);
  });

  it("is not fooled by an unrelated completed gate", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-e`);
    await db.insert(dealTechnicalGates).values({ dealId, gateCode: "G1_CRITERIA_LOCKED", isCompleted: true });
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 2)?.score).toBe(0);
  });
});

describe("getMeddpiccComputedAnswers — Decision Criteria (Q3)", () => {
  it("scores 0 when G1_CRITERIA_LOCKED is not completed", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-f`);
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 3)?.score).toBe(0);
  });

  it("scores 3 when G1_CRITERIA_LOCKED is completed", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-g`);
    await db.insert(dealTechnicalGates).values({ dealId, gateCode: "G1_CRITERIA_LOCKED", isCompleted: true });
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 3)?.score).toBe(3);
  });
});

describe("getMeddpiccComputedAnswers — Decision Process (Q4)", () => {
  it("scores 0 with no decision-maker stakeholders", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-h`);
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 4)?.score).toBe(0);
  });

  it("scores 2 with exactly one decision-maker stakeholder", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-i`);
    await db.insert(stakeholders).values({
      dealId,
      name: "Decider One",
      roleType: "Influencer",
      influenceLevel: "High",
      isDecisionMaker: true,
    });
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 4)?.score).toBe(2);
  });

  it("scores 3 with two or more decision-maker stakeholders", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-j`);
    await db.insert(stakeholders).values([
      { dealId, name: "Decider One", roleType: "Influencer", influenceLevel: "High", isDecisionMaker: true },
      { dealId, name: "Decider Two", roleType: "Influencer", influenceLevel: "High", isDecisionMaker: true },
    ]);
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 4)?.score).toBe(3);
  });
});

describe("getMeddpiccComputedAnswers — Paper Process (Q5)", () => {
  it("scores 0 with no playbook assignment and no compliance gate", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-k`);
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 5)?.score).toBe(0);
  });

  it("scores 1 when only the compliance gate is completed", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-l`);
    await db.insert(dealTechnicalGates).values({ dealId, gateCode: "G4_COMPLIANCE_VALIDATED", isCompleted: true });
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 5)?.score).toBe(1);
  });
});

describe("getMeddpiccComputedAnswers — Identify Pain (Q6)", () => {
  it("scores 3 when the account has a prior Won deal", async () => {
    const accountName = `Repeat Acct ${Date.now()}`;
    const dealId = await createDeal(1, accountName);
    const [prior] = await db
      .insert(dealMemory)
      .values({
        dealId: "00000000-0000-0000-0000-000000000000",
        accountName,
        dealName: "Prior Deal",
        outcome: "Won",
      })
      .returning({ id: dealMemory.id });
    createdDealMemoryIds.push(prior.id);
    const answers = await getMeddpiccComputedAnswers(dealId, accountName);
    expect(answers.find((a) => a.questionOrder === 6)?.score).toBe(3);
  });

  it("scores 2 (never below Neutral) when the account has no prior Won deal", async () => {
    const accountName = `Net New Acct ${Date.now()}`;
    const dealId = await createDeal(1, accountName);
    const answers = await getMeddpiccComputedAnswers(dealId, accountName);
    expect(answers.find((a) => a.questionOrder === 6)?.score).toBe(2);
  });
});

describe("getMeddpiccComputedAnswers — Champion (Q7)", () => {
  it("scores 1 (Strong No, not Unknown) when no signal is present", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-m`);
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 7)?.score).toBe(1);
  });

  it("scores 2 when only a Champion stakeholder is tagged", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-n`);
    await db.insert(stakeholders).values({
      dealId,
      name: "Jane Doe",
      roleType: "Champion",
      influenceLevel: "High",
      sentiment: "Champion",
    });
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 7)?.score).toBe(2);
  });

  it("scores 3 when both a Champion stakeholder and the defensibility gate are present", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-o`);
    await db.insert(stakeholders).values({
      dealId,
      name: "Jane Doe",
      roleType: "Champion",
      influenceLevel: "High",
      sentiment: "Champion",
    });
    await db.insert(dealTechnicalGates).values({ dealId, gateCode: "G2_CHAMPION_DEFENSIBLE", isCompleted: true });
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 7)?.score).toBe(3);
  });
});

describe("getMeddpiccComputedAnswers — Competition (Q8)", () => {
  it("scores 0 when no competitor is tracked", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-p`);
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 8)?.score).toBe(0);
  });

  it("scores 0 when a competitor is tracked but has no historical win-rate data", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-q`);
    const [competitor] = await db
      .insert(competitors)
      .values({ name: `NoHistory Competitor ${Date.now()}` })
      .returning({ id: competitors.id });
    createdCompetitorIds.push(competitor.id);
    await db.insert(dealCompetitors).values({ dealId, competitorId: competitor.id });
    const answers = await getMeddpiccComputedAnswers(dealId, "irrelevant");
    expect(answers.find((a) => a.questionOrder === 8)?.score).toBe(0);
  });
});
```

- [ ] **Step 3: Run the signals test suite**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/meddpicc-signals.test.ts`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/lib/meddpicc-signals.ts artifacts/api-server/src/lib/meddpicc-signals.test.ts
git commit -m "Compute 7 of 8 MEDDPICC answers live from existing deal data"
```

---

### Task 3: Score service merge logic, schema cleanup, subscriber test fix

**Files:**
- Modify: `artifacts/api-server/src/lib/meddpicc.ts`
- Modify: `artifacts/api-server/src/lib/meddpicc.test.ts`
- Modify: `lib/db/src/schema/edc_v2_intel.ts`
- Modify: `artifacts/api-server/src/lib/subscribers/meddpicc.test.ts`

**Interfaces:**
- Consumes: `getMeddpiccComputedAnswers(dealId, accountName)` from Task 2.
- Produces: `MeddpiccAnswerView { questionOrder, score, note, source: "manual"
  | "computed" | "unanswered", reason }` — Task 5 (openapi) and Task 6 (UI)
  both depend on this exact shape.

- [ ] **Step 1: Remove the two retired columns from the Drizzle schema**

In `lib/db/src/schema/edc_v2_intel.ts`, find the `dealMeddpiccAnswers` table
definition and remove the `isAutoSuggested` and `suggestedScore` lines:

```ts
// Before:
    score: smallint("score"),
    isAutoSuggested: boolean("is_auto_suggested").notNull().default(false),
    suggestedScore: smallint("suggested_score"),
    note: text("note"),

// After:
    score: smallint("score"),
    note: text("note"),
```

Leave everything else in that table definition (and the rest of the file)
unchanged. Per the Global Constraints, do **not** run `db push` or write a
migration for this — the physical columns stay in Postgres, unreferenced.

- [ ] **Step 2: Replace the full contents of `meddpicc.ts` (score service)**

```ts
import { and, asc, eq, desc, inArray } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  pipelineStages,
  meddpiccQuestions,
  dealMeddpiccAnswers,
  dealMeddpiccScores,
  engineThresholds,
} from "@workspace/db";
import {
  computeMeddpiccScore,
  stageBucketForStageName,
  DEFAULT_MEDDPICC_THRESHOLDS,
  QUESTION_CATALOG,
  type MeddpiccThresholds,
  type MeddpiccScoreResult,
} from "@workspace/engine";
import { getMeddpiccComputedAnswers } from "./meddpicc-signals";
import { notFound, badRequest } from "./http";

async function loadThresholds(): Promise<MeddpiccThresholds> {
  const rows = await db
    .select({ key: engineThresholds.parameterKey, value: engineThresholds.parameterValue })
    .from(engineThresholds);
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const redMax = Number(byKey.get("meddpicc_red_max"));
  const greenMin = Number(byKey.get("meddpicc_green_min"));
  return {
    redMax: Number.isFinite(redMax) ? redMax : DEFAULT_MEDDPICC_THRESHOLDS.redMax,
    greenMin: Number.isFinite(greenMin) ? greenMin : DEFAULT_MEDDPICC_THRESHOLDS.greenMin,
  };
}

interface DealForMeddpicc {
  accountName: string;
  stageName: string | null;
}

async function loadDeal(dealId: string): Promise<DealForMeddpicc | null> {
  const [deal] = await db
    .select({ accountName: enterpriseDeals.accountName, stageName: pipelineStages.stageName })
    .from(enterpriseDeals)
    .leftJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(eq(enterpriseDeals.id, dealId))
    .limit(1);
  return deal ?? null;
}

export interface MeddpiccAnswerView {
  questionOrder: number;
  score: number | null;
  note: string | null;
  source: "manual" | "computed" | "unanswered";
  reason: string | null;
}

async function loadEffectiveAnswers(dealId: string, accountName: string): Promise<MeddpiccAnswerView[]> {
  const questionOrders = QUESTION_CATALOG.map((q) => q.questionOrder);
  const [manualRows, computed] = await Promise.all([
    db
      .select({
        questionOrder: meddpiccQuestions.questionOrder,
        score: dealMeddpiccAnswers.score,
        note: dealMeddpiccAnswers.note,
      })
      .from(meddpiccQuestions)
      .leftJoin(
        dealMeddpiccAnswers,
        and(eq(dealMeddpiccAnswers.questionId, meddpiccQuestions.id), eq(dealMeddpiccAnswers.dealId, dealId)),
      )
      .where(inArray(meddpiccQuestions.questionOrder, questionOrders)),
    getMeddpiccComputedAnswers(dealId, accountName),
  ]);

  const manualByOrder = new Map(manualRows.filter((r) => r.score != null).map((r) => [r.questionOrder, r]));
  const computedByOrder = new Map(computed.map((c) => [c.questionOrder, c]));

  return QUESTION_CATALOG.map((q): MeddpiccAnswerView => {
    const manual = manualByOrder.get(q.questionOrder);
    const auto = computedByOrder.get(q.questionOrder);
    if (manual) {
      return {
        questionOrder: q.questionOrder,
        score: manual.score,
        note: manual.note ?? null,
        source: "manual",
        reason: auto?.reason ?? null,
      };
    }
    if (auto) {
      return {
        questionOrder: q.questionOrder,
        score: auto.score,
        note: null,
        source: "computed",
        reason: auto.reason,
      };
    }
    return { questionOrder: q.questionOrder, score: null, note: null, source: "unanswered", reason: null };
  });
}

export async function computeMeddpiccScoreForDeal(dealId: string): Promise<MeddpiccScoreResult | null> {
  const deal = await loadDeal(dealId);
  if (!deal) return null;

  const [effectiveAnswers, thresholds] = await Promise.all([
    loadEffectiveAnswers(dealId, deal.accountName),
    loadThresholds(),
  ]);
  const answers: Record<number, number | null> = {};
  for (const a of effectiveAnswers) answers[a.questionOrder] = a.score;

  const stageBucket = stageBucketForStageName(deal.stageName ?? "");
  const result = computeMeddpiccScore(answers, stageBucket, thresholds);

  await db.insert(dealMeddpiccScores).values({
    dealId,
    overallScore: result.overallScore,
    overallPct: String(result.overallPct),
    stagePct: String(result.stagePct),
    ragStatus: result.ragStatus,
    pillarBreakdown: result.pillarBreakdown,
    strongNoCount: result.strongNoCount,
    unknownCount: result.unknownCount,
  });

  return result;
}

export async function getLatestMeddpiccScore(
  dealId: string,
): Promise<{ overallPct: number; stagePct: number; ragStatus: string } | null> {
  const [row] = await db
    .select({
      overallPct: dealMeddpiccScores.overallPct,
      stagePct: dealMeddpiccScores.stagePct,
      ragStatus: dealMeddpiccScores.ragStatus,
    })
    .from(dealMeddpiccScores)
    .where(eq(dealMeddpiccScores.dealId, dealId))
    .orderBy(desc(dealMeddpiccScores.computedAt))
    .limit(1);
  if (!row) return null;
  return {
    overallPct: Number(row.overallPct),
    stagePct: row.stagePct != null ? Number(row.stagePct) : 0,
    ragStatus: row.ragStatus,
  };
}

export interface MeddpiccAssessment {
  questions: typeof QUESTION_CATALOG;
  answers: MeddpiccAnswerView[];
  score: MeddpiccScoreResult;
}

export async function getMeddpiccAssessment(dealId: string): Promise<MeddpiccAssessment | null> {
  const deal = await loadDeal(dealId);
  if (!deal) return null;

  const [answers, score] = await Promise.all([
    loadEffectiveAnswers(dealId, deal.accountName),
    computeMeddpiccScoreForDeal(dealId),
  ]);
  if (!score) return null;

  return { questions: QUESTION_CATALOG, answers, score };
}

export async function upsertMeddpiccAnswer(
  dealId: string,
  questionOrder: number,
  input: { score: number; note?: string | null },
  actor: string,
): Promise<void> {
  const [deal] = await db
    .select({ id: enterpriseDeals.id })
    .from(enterpriseDeals)
    .where(eq(enterpriseDeals.id, dealId))
    .limit(1);
  if (!deal) throw notFound(`No deal with id ${dealId}`);

  const [question] = await db
    .select({ id: meddpiccQuestions.id })
    .from(meddpiccQuestions)
    .where(eq(meddpiccQuestions.questionOrder, questionOrder))
    .limit(1);
  if (!question) throw notFound(`No MEDDPICC question with order ${questionOrder}`);

  if (!Number.isInteger(input.score) || input.score < 0 || input.score > 3) {
    throw badRequest(`score must be an integer between 0 and 3, got ${input.score}`);
  }

  await db
    .insert(dealMeddpiccAnswers)
    .values({
      dealId,
      questionId: question.id,
      score: input.score,
      note: input.note ?? null,
      answeredAt: new Date(),
      answeredBy: actor,
    })
    .onConflictDoUpdate({
      target: [dealMeddpiccAnswers.dealId, dealMeddpiccAnswers.questionId],
      set: {
        score: input.score,
        note: input.note ?? null,
        answeredAt: new Date(),
        answeredBy: actor,
      },
    });
}
```

`asc` is no longer used in this file (the old row-by-row `.orderBy(asc(...))`
query is gone, replaced by `QUESTION_CATALOG.map(...)` ordering) — remove it
from the `drizzle-orm` import if your linter flags it as unused; keep
`and`, `eq`, `desc`, `inArray`.

- [ ] **Step 3: Replace the full contents of `meddpicc.test.ts` (score service)**

```ts
import { describe, it, expect, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db, pool, enterpriseDeals, pricingModels, servicesTiers, pipelineStages } from "@workspace/db";
import {
  computeMeddpiccScoreForDeal,
  getMeddpiccAssessment,
  upsertMeddpiccAnswer,
  getLatestMeddpiccScore,
} from "./meddpicc";

const createdDealIds: string[] = [];

async function createDeal(stageName: string): Promise<string> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const stages = await db.select().from(pipelineStages);
  const match = stages.find((s) => s.stageName === stageName) ?? stages[0];
  const [row] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Meddpicc Score Test ${Date.now()}`,
      accountName: `Acct ${Date.now()}`,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: match.id,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      productRevenue: "100000",
      servicesRevenue: "0",
    })
    .returning({ id: enterpriseDeals.id });
  createdDealIds.push(row.id);
  return row.id;
}

afterAll(async () => {
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
});

describe("computeMeddpiccScoreForDeal", () => {
  it("computes a score for a brand-new deal from live-computed answers alone and persists a snapshot row", async () => {
    const dealId = await createDeal("Discovery");
    const result = await computeMeddpiccScoreForDeal(dealId);
    expect(result).not.toBeNull();
    const latest = await getLatestMeddpiccScore(dealId);
    expect(latest?.overallPct).toBe(result?.overallPct);
  });

  it("returns null for a non-existent deal", async () => {
    const result = await computeMeddpiccScoreForDeal("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });
});

describe("getMeddpiccAssessment / upsertMeddpiccAnswer", () => {
  it("returns all 8 questions, each with a computed or unanswered source before any manual answer", async () => {
    const dealId = await createDeal("Discovery");
    const assessment = await getMeddpiccAssessment(dealId);
    expect(assessment?.questions).toHaveLength(8);
    expect(assessment?.answers).toHaveLength(8);
    const metrics = assessment?.answers.find((a) => a.questionOrder === 1);
    expect(metrics?.source).toBe("unanswered");
    expect(metrics?.score).toBeNull();
    const economicBuyer = assessment?.answers.find((a) => a.questionOrder === 2);
    expect(economicBuyer?.source).toBe("computed");
    expect(economicBuyer?.reason).not.toBeNull();
  });

  it("upserts a manual answer for Metrics and reflects it in the next assessment + score", async () => {
    const dealId = await createDeal("Discovery");
    await upsertMeddpiccAnswer(dealId, 1, { score: 3 }, "vitest");
    const assessment = await getMeddpiccAssessment(dealId);
    const answer = assessment?.answers.find((a) => a.questionOrder === 1);
    expect(answer?.score).toBe(3);
    expect(answer?.source).toBe("manual");
    expect(assessment?.score.overallScore).toBeGreaterThanOrEqual(3);
  });

  it("a manual override on an auto-computed question wins over the live-computed value", async () => {
    const dealId = await createDeal("Discovery");
    const before = await getMeddpiccAssessment(dealId);
    const computed = before?.answers.find((a) => a.questionOrder === 3); // Decision Criteria, computed 0 with no gate
    expect(computed?.source).toBe("computed");
    expect(computed?.score).toBe(0);

    await upsertMeddpiccAnswer(dealId, 3, { score: 3 }, "vitest");
    const after = await getMeddpiccAssessment(dealId);
    const overridden = after?.answers.find((a) => a.questionOrder === 3);
    expect(overridden?.source).toBe("manual");
    expect(overridden?.score).toBe(3);
    expect(overridden?.reason).not.toBeNull(); // reason still shown even though overridden
  });

  it("upserting the same question twice updates rather than duplicates", async () => {
    const dealId = await createDeal("Discovery");
    await upsertMeddpiccAnswer(dealId, 1, { score: 1 }, "vitest");
    await upsertMeddpiccAnswer(dealId, 1, { score: 3, note: "changed my mind" }, "vitest");
    const assessment = await getMeddpiccAssessment(dealId);
    const answer = assessment?.answers.find((a) => a.questionOrder === 1);
    expect(answer?.score).toBe(3);
    expect(answer?.note).toBe("changed my mind");
  });

  it("throws for a non-existent dealId", async () => {
    await expect(
      upsertMeddpiccAnswer("00000000-0000-0000-0000-000000000000", 1, { score: 3 }, "vitest"),
    ).rejects.toThrow();
  });

  it("rejects a score above the valid range (99)", async () => {
    const dealId = await createDeal("Discovery");
    await expect(upsertMeddpiccAnswer(dealId, 1, { score: 99 }, "vitest")).rejects.toThrow();
  });

  it("rejects a score below the valid range (-1)", async () => {
    const dealId = await createDeal("Discovery");
    await expect(upsertMeddpiccAnswer(dealId, 1, { score: -1 }, "vitest")).rejects.toThrow();
  });

  it("rejects a non-integer score (1.5)", async () => {
    const dealId = await createDeal("Discovery");
    await expect(upsertMeddpiccAnswer(dealId, 1, { score: 1.5 }, "vitest")).rejects.toThrow();
  });

  it("accepts the boundary-valid score 0", async () => {
    const dealId = await createDeal("Discovery");
    await upsertMeddpiccAnswer(dealId, 1, { score: 0 }, "vitest");
    const assessment = await getMeddpiccAssessment(dealId);
    expect(assessment?.answers.find((a) => a.questionOrder === 1)?.score).toBe(0);
  });

  it("accepts the boundary-valid score 3", async () => {
    const dealId = await createDeal("Discovery");
    await upsertMeddpiccAnswer(dealId, 1, { score: 3 }, "vitest");
    const assessment = await getMeddpiccAssessment(dealId);
    expect(assessment?.answers.find((a) => a.questionOrder === 1)?.score).toBe(3);
  });
});

describe("stage bucket wiring", () => {
  it("uses the Qualification bucket (Q-tagged questions only) for a Discovery-stage deal", async () => {
    const dealId = await createDeal("Discovery");
    // Q-tagged questions: Metrics(1), DecisionCriteria(3), DecisionProcess(4), IdentifyPain(6), Competition(8) — 5 x 3 = 15 max.
    for (const order of [1, 3, 4, 6, 8]) await upsertMeddpiccAnswer(dealId, order, { score: 3 }, "vitest");
    const result = await computeMeddpiccScoreForDeal(dealId);
    expect(result?.stagePct).toBe(100);
  });
});
```

- [ ] **Step 4: Fix the subscriber test's stale hardcoded questionOrder**

In `artifacts/api-server/src/lib/subscribers/meddpicc.test.ts`, there are 3
occurrences of `questionOrder: 43` (informational payload fields on
`emitDealEvent("meddpicc.answer_changed", ...)` calls, at the lines following
each `for (const q of QUESTION_CATALOG) { await upsertMeddpiccAnswer(...) }`
loop). Change each `questionOrder: 43` to `questionOrder: 8`. Do not change
anything else in this file — the loop over `QUESTION_CATALOG` already adapts
automatically to the new 8-question catalog, and the rest of the test's logic
(polling for step completion, skip-respecting, race-serialization) is
unaffected by the catalog size.

- [ ] **Step 5: Run the affected test suites**

Run:
```bash
pnpm --filter @workspace/api-server exec vitest run src/lib/meddpicc.test.ts
pnpm --filter @workspace/api-server exec vitest run src/lib/subscribers/meddpicc.test.ts
```
Expected: all tests pass in both files.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @workspace/db exec tsc --noEmit && pnpm --filter @workspace/api-server exec tsc -p tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add artifacts/api-server/src/lib/meddpicc.ts artifacts/api-server/src/lib/meddpicc.test.ts lib/db/src/schema/edc_v2_intel.ts artifacts/api-server/src/lib/subscribers/meddpicc.test.ts
git commit -m "Merge manual overrides over live-computed MEDDPICC answers; retire isAutoSuggested/suggestedScore"
```

---

### Task 4: Self-healing question-catalog reseed

**Files:**
- Modify: `artifacts/api-server/src/seed.ts`

**Interfaces:**
- Consumes: `QUESTION_CATALOG` from `@workspace/engine` (Task 1's new
  8-entry catalog) — no other task depends on this file.

**Note:** per the Global Constraints, do NOT run `pnpm --filter
@workspace/api-server run seed` against the shared dev database as part of
this task — that happens once, at the very end of the whole plan. This task
is verified by typecheck only.

- [ ] **Step 1: Add the two new table imports**

In `artifacts/api-server/src/seed.ts`, find the `@workspace/db` import block
(it currently ends with `dealCompetitors, meddpiccQuestions,`) and add two
more entries:

```ts
// Before:
  dealMemory,
  dealCompetitors,
  meddpiccQuestions,
} from "@workspace/db";

// After:
  dealMemory,
  dealCompetitors,
  meddpiccQuestions,
  dealMeddpiccAnswers,
  dealMeddpiccScores,
} from "@workspace/db";
```

- [ ] **Step 2: Replace `seedMeddpiccQuestions` with a self-healing version**

Replace the entire function:

```ts
async function seedMeddpiccQuestions() {
  const existing = await db
    .select({ questionOrder: meddpiccQuestions.questionOrder })
    .from(meddpiccQuestions);
  const existingOrders = new Set(existing.map((r) => r.questionOrder));
  const catalogOrders = new Set(QUESTION_CATALOG.map((q) => q.questionOrder));
  const matches =
    existing.length === QUESTION_CATALOG.length &&
    [...catalogOrders].every((o) => existingOrders.has(o));

  if (matches) {
    logger.info("MEDDPICC questions already present and match the current catalog — skipping MEDDPICC seed");
    return;
  }

  if (existing.length > 0) {
    logger.warn(
      "MEDDPICC question catalog has changed — resetting deal_meddpicc_answers, deal_meddpicc_scores, and meddpicc_questions",
    );
    await db.delete(dealMeddpiccAnswers);
    await db.delete(dealMeddpiccScores);
    await db.delete(meddpiccQuestions);
  }

  await db.insert(meddpiccQuestions).values(
    QUESTION_CATALOG.map((q) => ({
      questionOrder: q.questionOrder,
      pillar: q.pillar,
      stageTag: q.stageTag,
      questionText: q.questionText,
      helpText: q.helpText ?? null,
    })),
  );
  logger.info(`Seeded ${QUESTION_CATALOG.length} MEDDPICC questions`);
}
```

This makes the function idempotent either way: unchanged catalog → no-op
(same as before); changed catalog (a different question count or different
questionOrder set) → deletes the stale answers/scores/questions and reseeds
fresh. Deletion order matters: `dealMeddpiccAnswers` before
`meddpiccQuestions` (FK), `dealMeddpiccScores` has no FK to
`meddpiccQuestions` so its position relative to the other two doesn't matter.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @workspace/api-server exec tsc -p tsconfig.json --noEmit`
Expected: no errors. (No automated test is added for this function — it
mutates global, non-deal-scoped tables shared with the live dev database, so
exercising it for real is deferred to the one-time live reseed at the end of
the whole plan, not to per-task automated tests.)

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/seed.ts
git commit -m "Make MEDDPICC question-catalog seeding self-healing on catalog changes"
```

---

### Task 5: OpenAPI contract + codegen

**Files:**
- Modify: `lib/api-spec/openapi.yaml`

**Interfaces:**
- Consumes: `MeddpiccAnswerView` shape from Task 3
  (`{questionOrder, score, note, source, reason}`).
- Produces: regenerated `lib/api-zod` and `lib/api-client-react` (via
  codegen) — Task 6 (UI) consumes the resulting React Query hook types only
  loosely (the panel defines its own local TS interfaces, as it already did
  before this plan), so there is no hard compile-time dependency, but the
  wire shape must match what Task 3 actually returns.

- [ ] **Step 1: Update `MeddpiccAnswer`, remove `MeddpiccSuggestion`, update `MeddpiccAssessment`, update `UpsertMeddpiccAnswerInput`**

In `lib/api-spec/openapi.yaml`, find the MEDDPICC schema block (search for
`# MEDDPICC auto-scoring`) and replace it with:

```yaml
    # MEDDPICC auto-scoring
    MeddpiccQuestion:
      type: object
      properties:
        questionOrder: { type: integer }
        pillar: { type: string }
        stageTag: { type: string }
        questionText: { type: string }
        helpText: { type: ["string", "null"] }
      required: [questionOrder, pillar, stageTag, questionText]
    MeddpiccAnswer:
      type: object
      properties:
        questionOrder: { type: integer }
        score: { type: ["integer", "null"] }
        note: { type: ["string", "null"] }
        source: { type: string, enum: [manual, computed, unanswered] }
        reason: { type: ["string", "null"] }
      required: [questionOrder, score, note, source, reason]
    MeddpiccPillarBreakdown:
      type: object
      properties:
        pillar: { type: string }
        raw: { type: integer }
        max: { type: integer }
        pct: { type: integer }
      required: [pillar, raw, max, pct]
    MeddpiccScore:
      type: object
      properties:
        overallScore: { type: integer }
        overallPct: { type: integer }
        stagePct: { type: integer }
        ragStatus: { type: string }
        pillarBreakdown: { type: array, items: { $ref: "#/components/schemas/MeddpiccPillarBreakdown" } }
        strongNoCount: { type: integer }
        unknownCount: { type: integer }
      required: [overallScore, overallPct, stagePct, ragStatus, pillarBreakdown, strongNoCount, unknownCount]
    MeddpiccAssessment:
      type: object
      properties:
        questions: { type: array, items: { $ref: "#/components/schemas/MeddpiccQuestion" } }
        answers: { type: array, items: { $ref: "#/components/schemas/MeddpiccAnswer" } }
        score: { $ref: "#/components/schemas/MeddpiccScore" }
      required: [questions, answers, score]
    MeddpiccAssessmentResponse:
      type: object
      properties:
        data: { $ref: "#/components/schemas/MeddpiccAssessment" }
      required: [data]
    UpsertMeddpiccAnswerInput:
      type: object
      properties:
        questionOrder: { type: integer, minimum: 1, maximum: 8 }
        score: { type: integer, minimum: 0, maximum: 3 }
        note: { type: ["string", "null"] }
      required: [questionOrder, score]
```

This removes the `MeddpiccSuggestion` schema entirely (no longer
referenced anywhere) and drops the `suggestions` property from
`MeddpiccAssessment`. The two path operations under
`/v2/deals/{dealId}/meddpicc` (GET/PATCH) do not reference
`MeddpiccSuggestion` directly and need no changes.

- [ ] **Step 2: Regenerate Zod schemas + React Query hooks**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: completes without error; `lib/api-zod/src/generated/**` and
`lib/api-client-react/src/generated/**` update to reflect the new
`MeddpiccAnswer`/`MeddpiccAssessment`/`UpsertMeddpiccAnswerInput` shapes and
the removed `MeddpiccSuggestion`.

- [ ] **Step 3: Typecheck the generated-consumer packages**

Run: `pnpm --filter @workspace/api-server exec tsc -p tsconfig.json --noEmit`
Expected: no errors (routes/v2/meddpicc.ts uses `UpsertMeddpiccAnswerBody`
etc. from `@workspace/api-zod`, whose shape now matches the smaller
questionOrder range; no route code changes are needed since the route file
just parses+delegates).

- [ ] **Step 4: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "Update MEDDPICC API contract: 8-question range, source+reason replace isAutoSuggested/suggestions"
```

---

### Task 6: UI panel — flat 8-row list

**Files:**
- Modify: `artifacts/edc/src/components/cockpit/v2/meddpicc-panel.tsx`

**Interfaces:**
- Consumes: the assessment response shape produced by Task 3/5
  (`questions`, `answers: {questionOrder, score, note, source, reason}[]`,
  `score`).

- [ ] **Step 1: Replace the full contents of `meddpicc-panel.tsx`**

```tsx
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMeddpiccAssessment, useUpsertMeddpiccAnswer } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

interface Question {
  questionOrder: number;
  pillar: string;
  stageTag: string;
  questionText: string;
  helpText?: string | null;
}
interface Answer {
  questionOrder: number;
  score: number | null;
  note: string | null;
  source: "manual" | "computed" | "unanswered";
  reason: string | null;
}
interface PillarBreakdown {
  pillar: string;
  raw: number;
  max: number;
  pct: number;
}
interface Score {
  overallScore: number;
  overallPct: number;
  stagePct: number;
  ragStatus: "Red" | "Amber" | "Green";
  pillarBreakdown: PillarBreakdown[];
  strongNoCount: number;
  unknownCount: number;
}
interface Assessment {
  questions: Question[];
  answers: Answer[];
  score: Score;
}

const PILLAR_LABEL: Record<string, string> = {
  Metrics: "Metrics",
  EconomicBuyer: "Economic Buyer",
  DecisionCriteria: "Decision Criteria",
  DecisionProcess: "Decision Process",
  PaperProcess: "Paper Process",
  IdentifyPain: "Identify Pain & Value Drivers",
  Champion: "Champion(s)",
  Competition: "Competition",
};

const RAG_BADGE: Record<Score["ragStatus"], string> = {
  Red: "bg-destructive text-destructive-foreground",
  Amber: "bg-amber-500 text-white",
  Green: "bg-emerald-500 text-white",
};

const SCORE_STYLE: Record<number, { label: string; dot: string; wash: string; solid: string }> = {
  3: {
    label: "Strong Yes",
    dot: "bg-emerald-500",
    wash: "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400",
    solid: "bg-emerald-600 text-white border-emerald-600",
  },
  2: {
    label: "Neutral",
    dot: "bg-slate-500",
    wash: "bg-slate-500/10 border-slate-500/20 text-slate-700 dark:text-slate-400",
    solid: "bg-slate-600 text-white border-slate-600",
  },
  1: {
    label: "Strong No",
    dot: "bg-rose-500",
    wash: "bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-400",
    solid: "bg-rose-600 text-white border-rose-600",
  },
  0: {
    label: "Unknown",
    dot: "bg-slate-400",
    wash: "border-dashed border-slate-300 dark:border-slate-600 bg-transparent text-muted-foreground",
    solid: "bg-slate-400 text-white border-slate-400",
  },
};

function QuestionRow({
  question,
  answer,
  onScore,
}: {
  question: Question;
  answer: Answer | undefined;
  onScore: (score: number, note: string | null) => void;
}) {
  const [noteDraft, setNoteDraft] = useState(answer?.note ?? "");

  return (
    <div className="flex flex-col gap-2 border-b border-border/50 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm">
          <span className="font-medium">{PILLAR_LABEL[question.pillar] ?? question.pillar}.</span>{" "}
          {question.questionText}
          {question.helpText && (
            <span className="ml-2 text-xs text-muted-foreground">{question.helpText}</span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        {[3, 2, 1, 0].map((n) => {
          const isSelected = answer?.score === n;
          const style = SCORE_STYLE[n];
          return (
            <Button
              key={n}
              type="button"
              size="sm"
              variant="outline"
              className={cn("h-7 w-9 px-0", isSelected ? style.solid : style.wash)}
              onClick={() => onScore(n, noteDraft || null)}
            >
              {n}
            </Button>
          );
        })}
        {answer?.source === "manual" && (
          <span className="text-xs text-muted-foreground">manually answered</span>
        )}
      </div>
      {answer?.reason && (
        <p className="text-xs text-muted-foreground">
          {answer.source === "computed" ? "Auto: " : "System: "}
          {answer.reason}
        </p>
      )}
      <Textarea
        value={noteDraft}
        onChange={(e) => setNoteDraft(e.target.value)}
        onBlur={() => {
          if (answer?.score != null && noteDraft !== (answer.note ?? "")) {
            onScore(answer.score, noteDraft || null);
          }
        }}
        placeholder="Notes (optional)"
        className="h-16 text-xs"
      />
    </div>
  );
}

export function MeddpiccPanel({ dealId }: { dealId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const query = useGetMeddpiccAssessment(dealId);
  const upsert = useUpsertMeddpiccAnswer();

  const invalidate = () =>
    qc.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && JSON.stringify(q.queryKey).includes(dealId),
    });

  const handleScore = async (questionOrder: number, score: number, note: string | null) => {
    try {
      await upsert.mutateAsync({ dealId, data: { questionOrder, score, note } as never });
      invalidate();
    } catch {
      toast({ title: "Couldn't save answer", variant: "destructive" });
    }
  };

  if (query.isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-4 h-40 w-full" />
      </Card>
    );
  }

  const assessment = (query.data?.data as Assessment | undefined) ?? undefined;
  if (!assessment) {
    return <Card className="p-4 text-sm text-muted-foreground">MEDDPICC assessment unavailable.</Card>;
  }

  const { questions, answers, score } = assessment;
  const answerByOrder = new Map(answers.map((a) => [a.questionOrder, a]));

  return (
    <Card className="p-4">
      <CardHeader className="flex-row items-center justify-between space-y-0 p-0 pb-3">
        <CardTitle className="text-base">MEDDPICC Qualification</CardTitle>
        <div className="flex items-center gap-2">
          <Badge className={RAG_BADGE[score.ragStatus]}>{score.overallPct}% overall</Badge>
          <Badge variant="outline">{score.stagePct}% at this stage</Badge>
        </div>
      </CardHeader>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", SCORE_STYLE[3].dot)} />
          Strong Yes
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", SCORE_STYLE[2].dot)} />
          Neutral
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", SCORE_STYLE[1].dot)} />
          Strong No: {score.strongNoCount}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full border border-dashed border-slate-400" />
          Unknown: {score.unknownCount}
        </span>
      </div>
      {questions.map((q) => (
        <QuestionRow
          key={q.questionOrder}
          question={q}
          answer={answerByOrder.get(q.questionOrder)}
          onScore={(scoreValue, note) => handleScore(q.questionOrder, scoreValue, note)}
        />
      ))}
    </Card>
  );
}
```

This removes the `Collapsible`/`CollapsibleContent`/`CollapsibleTrigger`
imports, the `ChevronDown` icon import, the `Suggestion` interface, the
`PillarSection` component, and the `PILLAR_ORDER` constant/pillar-grouping
loop entirely — there is nothing left to collapse once each pillar is exactly
one question, and the API no longer returns a separate `suggestions` array.

- [ ] **Step 2: Typecheck the frontend**

Run: `pnpm --filter @workspace/edc exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add artifacts/edc/src/components/cockpit/v2/meddpicc-panel.tsx
git commit -m "Flatten MEDDPICC panel to 8 rows; drop collapsible pillar sections"
```

---

## Final integration step (performed by the plan's controller, not a task subagent)

After all 6 tasks pass review and are merged:

1. Rebuild and restart the API server (`pnpm --filter @workspace/api-server
   run build`, stop the old process, start the new `dist/index.mjs`) — this
   is the moment `seedMeddpiccQuestions`'s self-heal actually needs to run.
   The seed script (`pnpm --filter @workspace/api-server run seed`) must be
   run once against the dev database to trigger the reset described in
   Task 4; confirm the log line `"MEDDPICC question catalog has changed —
   resetting..."` appears, followed by `"Seeded 8 MEDDPICC questions"`.
2. Reload the MEDDPICC tab for a real deal in the browser and confirm: 8 rows
   render (not 43), 7 show an "Auto:" reason caption with a pre-selected
   color-coded score, Metrics shows as unanswered, and clicking a different
   button on an auto row overrides it (re-fetch shows "System:" wording +
   `manually answered` and the button changes to the newly selected color).
