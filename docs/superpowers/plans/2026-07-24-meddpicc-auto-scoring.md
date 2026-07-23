# MEDDPICC Auto-Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing free-text "MEDDPICC qualification scored" playbook checkbox into a real, auto-calculated 43-question MEDDPICC score (ported from the dealpad.io xlsx template) that recalculates live as answers change, auto-suggests ~7 of the 43 questions from data already in the tool, and auto-completes the playbook step once the score reaches Green.

**Architecture:** A pure `lib/engine/src/meddpicc.ts` module (the 43-question catalog + scoring math, no DB) is called by a server-side `lib/meddpicc.ts` service that assembles answers from three new `edc_v2` tables, persists a score snapshot, and is wired into the existing event bus (`meddpicc.answer_changed` → recompute → auto-complete playbook step → feed trajectory) exactly the way `playbook.step_changed` already drives predictive scoring today. New REST endpoints follow the existing openapi.yaml → Orval codegen → React Query hook pipeline; a new Cockpit tab renders the 8-pillar question list.

**Tech Stack:** TypeScript, Drizzle ORM (Postgres), Express 5, Vitest, React 19 + TanStack Query, Orval codegen, recharts.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-24-meddpicc-auto-scoring-design.md` — every requirement in this plan traces back to that document.
- New DB tables live in `lib/db/src/schema/edc_v2_intel.ts` (the file already holding `playbooks`, `dealScores`, `stakeholders`, etc.) on the `edcV2` schema object.
- Never use `drizzle-kit push --force`. New `edc_v2` tables are added to the Drizzle schema **and** shipped as a hand-written idempotent `CREATE TABLE IF NOT EXISTS` SQL file applied via `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/<file>.sql` — this repo's established convention (see `lib/db/sql/2026-07-23-commander-achievements.sql`).
- The engine module (`lib/engine/src/meddpicc.ts`) must perform **no DB or network calls** — pure input/output, matching every other module in `lib/engine/src`.
- RAG thresholds (`meddpicc_red_max` default 40, `meddpicc_green_min` default 75) are tunable via `engine_thresholds` / the existing Settings → Thresholds tab — no new Settings UI code is needed, that tab already renders every row in the table.
- Unanswered questions count as 0 toward a **fixed** denominator (129 overall / 81 Qualification / 108 Proposition) — the score starts at 0% and climbs as questions are answered, matching the xlsx.
- The playbook step "MEDDPICC qualification scored" auto-completes **once** when the score first reaches Green, and only if the rep has not already taken **any** explicit action (completed/skipped/blocked) on that step — it never auto-reopens and never overrides an explicit rep decision.
- This feature is standalone: it does **not** modify `lib/engine/src/scoring.ts` (Predictive Score) or the Risk Engine dimensions/patterns.
- **Two implementation refinements vs. the design doc** (both scoped during planning, not silent deviations):
  1. The PATCH endpoint takes `questionOrder` in the **request body**, not the URL path — this codebase has no precedent for a non-string path parameter (every existing path param, including the alphanumeric `gateCode`, is typed `string` in `openapi.yaml`), so keeping `questionOrder` in the body avoids introducing a new coercion pattern.
  2. The Competition-pillar auto-suggestion (question 39) is computed directly from `competitorWinRates()` (the same underlying win/loss tally the Risk Engine's competitive-exposure dimension itself draws from) rather than calling `scoreCompetitiveExposure` — this avoids coupling the new signals module to that dimension's full `CompetitorInput[]` assembly.

---

### Task 1: Extract shared playbook step-state helpers into `playbook-signals.ts`

The MEDDPICC auto-complete subscriber (Task 10) needs to set a playbook step to "completed" the same way the existing `POST .../steps/:stepId/state` route does — including recomputing the assignment and finding the deal id. That logic (`recomputeAssignment`, `dealIdForAssignment`) currently lives as unexported local functions inside `routes/v2/config.ts`. Move them into `artifacts/api-server/src/lib/playbook-signals.ts` (the module both routes and subscribers already import from) so both the route and the new subscriber use one implementation.

**Files:**
- Modify: `artifacts/api-server/src/routes/v2/config.ts` (remove the two local functions, import them instead)
- Modify: `artifacts/api-server/src/lib/playbook-signals.ts` (add the two functions, exported)
- Test: `artifacts/api-server/src/lib/subscribers/playbook-engine.test.ts` (existing — must still pass, proving the extraction didn't change behavior)

**Interfaces:**
- Produces: `export async function recomputeAssignment(assignmentId: string): Promise<void>` and `export async function dealIdForAssignment(assignmentId: string): Promise<string | null>` from `../../lib/playbook-signals` (relative to `routes/v2/`) / `./playbook-signals` (relative to `lib/subscribers/`).

- [ ] **Step 1: Locate and cut the two functions out of `config.ts`**

Open `artifacts/api-server/src/routes/v2/config.ts`. Find `async function recomputeAssignment(assignmentId: string)` (around line 233) and `async function dealIdForAssignment(assignmentId: string)` (around line 268). Cut both function bodies (keep note of their exact current code — do not rewrite them, just relocate).

- [ ] **Step 2: Paste them into `playbook-signals.ts`, exported**

At the end of `artifacts/api-server/src/lib/playbook-signals.ts`, add:

```ts
export async function recomputeAssignment(assignmentId: string): Promise<void> {
  // <exact body moved from config.ts, unchanged>
}

export async function dealIdForAssignment(assignmentId: string): Promise<string | null> {
  // <exact body moved from config.ts, unchanged>
}
```

Check the moved bodies' internal references (table imports like `dealPlaybookAssignments`, `playbookSteps`, `playbookStepCompletions`, drizzle operators `eq`/`and`) are already imported at the top of `playbook-signals.ts` per its existing import block; add any that are missing.

- [ ] **Step 3: Update `config.ts` to import instead of define**

In `artifacts/api-server/src/routes/v2/config.ts`, add to the existing import from `../../lib/playbook-signals`:

```ts
import { getPlaybookJourney, startPlaybookForDeal, recomputeAssignment, dealIdForAssignment } from "../../lib/playbook-signals";
```

Remove the two now-duplicate local function definitions.

- [ ] **Step 4: Typecheck**

Run: `pnpm run typecheck`
Expected: no errors (this is a pure relocation — the two step-state routes in `config.ts` call the functions exactly as before, just via import).

- [ ] **Step 5: Run the existing regression test to confirm no behavior change**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/subscribers/playbook-engine.test.ts`
Expected: PASS (same as before the extraction — this test exercises `recomputeAssignment` indirectly via the auto-assign flow).

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/routes/v2/config.ts artifacts/api-server/src/lib/playbook-signals.ts
git commit -m "refactor: share playbook step-state helpers via playbook-signals.ts"
```

---

### Task 2: Add the MEDDPICC schema (3 tables) and apply via SQL

**Files:**
- Modify: `lib/db/src/schema/edc_v2_intel.ts`
- Create: `lib/db/sql/2026-07-24-meddpicc-scoring.sql`

**Interfaces:**
- Produces: Drizzle tables `meddpiccQuestions`, `dealMeddpiccAnswers`, `dealMeddpiccScores` exported from `@workspace/db` (via the existing `export * from "./edc_v2_intel"` in `lib/db/src/schema/index.ts` — no change needed there).

- [ ] **Step 1: Add the three table definitions**

In `lib/db/src/schema/edc_v2_intel.ts`, append (all imports used — `uuid, varchar, text, smallint, integer, numeric, boolean, jsonb, timestamp, index, unique` — are already imported at the top of this file):

```ts
/* --------------------------------------------------- F17 MEDDPICC Qualification */

export const meddpiccQuestions = edcV2.table("meddpicc_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionOrder: smallint("question_order").notNull().unique(),
  pillar: varchar("pillar", { length: 30 }).notNull(),
  stageTag: varchar("stage_tag", { length: 1 }).notNull(),
  questionText: text("question_text").notNull(),
  helpText: text("help_text"),
});

export const dealMeddpiccAnswers = edcV2.table(
  "deal_meddpicc_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => meddpiccQuestions.id),
    score: smallint("score"),
    isAutoSuggested: boolean("is_auto_suggested").notNull().default(false),
    suggestedScore: smallint("suggested_score"),
    note: text("note"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    answeredBy: varchar("answered_by", { length: 255 }),
  },
  (t) => [unique("deal_meddpicc_answer_uq").on(t.dealId, t.questionId)],
);

export const dealMeddpiccScores = edcV2.table(
  "deal_meddpicc_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => enterpriseDeals.id, { onDelete: "cascade" }),
    overallScore: integer("overall_score").notNull(),
    overallPct: numeric("overall_pct", { precision: 5, scale: 2 }).notNull(),
    stagePct: numeric("stage_pct", { precision: 5, scale: 2 }),
    ragStatus: varchar("rag_status", { length: 10 }).notNull(),
    pillarBreakdown: jsonb("pillar_breakdown").notNull().$type<
      { pillar: string; raw: number; max: number; pct: number }[]
    >(),
    strongNoCount: smallint("strong_no_count").notNull(),
    unknownCount: smallint("unknown_count").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("deal_meddpicc_score_deal_time_idx").on(t.dealId, t.computedAt.desc())],
);
```

- [ ] **Step 2: Typecheck the schema package**

Run: `pnpm --filter @workspace/db exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Write the idempotent SQL migration**

Create `lib/db/sql/2026-07-24-meddpicc-scoring.sql`:

```sql
-- MEDDPICC Auto-Scoring (2026-07-24)
--
-- Adds the 43-question MEDDPICC catalog, per-deal answers, and score
-- snapshots. Mirrors the Drizzle schema in lib/db/src/schema/edc_v2_intel.ts
-- (meddpiccQuestions, dealMeddpiccAnswers, dealMeddpiccScores).
--
-- Safe to re-run (idempotent): CREATE TABLE / INDEX use IF NOT EXISTS.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-24-meddpicc-scoring.sql

BEGIN;

CREATE TABLE IF NOT EXISTS edc_v2.meddpicc_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_order smallint NOT NULL UNIQUE,
  pillar varchar(30) NOT NULL,
  stage_tag varchar(1) NOT NULL,
  question_text text NOT NULL,
  help_text text
);

CREATE TABLE IF NOT EXISTS edc_v2.deal_meddpicc_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.enterprise_deals(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES edc_v2.meddpicc_questions(id),
  score smallint,
  is_auto_suggested boolean NOT NULL DEFAULT false,
  suggested_score smallint,
  note text,
  answered_at timestamptz,
  answered_by varchar(255),
  CONSTRAINT deal_meddpicc_answer_uq UNIQUE (deal_id, question_id)
);

CREATE TABLE IF NOT EXISTS edc_v2.deal_meddpicc_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.enterprise_deals(id) ON DELETE CASCADE,
  overall_score integer NOT NULL,
  overall_pct numeric(5,2) NOT NULL,
  stage_pct numeric(5,2),
  rag_status varchar(10) NOT NULL,
  pillar_breakdown jsonb NOT NULL,
  strong_no_count smallint NOT NULL,
  unknown_count smallint NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deal_meddpicc_score_deal_time_idx
  ON edc_v2.deal_meddpicc_scores (deal_id, computed_at DESC);

COMMIT;
```

- [ ] **Step 4: Apply the SQL to the local dev database**

Run: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-24-meddpicc-scoring.sql`
Expected: `BEGIN` / three `CREATE TABLE` / `CREATE INDEX` / `COMMIT`, no errors.

- [ ] **Step 5: Verify the tables exist**

Run: `psql "$DATABASE_URL" -c "\d edc_v2.deal_meddpicc_answers"`
Expected: column list matching the SQL above, including the `deal_meddpicc_answer_uq` unique constraint.

- [ ] **Step 6: Commit**

```bash
git add lib/db/src/schema/edc_v2_intel.ts lib/db/sql/2026-07-24-meddpicc-scoring.sql
git commit -m "feat(db): add MEDDPICC question/answer/score tables"
```

---

### Task 3: Engine module — `computeMeddpiccScore` (TDD)

**Files:**
- Create: `lib/engine/src/meddpicc.ts`
- Test: `lib/engine/src/meddpicc.test.ts`

**Interfaces:**
- Produces: `QUESTION_CATALOG: MeddpiccQuestion[]`, `MeddpiccQuestion`, `MeddpiccPillar`, `StageBucket`, `MeddpiccThresholds`, `DEFAULT_MEDDPICC_THRESHOLDS`, `PillarBreakdownEntry`, `RagStatus`, `MeddpiccScoreResult`, `computeMeddpiccScore(answers, stageBucket, thresholds?)`, `stageBucketForStageName(stageName)` — all from `lib/engine/src/meddpicc.ts`.
- Consumes: nothing (pure module, no DB).

- [ ] **Step 1: Write the failing test file**

Create `lib/engine/src/meddpicc.test.ts`:

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
  it("has exactly 43 questions", () => {
    expect(QUESTION_CATALOG).toHaveLength(43);
  });

  it("has unique, sequential questionOrder values 1-43", () => {
    const orders = QUESTION_CATALOG.map((q) => q.questionOrder).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: 43 }, (_, i) => i + 1));
  });

  it("stage-tag counts match the source template (27 Q, 9 P, 7 N)", () => {
    const byTag = (tag: string) => QUESTION_CATALOG.filter((q) => q.stageTag === tag).length;
    expect(byTag("Q")).toBe(27);
    expect(byTag("P")).toBe(9);
    expect(byTag("N")).toBe(7);
  });

  it("pillar max points sum to 129", () => {
    const maxByPillar = new Map<string, number>();
    for (const q of QUESTION_CATALOG as MeddpiccQuestion[]) {
      maxByPillar.set(q.pillar, (maxByPillar.get(q.pillar) ?? 0) + 3);
    }
    const total = [...maxByPillar.values()].reduce((s, v) => s + v, 0);
    expect(total).toBe(129);
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
    expect(r.unknownCount).toBe(43);
    expect(r.strongNoCount).toBe(0);
  });

  it("scores 100% overall and Green when every question is a Strong Yes (3)", () => {
    const answers: Record<number, number> = {};
    for (const q of QUESTION_CATALOG) answers[q.questionOrder] = 3;
    const r = computeMeddpiccScore(answers, "Negotiation");
    expect(r.overallScore).toBe(129);
    expect(r.overallPct).toBe(100);
    expect(r.ragStatus).toBe("Green");
    expect(r.unknownCount).toBe(0);
  });

  it("Metrics pillar max is 15 (5 questions x 3) and reflects partial answers", () => {
    const answers: Record<number, number> = { 1: 3, 2: 3, 3: 0, 4: 0, 5: 0 };
    const r = computeMeddpiccScore(answers, "Negotiation");
    const metrics = r.pillarBreakdown.find((p) => p.pillar === "Metrics");
    expect(metrics).toEqual({ pillar: "Metrics", raw: 6, max: 15, pct: 40 });
  });

  it("stagePct only counts Q-tagged questions in the Qualification bucket", () => {
    const answers: Record<number, number> = {};
    for (const q of QUESTION_CATALOG.filter((q) => q.stageTag === "Q")) {
      answers[q.questionOrder] = 3;
    }
    const r = computeMeddpiccScore(answers, "Qualification");
    expect(r.stagePct).toBe(100); // all 27 Q-tagged questions maxed
    expect(r.overallPct).toBeLessThan(100); // P/N questions still unanswered
  });

  it("RAG boundaries: <40 Red, 40-75 inclusive Amber, >75 Green", () => {
    const at = (pct: number) => {
      const score = Math.round((pct / 100) * 129);
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
    const r = computeMeddpiccScore({ 1: 1, 2: 0, 3: 1 }, "Negotiation");
    expect(r.strongNoCount).toBe(2);
    expect(r.unknownCount).toBe(41); // 40 unanswered + question 2 explicitly rated 0
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/engine exec vitest run src/meddpicc.test.ts`
Expected: FAIL — `Cannot find module './meddpicc'`.

- [ ] **Step 3: Write `lib/engine/src/meddpicc.ts`**

```ts
// MEDDPICC Auto-Scoring — pure & isomorphic, ported from the dealpad.io
// MEDDPICC Analysis Template (43 questions, 8 pillars, 0-3 scored).

export type MeddpiccPillar =
  | "Metrics"
  | "EconomicBuyer"
  | "DecisionCriteria"
  | "DecisionProcess"
  | "PaperProcess"
  | "IdentifyPain"
  | "Champion"
  | "Competition";

export type StageTag = "Q" | "P" | "N";

export interface MeddpiccQuestion {
  questionOrder: number; // 1-43
  pillar: MeddpiccPillar;
  stageTag: StageTag;
  questionText: string;
  helpText?: string;
}

export const QUESTION_CATALOG: MeddpiccQuestion[] = [
  { questionOrder: 1, pillar: "Metrics", stageTag: "Q", questionText: "Does our solution make the project viable and will it deliver significant improvements?" },
  { questionOrder: 2, pillar: "Metrics", stageTag: "Q", questionText: "Do we fully understand what value the customer is seeking to get? Business outcomes, measurements or results known." },
  { questionOrder: 3, pillar: "Metrics", stageTag: "Q", questionText: "Are there serious business/technical/financial implications if the project is not executed?" },
  { questionOrder: 4, pillar: "Metrics", stageTag: "Q", questionText: "Is there an on-going benefit to the customer's business?" },
  { questionOrder: 5, pillar: "Metrics", stageTag: "Q", questionText: "Is there a pertinent ROI story that can be translated into $ value?" },

  { questionOrder: 6, pillar: "EconomicBuyer", stageTag: "P", questionText: "Do we know who has the power to spend the budget?" },
  { questionOrder: 7, pillar: "EconomicBuyer", stageTag: "P", questionText: "Additional financial approvers identified?" },
  { questionOrder: 8, pillar: "EconomicBuyer", stageTag: "P", questionText: "Do we understand the economic buyer's mindset, expectations and priorities?" },
  { questionOrder: 9, pillar: "EconomicBuyer", stageTag: "Q", questionText: "Has budget been approved internally?" },
  { questionOrder: 10, pillar: "EconomicBuyer", stageTag: "P", questionText: "Do we understand the economic buyer's challenges and buying criteria?" },

  { questionOrder: 11, pillar: "DecisionCriteria", stageTag: "Q", questionText: "Do we understand the vendor evaluation/selection criteria and how it will be weighted?" },
  { questionOrder: 12, pillar: "DecisionCriteria", stageTag: "Q", questionText: "Do we understand the customer's decision criteria for each stage in their purchasing cycle?" },
  { questionOrder: 13, pillar: "DecisionCriteria", stageTag: "Q", questionText: "Do we understand who or what organization will influence each decision criteria?" },
  { questionOrder: 14, pillar: "DecisionCriteria", stageTag: "Q", questionText: "The customer is not buying on the lowest price." },
  { questionOrder: 15, pillar: "DecisionCriteria", stageTag: "P", questionText: "The contract terms and conditions are acceptable to us and to the customer?" },

  { questionOrder: 16, pillar: "DecisionProcess", stageTag: "N", questionText: "Have we met with the key decision makers (C-level) to discuss their needs and the strengths of our solution?" },
  { questionOrder: 17, pillar: "DecisionProcess", stageTag: "Q", questionText: "Have we identified the individuals with decision-making powers and the roles each play in this specific opportunity?" },
  { questionOrder: 18, pillar: "DecisionProcess", stageTag: "Q", questionText: "Do we fully understand the customer timeline and is it realistic?" },
  { questionOrder: 19, pillar: "DecisionProcess", stageTag: "Q", questionText: "Do we understand what decision will be made at each stage of the process, when it will happen and who will be involved?" },
  { questionOrder: 20, pillar: "DecisionProcess", stageTag: "P", questionText: "Do we have internal teams on-board to support the customer with any queries at each stage of the process?" },

  { questionOrder: 21, pillar: "PaperProcess", stageTag: "P", questionText: "Do we understand their signature process and identified all the signatories?" },
  { questionOrder: 22, pillar: "PaperProcess", stageTag: "Q", questionText: "Do we have an existing MSA that we can leverage? If not, have we submitted our MSA for review?" },
  { questionOrder: 23, pillar: "PaperProcess", stageTag: "N", questionText: "SOW or CO drafted and ready or with the customer for review?" },

  { questionOrder: 24, pillar: "IdentifyPain", stageTag: "Q", questionText: "Are they an existing customer or new customer?", helpText: "Score 3 if already a customer with a won deal on record, otherwise 2 — this is never a real \"no.\"" },
  { questionOrder: 25, pillar: "IdentifyPain", stageTag: "P", questionText: "Do we fully understand the customer's requirements, the problem they are trying to address and the outcome they want to achieve?" },
  { questionOrder: 26, pillar: "IdentifyPain", stageTag: "N", questionText: "Our proposal contains win themes, competitive advantages and addresses the concerns of discriminators and distractors." },
  { questionOrder: 27, pillar: "IdentifyPain", stageTag: "Q", questionText: "Is there a compelling event to close within the timeframe identified — will the project reduce cost, improve agility, or mitigate risk?", helpText: "Score 3 if yes and you can name the compelling event, 0 if you're still just checking." },
  { questionOrder: 28, pillar: "IdentifyPain", stageTag: "N", questionText: "The technical, operational and commercial proposal satisfies requirements and fits the customer's business strategy." },
  { questionOrder: 29, pillar: "IdentifyPain", stageTag: "Q", questionText: "Does our standard solution solve the customer's problem?" },
  { questionOrder: 30, pillar: "IdentifyPain", stageTag: "Q", questionText: "Can we fully deliver on all mandatory requirements?" },
  { questionOrder: 31, pillar: "IdentifyPain", stageTag: "Q", questionText: "Are any non-compliant areas not show-stoppers?" },
  { questionOrder: 32, pillar: "IdentifyPain", stageTag: "Q", questionText: "Can we deliver any non-standard requirements?" },
  { questionOrder: 33, pillar: "IdentifyPain", stageTag: "Q", questionText: "Are partners needed, and if so, have they been identified and on-boarded?", helpText: "Score 3 if not needed or already engaged, 1-2 if in process, 0 if needed but not yet identified." },

  { questionOrder: 34, pillar: "Champion", stageTag: "P", questionText: "Have we identified champion(s)?" },
  { questionOrder: 35, pillar: "Champion", stageTag: "N", questionText: "Do they fully understand the value we will deliver and are they most likely to benefit from our solution?" },
  { questionOrder: 36, pillar: "Champion", stageTag: "N", questionText: "Are the champions prepared to become true defenders of the cause and sell our solution within their organization on our behalf?" },
  { questionOrder: 37, pillar: "Champion", stageTag: "N", questionText: "Do the champions have the influencing power, good track record, and acceptance by peers/decision makers to swing the decision in our favor?" },

  { questionOrder: 38, pillar: "Competition", stageTag: "Q", questionText: "Have we had early engagement to influence the client against the competition?" },
  { questionOrder: 39, pillar: "Competition", stageTag: "Q", questionText: "Do we have a strong relationship with the customer and a distinct competitive advantage from the start?" },
  { questionOrder: 40, pillar: "Competition", stageTag: "Q", questionText: "Is there a compelling event needing them to move away from their incumbent?" },
  { questionOrder: 41, pillar: "Competition", stageTag: "Q", questionText: "If a competitor is favored by the customer, can we overcome this?" },
  { questionOrder: 42, pillar: "Competition", stageTag: "Q", questionText: "Do we have reference customers with similar outcomes in the same sector?" },
  { questionOrder: 43, pillar: "Competition", stageTag: "Q", questionText: "Will winning open up new market opportunities for us?" },
];

const PILLAR_ORDER: MeddpiccPillar[] = [
  "Metrics",
  "EconomicBuyer",
  "DecisionCriteria",
  "DecisionProcess",
  "PaperProcess",
  "IdentifyPain",
  "Champion",
  "Competition",
];

const TOTAL_MAX = QUESTION_CATALOG.length * 3; // 129

export type StageBucket = "Qualification" | "Proposition" | "Negotiation";

const STAGE_BUCKET_MAP: Record<string, StageBucket> = {
  Discovery: "Qualification",
  Validation: "Proposition",
  Commercial: "Proposition",
  Procurement: "Negotiation",
  "Closed-Won": "Negotiation",
  "Closed-Lost": "Negotiation",
};

/** Unknown/future stage names default to the full model (safest — no under-counting). */
export function stageBucketForStageName(stageName: string): StageBucket {
  return STAGE_BUCKET_MAP[stageName] ?? "Negotiation";
}

function stageFilter(bucket: StageBucket): (q: MeddpiccQuestion) => boolean {
  if (bucket === "Qualification") return (q) => q.stageTag === "Q";
  if (bucket === "Proposition") return (q) => q.stageTag !== "N";
  return () => true;
}

export interface MeddpiccThresholds {
  redMax: number;
  greenMin: number;
}

export const DEFAULT_MEDDPICC_THRESHOLDS: MeddpiccThresholds = { redMax: 40, greenMin: 75 };

export interface PillarBreakdownEntry {
  pillar: MeddpiccPillar;
  raw: number;
  max: number;
  pct: number;
}

export type RagStatus = "Red" | "Amber" | "Green";

export interface MeddpiccScoreResult {
  overallScore: number;
  overallPct: number;
  stagePct: number;
  ragStatus: RagStatus;
  pillarBreakdown: PillarBreakdownEntry[];
  strongNoCount: number;
  unknownCount: number;
}

function ragFor(pct: number, thresholds: MeddpiccThresholds): RagStatus {
  if (pct < thresholds.redMax) return "Red";
  if (pct > thresholds.greenMin) return "Green";
  return "Amber";
}

export function computeMeddpiccScore(
  answers: Record<number, number | null | undefined>,
  stageBucket: StageBucket,
  thresholds: MeddpiccThresholds = DEFAULT_MEDDPICC_THRESHOLDS,
): MeddpiccScoreResult {
  let overallScore = 0;
  let strongNoCount = 0;
  let unknownCount = 0;
  const pillarTotals = new Map<MeddpiccPillar, { raw: number; max: number }>();

  for (const q of QUESTION_CATALOG) {
    const raw = answers[q.questionOrder];
    const score = typeof raw === "number" ? raw : 0; // unanswered counts as 0, fixed denominator
    overallScore += score;
    if (raw === 1) strongNoCount++;
    if (raw == null || raw === 0) unknownCount++;

    const bucket = pillarTotals.get(q.pillar) ?? { raw: 0, max: 0 };
    bucket.raw += score;
    bucket.max += 3;
    pillarTotals.set(q.pillar, bucket);
  }

  const pillarBreakdown: PillarBreakdownEntry[] = PILLAR_ORDER.map((pillar) => {
    const t = pillarTotals.get(pillar) ?? { raw: 0, max: 0 };
    return { pillar, raw: t.raw, max: t.max, pct: t.max > 0 ? Math.round((t.raw / t.max) * 100) : 0 };
  });

  const overallPct = Math.round((overallScore / TOTAL_MAX) * 100);

  const stageQuestions = QUESTION_CATALOG.filter(stageFilter(stageBucket));
  const stageMax = stageQuestions.length * 3;
  const stageRaw = stageQuestions.reduce((sum, q) => {
    const raw = answers[q.questionOrder];
    return sum + (typeof raw === "number" ? raw : 0);
  }, 0);
  const stagePct = stageMax > 0 ? Math.round((stageRaw / stageMax) * 100) : 0;

  return {
    overallScore,
    overallPct,
    stagePct,
    ragStatus: ragFor(overallPct, thresholds),
    pillarBreakdown,
    strongNoCount,
    unknownCount,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @workspace/engine exec vitest run src/meddpicc.test.ts`
Expected: PASS, all 12 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/engine/src/meddpicc.ts lib/engine/src/meddpicc.test.ts
git commit -m "feat(engine): add computeMeddpiccScore pure scoring module"
```

---

### Task 4: Export the engine module

**Files:**
- Modify: `lib/engine/src/index.ts`

**Interfaces:**
- Consumes: everything exported by `lib/engine/src/meddpicc.ts` (Task 3).
- Produces: `import { computeMeddpiccScore, stageBucketForStageName, QUESTION_CATALOG, DEFAULT_MEDDPICC_THRESHOLDS, type MeddpiccScoreResult, type MeddpiccThresholds } from "@workspace/engine"` becomes valid.

- [ ] **Step 1: Add the barrel export**

In `lib/engine/src/index.ts`, in the "V2 Sovereign Intelligence — pure modules" export block (alongside `export * from "./scoring";` etc.), add:

```ts
export * from "./meddpicc";
```

- [ ] **Step 2: Typecheck**

Run: `pnpm run typecheck:libs`
Expected: no errors, no export-name collisions (confirm no other engine module already exports a symbol named `MeddpiccQuestion`, `computeMeddpiccScore`, etc. — `grep -rn "MeddpiccQuestion\|computeMeddpiccScore" lib/engine/src` should show only `meddpicc.ts`/`meddpicc.test.ts`).

- [ ] **Step 3: Commit**

```bash
git add lib/engine/src/index.ts
git commit -m "feat(engine): export meddpicc module from package barrel"
```

---

### Task 5: Seed the 43-question catalog

**Files:**
- Modify: `artifacts/api-server/src/seed.ts`

**Interfaces:**
- Consumes: `QUESTION_CATALOG` from `@workspace/engine` (Task 4), `meddpiccQuestions` from `@workspace/db` (Task 2).
- Produces: `seedMeddpiccQuestions()` called from `main()`.

- [ ] **Step 1: Add the import**

In `artifacts/api-server/src/seed.ts`, add to the existing `@workspace/engine`-style imports (or add a new import line near the top):

```ts
import { QUESTION_CATALOG } from "@workspace/engine";
import { meddpiccQuestions } from "@workspace/db"; // add to the existing @workspace/db import if one exists
```

- [ ] **Step 2: Add the seed function**, following the `seedPlaybooks()` presence-check guard pattern exactly:

```ts
async function seedMeddpiccQuestions() {
  const existing = await db.select({ id: meddpiccQuestions.id }).from(meddpiccQuestions).limit(1);
  if (existing.length > 0) {
    logger.info("MEDDPICC questions already present — skipping MEDDPICC seed");
    return;
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

- [ ] **Step 3: Call it from `main()`**

In `main()`, add the call alongside the existing seed calls (order doesn't matter relative to `seedPlaybooks()` — no FK dependency between them):

```ts
await seedLookups();
await seedPlaybooks();
await seedMeddpiccQuestions();
await seedCommander();
await seedDeals();
```

- [ ] **Step 4: Run the seed and verify**

Run: `pnpm --filter @workspace/api-server run seed`
Expected: log line `Seeded 43 MEDDPICC questions` on first run.

Run again: `pnpm --filter @workspace/api-server run seed`
Expected: log line `MEDDPICC questions already present — skipping MEDDPICC seed` (idempotency confirmed).

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/seed.ts
git commit -m "feat(seed): seed the 43-question MEDDPICC catalog"
```

---

### Task 6: Add tunable RAG thresholds

**Files:**
- Modify: `artifacts/api-server/src/seed.ts` (the `seedLookups()` array)
- Create: `lib/db/sql/2026-07-24-meddpicc-thresholds.sql`

**Interfaces:**
- Produces: two rows in `engine_thresholds` (`meddpicc_red_max`, `meddpicc_green_min`) that the existing Settings → Thresholds tab auto-renders (no frontend code change).

- [ ] **Step 1: Add the two rows to `seedLookups()`**

In `artifacts/api-server/src/seed.ts`, inside the array passed to `db.insert(engineThresholds).values([...])` in `seedLookups()`, add:

```ts
{ parameterKey: "meddpicc_red_max", parameterValue: "40", dataType: "number", description: "MEDDPICC overall % below which the qualification RAG badge shows Red" },
{ parameterKey: "meddpicc_green_min", parameterValue: "75", dataType: "number", description: "MEDDPICC overall % above which the qualification RAG badge shows Green" },
```

- [ ] **Step 2: Ship the idempotent SQL for already-seeded dev databases**

Create `lib/db/sql/2026-07-24-meddpicc-thresholds.sql`:

```sql
-- MEDDPICC Auto-Scoring (2026-07-24) — RAG threshold defaults.
--
-- Adds the two tunable thresholds the MEDDPICC scoring engine reads
-- (meddpicc_red_max, meddpicc_green_min). Safe to re-run: ON CONFLICT DO NOTHING.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-24-meddpicc-thresholds.sql

BEGIN;

INSERT INTO public.engine_thresholds (parameter_key, parameter_value, data_type, description)
VALUES
  ('meddpicc_red_max', '40', 'number', 'MEDDPICC overall % below which the qualification RAG badge shows Red'),
  ('meddpicc_green_min', '75', 'number', 'MEDDPICC overall % above which the qualification RAG badge shows Green')
ON CONFLICT (parameter_key) DO NOTHING;

COMMIT;
```

- [ ] **Step 3: Apply and verify**

Run: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f lib/db/sql/2026-07-24-meddpicc-thresholds.sql`
Run: `psql "$DATABASE_URL" -c "SELECT parameter_key, parameter_value FROM engine_thresholds WHERE parameter_key LIKE 'meddpicc_%'"`
Expected: two rows, `40` and `75`.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/seed.ts lib/db/sql/2026-07-24-meddpicc-thresholds.sql
git commit -m "feat(config): add tunable MEDDPICC RAG thresholds"
```

---

### Task 7: Auto-suggestion signals module (TDD, real-DB integration tests)

This repo tests DB-touching lib code with real Postgres integration tests (see `subscribers/playbook-engine.test.ts`), not mocks — follow that convention.

**Files:**
- Create: `artifacts/api-server/src/lib/meddpicc-signals.ts`
- Test: `artifacts/api-server/src/lib/meddpicc-signals.test.ts`

**Interfaces:**
- Consumes: `db`, `pool`, `enterpriseDeals`, `dealMemory`, `stakeholders`, `dealTechnicalGates`, `dealCompetitors`, `dealPlaybookAssignments`, `playbooks`, `playbookSteps`, `playbookStepCompletions`, `pricingModels`, `servicesTiers`, `pipelineStages` from `@workspace/db`; `competitorWinRates` from `./competitive`.
- Produces: `export interface MeddpiccSuggestion { questionOrder: number; suggestedScore: number; reason: string }` and `export async function getMeddpiccSuggestions(dealId: string): Promise<MeddpiccSuggestion[]>` — consumed by Task 8.

- [ ] **Step 1: Write the failing test**

Create `artifacts/api-server/src/lib/meddpicc-signals.test.ts`:

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
} from "@workspace/db";
import { getMeddpiccSuggestions } from "./meddpicc-signals";

const createdDealIds: string[] = [];

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
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
});

describe("getMeddpiccSuggestions", () => {
  it("returns no Champion or Economic Buyer suggestion for a deal with no stakeholders", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-a`);
    const suggestions = await getMeddpiccSuggestions(dealId);
    expect(suggestions.find((s) => s.questionOrder === 34)?.suggestedScore).toBe(1); // no champion → 1
    expect(suggestions.find((s) => s.questionOrder === 6)?.suggestedScore).toBe(0); // no EB → 0
  });

  it("suggests Strong Yes for Champion (Q34) once a Champion stakeholder exists", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-b`);
    await db.insert(stakeholders).values({
      dealId,
      name: "Jane Doe",
      roleType: "Champion",
      influenceLevel: "High",
      sentiment: "Champion",
    });
    const suggestions = await getMeddpiccSuggestions(dealId);
    expect(suggestions.find((s) => s.questionOrder === 34)?.suggestedScore).toBe(3);
  });

  it("suggests Strong Yes for Economic Buyer known (Q6) once an Economic Buyer stakeholder exists", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-c`);
    await db.insert(stakeholders).values({
      dealId,
      name: "Big Boss",
      roleType: "Economic Buyer",
      influenceLevel: "High",
      sentiment: "Neutral",
    });
    const suggestions = await getMeddpiccSuggestions(dealId);
    expect(suggestions.find((s) => s.questionOrder === 6)?.suggestedScore).toBe(3);
  });

  it("suggests 3 for existing-customer (Q24) when the account has a prior Won deal", async () => {
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
    const suggestions = await getMeddpiccSuggestions(dealId);
    expect(suggestions.find((s) => s.questionOrder === 24)?.suggestedScore).toBe(3);
    await db.delete(dealMemory).where(inArray(dealMemory.id, [prior.id]));
  });

  it("suggests 2 for existing-customer (Q24) when the account has no prior Won deal", async () => {
    const dealId = await createDeal(1, `Net New Acct ${Date.now()}`);
    const suggestions = await getMeddpiccSuggestions(dealId);
    expect(suggestions.find((s) => s.questionOrder === 24)?.suggestedScore).toBe(2);
  });

  it("returns no Paper Process suggestions when the deal has no Procurement/Legal playbook assignment", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-d`);
    const suggestions = await getMeddpiccSuggestions(dealId);
    expect(suggestions.find((s) => s.questionOrder === 21)).toBeUndefined();
    expect(suggestions.find((s) => s.questionOrder === 22)).toBeUndefined();
  });

  it("returns no Competition suggestion when the deal has no tracked competitors", async () => {
    const dealId = await createDeal(1, `Acct ${Date.now()}-e`);
    const suggestions = await getMeddpiccSuggestions(dealId);
    expect(suggestions.find((s) => s.questionOrder === 39)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/meddpicc-signals.test.ts`
Expected: FAIL — `Cannot find module './meddpicc-signals'`.

- [ ] **Step 3: Write `meddpicc-signals.ts`**

```ts
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
  const executiveAgreed = gates.some((g) => g.isCompleted && /EXEC|AGREED|G1/i.test(g.gateCode));
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/meddpicc-signals.test.ts`
Expected: PASS, all 7 tests. (Requires the local dev Postgres to be running with `seedLookups`/`seedPlaybooks` already applied — see `Deal-Commander/CLAUDE.md` for the local DB setup.)

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/meddpicc-signals.ts artifacts/api-server/src/lib/meddpicc-signals.test.ts
git commit -m "feat(api): add MEDDPICC auto-suggestion signals"
```

---

### Task 8: Server score service — assemble, compute, persist

**Files:**
- Create: `artifacts/api-server/src/lib/meddpicc.ts`
- Test: `artifacts/api-server/src/lib/meddpicc.test.ts`

**Interfaces:**
- Consumes: `getMeddpiccSuggestions` (Task 7); `computeMeddpiccScore`, `stageBucketForStageName`, `DEFAULT_MEDDPICC_THRESHOLDS`, `QUESTION_CATALOG`, `type MeddpiccScoreResult` from `@workspace/engine` (Task 4); `meddpiccQuestions`, `dealMeddpiccAnswers`, `dealMeddpiccScores`, `engineThresholds`, `enterpriseDeals`, `pipelineStages` from `@workspace/db`.
- Produces: `computeMeddpiccScoreForDeal(dealId)`, `getMeddpiccAssessment(dealId)`, `upsertMeddpiccAnswer(dealId, questionOrder, input, actor)`, `getLatestMeddpiccScore(dealId)` — consumed by Tasks 10 (subscriber), 11 (snapshots), 13 (routes).

- [ ] **Step 1: Write the failing test**

Create `artifacts/api-server/src/lib/meddpicc.test.ts`:

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
  const [stage] = await db.select().from(pipelineStages).where(
    // any stage whose name matches; falls back to first stage if not found
    stageName ? (undefined as never) : (undefined as never),
  );
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
  it("scores 0% for a brand-new deal with no answers and persists a snapshot row", async () => {
    const dealId = await createDeal("Discovery");
    const result = await computeMeddpiccScoreForDeal(dealId);
    expect(result?.overallPct).toBe(0);
    expect(result?.ragStatus).toBe("Red");
    const latest = await getLatestMeddpiccScore(dealId);
    expect(latest?.overallPct).toBe(0);
  });

  it("returns null for a non-existent deal", async () => {
    const result = await computeMeddpiccScoreForDeal("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });
});

describe("getMeddpiccAssessment / upsertMeddpiccAnswer", () => {
  it("returns all 43 questions with null answers before anything is scored", async () => {
    const dealId = await createDeal("Discovery");
    const assessment = await getMeddpiccAssessment(dealId);
    expect(assessment?.questions).toHaveLength(43);
    expect(assessment?.answers.every((a) => a.score === null)).toBe(true);
  });

  it("upserts an answer and reflects it in the next assessment + score", async () => {
    const dealId = await createDeal("Discovery");
    await upsertMeddpiccAnswer(dealId, 1, { score: 3 }, "vitest");
    const assessment = await getMeddpiccAssessment(dealId);
    const answer = assessment?.answers.find((a) => a.questionOrder === 1);
    expect(answer?.score).toBe(3);
    expect(assessment?.score.overallScore).toBeGreaterThanOrEqual(3);
  });

  it("marks isAutoSuggested true when the saved score matches the live suggestion", async () => {
    const dealId = await createDeal("Discovery");
    // Q24 (existing customer) always has a suggestion (3 or 2) even with no data.
    const before = await getMeddpiccAssessment(dealId);
    const suggestion = before?.suggestions.find((s) => s.questionOrder === 24);
    expect(suggestion).toBeDefined();
    await upsertMeddpiccAnswer(dealId, 24, { score: suggestion!.suggestedScore }, "vitest");
    const after = await getMeddpiccAssessment(dealId);
    expect(after?.answers.find((a) => a.questionOrder === 24)?.isAutoSuggested).toBe(true);
  });

  it("upserting the same question twice updates rather than duplicates", async () => {
    const dealId = await createDeal("Discovery");
    await upsertMeddpiccAnswer(dealId, 5, { score: 1 }, "vitest");
    await upsertMeddpiccAnswer(dealId, 5, { score: 3, note: "changed my mind" }, "vitest");
    const assessment = await getMeddpiccAssessment(dealId);
    const answer = assessment?.answers.find((a) => a.questionOrder === 5);
    expect(answer?.score).toBe(3);
    expect(answer?.note).toBe("changed my mind");
  });
});

describe("stage bucket wiring", () => {
  it("uses the Qualification bucket (Q-tagged /81) for a Discovery-stage deal", async () => {
    const dealId = await createDeal("Discovery");
    for (const order of [1, 2, 3, 4, 5]) await upsertMeddpiccAnswer(dealId, order, { score: 3 }, "vitest");
    const result = await computeMeddpiccScoreForDeal(dealId);
    // 5 Metrics questions (all Q-tagged) x 3 = 15 of 81 possible stage points.
    expect(result?.stagePct).toBe(Math.round((15 / 81) * 100));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/meddpicc.test.ts`
Expected: FAIL — `Cannot find module './meddpicc'`.

- [ ] **Step 3: Write `artifacts/api-server/src/lib/meddpicc.ts`**

```ts
import { and, asc, eq, desc } from "drizzle-orm";
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
import { getMeddpiccSuggestions, type MeddpiccSuggestion } from "./meddpicc-signals";
import { notFound } from "./http";

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

async function loadAnswerMap(dealId: string): Promise<Record<number, number | null>> {
  const rows = await db
    .select({ questionOrder: meddpiccQuestions.questionOrder, score: dealMeddpiccAnswers.score })
    .from(meddpiccQuestions)
    .leftJoin(
      dealMeddpiccAnswers,
      and(eq(dealMeddpiccAnswers.questionId, meddpiccQuestions.id), eq(dealMeddpiccAnswers.dealId, dealId)),
    );
  const answers: Record<number, number | null> = {};
  for (const r of rows) answers[r.questionOrder] = r.score ?? null;
  return answers;
}

export async function computeMeddpiccScoreForDeal(dealId: string): Promise<MeddpiccScoreResult | null> {
  const [deal] = await db
    .select({ stageName: pipelineStages.stageName })
    .from(enterpriseDeals)
    .leftJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(eq(enterpriseDeals.id, dealId))
    .limit(1);
  if (!deal) return null;

  const [answers, thresholds] = await Promise.all([loadAnswerMap(dealId), loadThresholds()]);
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

export interface MeddpiccAnswerView {
  questionOrder: number;
  score: number | null;
  note: string | null;
  isAutoSuggested: boolean;
}

export interface MeddpiccAssessment {
  questions: typeof QUESTION_CATALOG;
  answers: MeddpiccAnswerView[];
  suggestions: MeddpiccSuggestion[];
  score: MeddpiccScoreResult;
}

export async function getMeddpiccAssessment(dealId: string): Promise<MeddpiccAssessment | null> {
  const [deal] = await db
    .select({ id: enterpriseDeals.id })
    .from(enterpriseDeals)
    .where(eq(enterpriseDeals.id, dealId))
    .limit(1);
  if (!deal) return null;

  const rows = await db
    .select({
      questionOrder: meddpiccQuestions.questionOrder,
      score: dealMeddpiccAnswers.score,
      note: dealMeddpiccAnswers.note,
      isAutoSuggested: dealMeddpiccAnswers.isAutoSuggested,
    })
    .from(meddpiccQuestions)
    .leftJoin(
      dealMeddpiccAnswers,
      and(eq(dealMeddpiccAnswers.questionId, meddpiccQuestions.id), eq(dealMeddpiccAnswers.dealId, dealId)),
    )
    .orderBy(asc(meddpiccQuestions.questionOrder));

  const [suggestions, score] = await Promise.all([
    getMeddpiccSuggestions(dealId),
    computeMeddpiccScoreForDeal(dealId),
  ]);
  if (!score) return null;

  return {
    questions: QUESTION_CATALOG,
    answers: rows.map((r) => ({
      questionOrder: r.questionOrder,
      score: r.score ?? null,
      note: r.note ?? null,
      isAutoSuggested: r.isAutoSuggested ?? false,
    })),
    suggestions,
    score,
  };
}

export async function upsertMeddpiccAnswer(
  dealId: string,
  questionOrder: number,
  input: { score: number; note?: string | null },
  actor: string,
): Promise<void> {
  const [question] = await db
    .select({ id: meddpiccQuestions.id })
    .from(meddpiccQuestions)
    .where(eq(meddpiccQuestions.questionOrder, questionOrder))
    .limit(1);
  if (!question) throw notFound(`No MEDDPICC question with order ${questionOrder}`);

  const suggestions = await getMeddpiccSuggestions(dealId);
  const suggestion = suggestions.find((s) => s.questionOrder === questionOrder);
  const isAutoSuggested = suggestion?.suggestedScore === input.score;

  await db
    .insert(dealMeddpiccAnswers)
    .values({
      dealId,
      questionId: question.id,
      score: input.score,
      note: input.note ?? null,
      isAutoSuggested,
      suggestedScore: suggestion?.suggestedScore ?? null,
      answeredAt: new Date(),
      answeredBy: actor,
    })
    .onConflictDoUpdate({
      target: [dealMeddpiccAnswers.dealId, dealMeddpiccAnswers.questionId],
      set: {
        score: input.score,
        note: input.note ?? null,
        isAutoSuggested,
        suggestedScore: suggestion?.suggestedScore ?? null,
        answeredAt: new Date(),
        answeredBy: actor,
      },
    });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/meddpicc.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/lib/meddpicc.ts artifacts/api-server/src/lib/meddpicc.test.ts
git commit -m "feat(api): add MEDDPICC score service (assemble, compute, persist)"
```

---

### Task 9: Add the `meddpicc.answer_changed` event

**Files:**
- Modify: `artifacts/api-server/src/lib/events.ts`
- Modify: `artifacts/api-server/src/lib/subscribers/activity-logger.ts`

**Interfaces:**
- Produces: `"meddpicc.answer_changed": DealEventBase & { questionOrder: number; score: number }` as a valid key of `DealEventPayloads`; `emitDealEvent("meddpicc.answer_changed", {...})` becomes callable (used by Task 13's route).

- [ ] **Step 1: Add the event type**

In `artifacts/api-server/src/lib/events.ts`, add to the `DealEventPayloads` type (alongside `"playbook.step_changed"` etc.):

```ts
"meddpicc.answer_changed": DealEventBase & { questionOrder: number; score: number };
```

- [ ] **Step 2: Add the exhaustive-switch case in `activity-logger.ts`**

In `summarize(event)`, add:

```ts
case "meddpicc.answer_changed":
  return `MEDDPICC question ${event.questionOrder} scored ${event.score}`;
```

In `entityOf(event)`, add:

```ts
case "meddpicc.answer_changed":
  return { entityType: "meddpicc", entityId: String(event.questionOrder) };
```

- [ ] **Step 3: Typecheck**

Run: `pnpm run typecheck`
Expected: no errors. (If either switch is missing a case, TypeScript's exhaustiveness check on the discriminated union fails to compile — that's the safety net this step is proving.)

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/lib/events.ts artifacts/api-server/src/lib/subscribers/activity-logger.ts
git commit -m "feat(events): add meddpicc.answer_changed event type"
```

---

### Task 10: Recompute + auto-complete subscriber (integration test)

**Files:**
- Create: `artifacts/api-server/src/lib/subscribers/meddpicc.ts`
- Modify: `artifacts/api-server/src/lib/subscribers/index.ts`
- Test: `artifacts/api-server/src/lib/subscribers/meddpicc.test.ts`

**Interfaces:**
- Consumes: `computeMeddpiccScoreForDeal` (Task 8); `recomputeAssignment`, `dealIdForAssignment` (Task 1, now in `playbook-signals.ts`); `emitDealEvent`, `dealEvents` from `./events`.
- Produces: `export function registerMeddpicc(): () => void`, registered in `subscribers/index.ts`.

- [ ] **Step 1: Write the failing test**

Create `artifacts/api-server/src/lib/subscribers/meddpicc.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray, eq, and } from "drizzle-orm";
import {
  db,
  pool,
  enterpriseDeals,
  pricingModels,
  servicesTiers,
  pipelineStages,
  playbooks,
  dealPlaybookAssignments,
  playbookSteps,
  playbookStepCompletions,
} from "@workspace/db";
import { emitDealEvent } from "../events";
import { registerSubscribers, unregisterSubscribers } from "./index";
import { QUESTION_CATALOG } from "@workspace/engine";
import { upsertMeddpiccAnswer } from "../meddpicc";

const ACTOR = "vitest";
const createdDealIds: string[] = [];

async function poll<T>(fn: () => Promise<T>, predicate: (v: T) => boolean, timeoutMs = 10_000): Promise<T> {
  const start = Date.now();
  let last = await fn();
  while (!predicate(last)) {
    if (Date.now() - start > timeoutMs) return last;
    await new Promise((r) => setTimeout(r, 100));
    last = await fn();
  }
  return last;
}

async function createDiscoveryDeal(): Promise<string> {
  const [pricing] = await db.select().from(pricingModels).limit(1);
  const [tier] = await db.select().from(servicesTiers).limit(1);
  const [discovery] = await db.select().from(pipelineStages).where(eq(pipelineStages.stageName, "Discovery"));
  const [row] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: `Meddpicc Subscriber Test ${Date.now()}`,
      accountName: `Acct ${Date.now()}`,
      accountManager: "AM",
      technicalLead: "TL",
      salesStageId: discovery.id,
      pricingModelId: pricing.id,
      servicesTierId: tier.id,
      productRevenue: "100000",
      servicesRevenue: "0",
    })
    .returning({ id: enterpriseDeals.id });
  createdDealIds.push(row.id);
  return row.id;
}

async function assignDiscoveryPlaybook(dealId: string): Promise<string> {
  const [pb] = await db.select().from(playbooks).where(eq(playbooks.playbookName, "Discovery / Qualification Playbook"));
  const [assignment] = await db
    .insert(dealPlaybookAssignments)
    .values({ dealId, playbookId: pb.id })
    .returning({ id: dealPlaybookAssignments.id });
  return assignment.id;
}

async function stepStatus(assignmentId: string, stepName: string): Promise<string | undefined> {
  const [pb] = await db.select().from(playbooks).where(eq(playbooks.playbookName, "Discovery / Qualification Playbook"));
  const [step] = await db
    .select()
    .from(playbookSteps)
    .where(and(eq(playbookSteps.playbookId, pb.id), eq(playbookSteps.stepName, stepName)));
  const [completion] = await db
    .select()
    .from(playbookStepCompletions)
    .where(and(eq(playbookStepCompletions.assignmentId, assignmentId), eq(playbookStepCompletions.stepId, step.id)));
  return completion?.status;
}

beforeAll(() => {
  registerSubscribers();
});

afterAll(async () => {
  unregisterSubscribers();
  if (createdDealIds.length > 0) {
    await db.delete(enterpriseDeals).where(inArray(enterpriseDeals.id, createdDealIds));
  }
  await pool.end();
});

describe("MEDDPICC subscriber", () => {
  it("auto-completes the MEDDPICC qualification step once the score reaches Green", async () => {
    const dealId = await createDiscoveryDeal();
    const assignmentId = await assignDiscoveryPlaybook(dealId);

    for (const q of QUESTION_CATALOG) {
      await upsertMeddpiccAnswer(dealId, q.questionOrder, { score: 3 }, ACTOR);
    }
    emitDealEvent("meddpicc.answer_changed", { dealId, actor: ACTOR, questionOrder: 43, score: 3 });

    const status = await poll(
      () => stepStatus(assignmentId, "MEDDPICC qualification scored"),
      (s) => s === "completed",
    );
    expect(status).toBe("completed");
  });

  it("does not auto-complete the step if the rep already skipped it explicitly", async () => {
    const dealId = await createDiscoveryDeal();
    const assignmentId = await assignDiscoveryPlaybook(dealId);
    const [pb] = await db.select().from(playbooks).where(eq(playbooks.playbookName, "Discovery / Qualification Playbook"));
    const [step] = await db
      .select()
      .from(playbookSteps)
      .where(and(eq(playbookSteps.playbookId, pb.id), eq(playbookSteps.stepName, "MEDDPICC qualification scored")));
    await db.insert(playbookStepCompletions).values({
      assignmentId,
      stepId: step.id,
      status: "skipped",
      skipped: true,
      skipReason: "Not applicable for this deal",
    });

    for (const q of QUESTION_CATALOG) {
      await upsertMeddpiccAnswer(dealId, q.questionOrder, { score: 3 }, ACTOR);
    }
    emitDealEvent("meddpicc.answer_changed", { dealId, actor: ACTOR, questionOrder: 43, score: 3 });
    await new Promise((r) => setTimeout(r, 1500)); // give the (no-op) subscriber time to run

    const status = await stepStatus(assignmentId, "MEDDPICC qualification scored");
    expect(status).toBe("skipped"); // untouched — explicit rep decision respected
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/subscribers/meddpicc.test.ts`
Expected: FAIL — `Cannot find module './meddpicc'` (the subscriber file doesn't exist yet) or the test times out with `status` undefined.

- [ ] **Step 3: Write `artifacts/api-server/src/lib/subscribers/meddpicc.ts`**

```ts
import { and, eq } from "drizzle-orm";
import {
  db,
  dealPlaybookAssignments,
  playbooks,
  playbookSteps,
  playbookStepCompletions,
} from "@workspace/db";
import { dealEvents, emitDealEvent } from "../events";
import { computeMeddpiccScoreForDeal } from "../meddpicc";
import { recomputeAssignment, dealIdForAssignment } from "../playbook-signals";

const MEDDPICC_STEP_NAME = "MEDDPICC qualification scored";
const MEDDPICC_PLAYBOOK_NAME = "Discovery / Qualification Playbook";

async function autoCompleteMeddpiccStepIfGreen(dealId: string, overallPct: number): Promise<void> {
  const [row] = await db
    .select({
      assignmentId: dealPlaybookAssignments.id,
      stepId: playbookSteps.id,
      completionStatus: playbookStepCompletions.status,
    })
    .from(dealPlaybookAssignments)
    .innerJoin(playbooks, eq(dealPlaybookAssignments.playbookId, playbooks.id))
    .innerJoin(
      playbookSteps,
      and(eq(playbookSteps.playbookId, playbooks.id), eq(playbookSteps.stepName, MEDDPICC_STEP_NAME)),
    )
    .leftJoin(
      playbookStepCompletions,
      and(
        eq(playbookStepCompletions.assignmentId, dealPlaybookAssignments.id),
        eq(playbookStepCompletions.stepId, playbookSteps.id),
      ),
    )
    .where(and(eq(dealPlaybookAssignments.dealId, dealId), eq(playbooks.playbookName, MEDDPICC_PLAYBOOK_NAME)))
    .limit(1);

  // No assignment, or the rep already took an explicit action (completed/
  // skipped/blocked) — never override that, and never re-complete.
  if (!row || row.completionStatus != null) return;

  await db.insert(playbookStepCompletions).values({
    assignmentId: row.assignmentId,
    stepId: row.stepId,
    status: "completed",
    notes: `Auto-completed: MEDDPICC reached Green, ${overallPct}%`,
  });
  await recomputeAssignment(row.assignmentId);
  const dealIdForEvent = await dealIdForAssignment(row.assignmentId);
  if (dealIdForEvent) {
    emitDealEvent("playbook.step_changed", {
      dealId: dealIdForEvent,
      actor: "system",
      assignmentId: row.assignmentId,
      stepId: row.stepId,
      action: "completed",
    });
  }
}

export function registerMeddpicc(): () => void {
  return dealEvents.on(async (event) => {
    if (event.type !== "meddpicc.answer_changed") return;
    const result = await computeMeddpiccScoreForDeal(event.dealId);
    if (result && result.ragStatus === "Green") {
      await autoCompleteMeddpiccStepIfGreen(event.dealId, result.overallPct);
    }
  });
}
```

- [ ] **Step 4: Register the subscriber**

In `artifacts/api-server/src/lib/subscribers/index.ts`, add the import alongside the other subscriber imports:

```ts
import { registerMeddpicc } from "./meddpicc";
```

And add to the disposer list inside `registerSubscribers()`:

```ts
disposers.push(registerMeddpicc());
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @workspace/api-server exec vitest run src/lib/subscribers/meddpicc.test.ts`
Expected: PASS, both tests.

- [ ] **Step 6: Commit**

```bash
git add artifacts/api-server/src/lib/subscribers/meddpicc.ts artifacts/api-server/src/lib/subscribers/index.ts artifacts/api-server/src/lib/subscribers/meddpicc.test.ts
git commit -m "feat(api): recompute MEDDPICC score and auto-complete playbook step on Green"
```

---

### Task 11: Snapshot integration (trajectory data source)

**Files:**
- Modify: `artifacts/api-server/src/lib/subscribers/snapshot-service.ts`

**Interfaces:**
- Consumes: `getLatestMeddpiccScore` (Task 8).
- Produces: `deal_snapshots.payload.meddpicc: { overallPct: number; stagePct: number; ragStatus: string } | null`, consumed by Task 14's trajectory route.

- [ ] **Step 1: Import the reader**

In `artifacts/api-server/src/lib/subscribers/snapshot-service.ts`, add to the imports:

```ts
import { getLatestMeddpiccScore } from "../meddpicc";
```

- [ ] **Step 2: Fetch and include it in the payload**

In `captureSnapshot`, add the fetch alongside the existing `playbook` signals fetch:

```ts
  const playbook = await getPlaybookSignals(dealId);
  const meddpicc = await getLatestMeddpiccScore(dealId);
```

And add it to the `payload` object passed to `db.insert(dealSnapshots).values({...})`:

```ts
    payload: {
      deal,
      gates,
      governance,
      playbook: {
        adherencePct: playbook.adherencePct,
        progressPct: playbook.progressPct,
        criticalGaps: playbook.criticalGaps,
        overdueCount: playbook.overdueCount,
      },
      meddpicc: meddpicc
        ? { overallPct: meddpicc.overallPct, stagePct: meddpicc.stagePct, ragStatus: meddpicc.ragStatus }
        : null,
    },
```

Note: this reads the most recently *persisted* `deal_meddpicc_scores` row (kept fresh by the Task 10 subscriber on every `meddpicc.answer_changed` event) rather than recomputing — snapshots fire on almost every event, and recomputing+re-inserting a score row on each one would be redundant writes.

- [ ] **Step 3: Typecheck**

Run: `pnpm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add artifacts/api-server/src/lib/subscribers/snapshot-service.ts
git commit -m "feat(api): include MEDDPICC score in deal snapshots"
```

---

### Task 12: OpenAPI paths/schemas + codegen

**Files:**
- Modify: `lib/api-spec/openapi.yaml`

**Interfaces:**
- Produces (via codegen, Step 2 below): Zod schemas `GetMeddpiccAssessmentParams`, `UpsertMeddpiccAnswerParams`, `UpsertMeddpiccAnswerBody` from `@workspace/api-zod`; React Query hooks `useGetMeddpiccAssessment`, `useUpsertMeddpiccAnswer` from `@workspace/api-client-react` (naming mirrors the confirmed existing pattern: operationId `getDealScore` → `useGetDealScore`, `setPlaybookStepState` → `useSetPlaybookStepState`).

- [ ] **Step 1: Add the paths**, alongside the existing `/v2/deals/{dealId}/score` path:

```yaml
  /v2/deals/{dealId}/meddpicc:
    get:
      operationId: getMeddpiccAssessment
      tags: [v2intel]
      parameters:
        - { name: dealId, in: path, required: true, schema: { type: string } }
      responses:
        "200": { description: MEDDPICC assessment, content: { application/json: { schema: { $ref: "#/components/schemas/MeddpiccAssessmentResponse" } } } }
    patch:
      operationId: upsertMeddpiccAnswer
      tags: [v2intel]
      parameters:
        - { name: dealId, in: path, required: true, schema: { type: string } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/UpsertMeddpiccAnswerInput" }
      responses:
        "200": { description: Answer saved, content: { application/json: { schema: { $ref: "#/components/schemas/MeddpiccAssessmentResponse" } } } }
```

- [ ] **Step 2: Add the schemas**, alongside the existing `DealScore`/`DealScoreResponse` schemas:

```yaml
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
        isAutoSuggested: { type: boolean }
      required: [questionOrder, score, note, isAutoSuggested]
    MeddpiccSuggestion:
      type: object
      properties:
        questionOrder: { type: integer }
        suggestedScore: { type: integer }
        reason: { type: string }
      required: [questionOrder, suggestedScore, reason]
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
        suggestions: { type: array, items: { $ref: "#/components/schemas/MeddpiccSuggestion" } }
        score: { $ref: "#/components/schemas/MeddpiccScore" }
      required: [questions, answers, suggestions, score]
    MeddpiccAssessmentResponse:
      type: object
      properties:
        data: { $ref: "#/components/schemas/MeddpiccAssessment" }
      required: [data]
    UpsertMeddpiccAnswerInput:
      type: object
      properties:
        questionOrder: { type: integer }
        score: { type: integer }
        note: { type: ["string", "null"] }
      required: [questionOrder, score]
```

- [ ] **Step 3: Run codegen**

Run: `pnpm --filter @workspace/api-spec run codegen`
Expected: regenerates `lib/api-zod/src/generated/**` and `lib/api-client-react/src/generated/**`, then runs `typecheck:libs` with no errors. Confirm the new symbols exist:

Run: `grep -r "getMeddpiccAssessment\|upsertMeddpiccAnswer" lib/api-client-react/src/generated | head -5`
Expected: hook names `useGetMeddpiccAssessment` and `useUpsertMeddpiccAnswer` present.

- [ ] **Step 4: Commit**

```bash
git add lib/api-spec/openapi.yaml lib/api-zod/src/generated lib/api-client-react/src/generated
git commit -m "feat(api-spec): add MEDDPICC assessment endpoints"
```

---

### Task 13: API routes

**Files:**
- Create: `artifacts/api-server/src/routes/v2/meddpicc.ts`
- Modify: `artifacts/api-server/src/routes/v2/index.ts`

**Interfaces:**
- Consumes: `getMeddpiccAssessment`, `upsertMeddpiccAnswer` (Task 8); `GetMeddpiccAssessmentParams`, `UpsertMeddpiccAnswerParams`, `UpsertMeddpiccAnswerBody` (Task 12); `getActor` from `../../lib/auth`; `notFound` from `../../lib/http`; `emitDealEvent` from `../../lib/events`.
- Produces: `GET /v2/deals/:dealId/meddpicc`, `PATCH /v2/deals/:dealId/meddpicc` — mounted and reachable.

- [ ] **Step 1: Write the router**

Create `artifacts/api-server/src/routes/v2/meddpicc.ts`:

```ts
import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetMeddpiccAssessmentParams,
  UpsertMeddpiccAnswerParams,
  UpsertMeddpiccAnswerBody,
} from "@workspace/api-zod";
import { getActor } from "../../lib/auth";
import { notFound } from "../../lib/http";
import { emitDealEvent } from "../../lib/events";
import { getMeddpiccAssessment, upsertMeddpiccAnswer } from "../../lib/meddpicc";

const router: IRouter = Router();

router.get("/deals/:dealId/meddpicc", async (req: Request, res: Response) => {
  const { dealId } = GetMeddpiccAssessmentParams.parse(req.params);
  const assessment = await getMeddpiccAssessment(dealId);
  if (!assessment) throw notFound("Deal not found");
  res.json({ data: assessment });
});

router.patch("/deals/:dealId/meddpicc", async (req: Request, res: Response) => {
  const { dealId } = UpsertMeddpiccAnswerParams.parse(req.params);
  const body = UpsertMeddpiccAnswerBody.parse(req.body ?? {});
  const actor = getActor(req);

  await upsertMeddpiccAnswer(dealId, body.questionOrder, { score: body.score, note: body.note }, actor.displayName);
  emitDealEvent("meddpicc.answer_changed", {
    dealId,
    actor: actor.displayName,
    questionOrder: body.questionOrder,
    score: body.score,
  });

  const assessment = await getMeddpiccAssessment(dealId);
  if (!assessment) throw notFound("Deal not found");
  res.json({ data: assessment });
});

export default router;
```

- [ ] **Step 2: Mount the router**

In `artifacts/api-server/src/routes/v2/index.ts`, add the import alongside the other sub-router imports:

```ts
import meddpiccRouter from "./meddpicc";
```

And add it to the `router.use(...)` block:

```ts
router.use(meddpiccRouter);
```

- [ ] **Step 3: Typecheck and rebuild**

Run: `pnpm run typecheck`
Expected: no errors.

Run: `pnpm --filter @workspace/api-server run dev` (in one terminal, leave running)

- [ ] **Step 4: Manual smoke test against the running dev server**

Run (with a valid session cookie/token from a logged-in browser session, or via the app's existing auth flow — see `Deal-Commander/CLAUDE.md` for local auth setup), against any seeded deal id `$DEAL_ID`:

```bash
curl -s http://localhost:5000/api/v2/deals/$DEAL_ID/meddpicc -H "Cookie: $SESSION_COOKIE" | head -c 500
```

Expected: JSON with `data.questions` (43 entries), `data.answers`, `data.suggestions`, `data.score.overallPct` (0 for a fresh deal).

```bash
curl -s -X PATCH http://localhost:5000/api/v2/deals/$DEAL_ID/meddpicc \
  -H "Content-Type: application/json" -H "Cookie: $SESSION_COOKIE" \
  -d '{"questionOrder": 1, "score": 3}' | head -c 500
```

Expected: JSON with `data.answers` showing `questionOrder: 1, score: 3` and `data.score.overallScore >= 3`.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/v2/meddpicc.ts artifacts/api-server/src/routes/v2/index.ts
git commit -m "feat(api): add MEDDPICC assessment routes"
```

---

### Task 14: Trajectory backend — add `meddpiccPct`

**Files:**
- Modify: `artifacts/api-server/src/routes/v2/analytics.ts:1192-1300` (the `GET /analytics/deals/:dealId/trajectory` route)

**Interfaces:**
- Produces: each point in `GET /v2/analytics/deals/:dealId/trajectory` response gains a `meddpiccPct: number | null` field, carried forward like `playbookPct`.

- [ ] **Step 1: Add a `meddpiccPctOf` reader**

Immediately after the existing `playbookPctOf` function (around line 1229), add:

```ts
  // MEDDPICC overall % from the snapshot payload (added 2026-07-24); null on
  // snapshots taken before MEDDPICC scoring existed.
  const meddpiccPctOf = (payload: Record<string, unknown> | null): number | null => {
    const mp = (payload as { meddpicc?: { overallPct?: unknown } } | null)?.meddpicc;
    const pct = mp?.overallPct;
    return typeof pct === "number" ? pct : null;
  };
```

- [ ] **Step 2: Extend `SnapPoint` and its construction**

Change the `SnapPoint` interface (around line 1231) from:

```ts
  interface SnapPoint {
    at: string;
    health: string | null;
    stage: string | null;
    tcv: number | null;
    gatePct: number | null;
    playbookPct: number | null;
  }
```

to:

```ts
  interface SnapPoint {
    at: string;
    health: string | null;
    stage: string | null;
    tcv: number | null;
    gatePct: number | null;
    playbookPct: number | null;
    meddpiccPct: number | null;
  }
```

And in the `snapshots: SnapPoint[] = snapRows.map((r) => ({...}))` construction (around line 1239), add:

```ts
    meddpiccPct: meddpiccPctOf(r.payload),
```

- [ ] **Step 3: Extend the carry-forward loop**

Add `let curMeddpiccPct: number | null = null;` alongside the other `cur*` variables (around line 1277), then inside the `points = timestamps.map((at) => {...})` block, add:

```ts
      if (snap.meddpiccPct != null) curMeddpiccPct = snap.meddpiccPct;
```

(right after the existing `if (snap.playbookPct != null) curPlaybookPct = snap.playbookPct;` line), and add `meddpiccPct: curMeddpiccPct,` to the returned object alongside `playbookPct: curPlaybookPct,`.

- [ ] **Step 4: Typecheck**

Run: `pnpm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add artifacts/api-server/src/routes/v2/analytics.ts
git commit -m "feat(api): add meddpiccPct to the deal trajectory endpoint"
```

---

### Task 15: Trajectory frontend — add the MEDDPICC metric

**Files:**
- Modify: `artifacts/edc/src/components/cockpit/deal-trajectory.tsx`

**Interfaces:**
- Consumes: `meddpiccPct` field now present on each `GET /v2/analytics/deals/:dealId/trajectory` point (Task 14).
- Produces: a 5th selectable metric tab, "MEDDPICC %", in the existing single-series trajectory chart.

- [ ] **Step 1: Extend `TrajectoryPoint` and `Metric`**

Change (line 40-48):

```ts
interface TrajectoryPoint {
  at: string;
  score: number | null;
  gatePct: number | null;
  health: Health;
  stage: string | null;
  tcv: number | null;
  playbookPct: number | null;
}
```

to add `meddpiccPct: number | null;` after `playbookPct`.

Change (line 66):

```ts
type Metric = "score" | "gate" | "tcv" | "playbook";
```

to:

```ts
type Metric = "score" | "gate" | "tcv" | "playbook" | "meddpicc";
```

- [ ] **Step 2: Extend the metric descriptor maps**

Change `METRIC_COLOR` (line 90-95), `METRIC_LABEL` (97-102), and `chartConfig` (104-109) to add a `meddpicc` entry each:

```ts
const METRIC_COLOR: Record<Metric, string> = {
  score: "hsl(var(--chart-1))",
  gate: "hsl(var(--chart-1))",
  tcv: "hsl(var(--chart-2))",
  playbook: "hsl(var(--chart-4))",
  meddpicc: "hsl(var(--chart-5))",
};

const METRIC_LABEL: Record<Metric, string> = {
  score: "Score",
  gate: "Gate %",
  tcv: "TCV",
  playbook: "Playbook %",
  meddpicc: "MEDDPICC %",
};

const chartConfig: ChartConfig = {
  score: { label: "Score", color: "hsl(var(--chart-1))" },
  gate: { label: "Gate %", color: "hsl(var(--chart-1))" },
  tcv: { label: "TCV", color: "hsl(var(--chart-2))" },
  playbook: { label: "Playbook %", color: "hsl(var(--chart-4))" },
  meddpicc: { label: "MEDDPICC %", color: "hsl(var(--chart-5))" },
};
```

- [ ] **Step 3: Add a tooltip row**

In `TrajectoryTooltip` (around line 325-328), immediately after the existing "Playbook %" row, add:

```tsx
        <TooltipRow
          label="MEDDPICC %"
          value={row.meddpiccPct != null ? `${formatNum(row.meddpiccPct)}%` : "—"}
        />
```

- [ ] **Step 4: Extend both `dataKey` resolvers**

In `makeEndpointLayer` (around line 478-485) and in `HeroChart` (around line 533-540), change:

```ts
  const dataKey: keyof ChartRow =
    metric === "gate"
      ? "gatePct"
      : metric === "tcv"
        ? "tcv"
        : metric === "playbook"
          ? "playbookPct"
          : "score";
```

to:

```ts
  const dataKey: keyof ChartRow =
    metric === "gate"
      ? "gatePct"
      : metric === "tcv"
        ? "tcv"
        : metric === "playbook"
          ? "playbookPct"
          : metric === "meddpicc"
            ? "meddpiccPct"
            : "score";
```

(apply this change in both places).

- [ ] **Step 5: Include `meddpicc` in the percent-formatting branch**

In `HeroChart`'s `valueFmt` (around line 555), change:

```ts
      : metric === "gate" || metric === "playbook"
        ? `${formatNum(v)}%`
        : formatNum(v);
```

to:

```ts
      : metric === "gate" || metric === "playbook" || metric === "meddpicc"
        ? `${formatNum(v)}%`
        : formatNum(v);
```

- [ ] **Step 6: Add the tab**

In the metric tabs list (around line 725), change:

```tsx
              {(["score", "gate", "tcv", "playbook"] as const).map((m) => (
```

to:

```tsx
              {(["score", "gate", "tcv", "playbook", "meddpicc"] as const).map((m) => (
```

- [ ] **Step 7: Typecheck**

Run: `pnpm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add artifacts/edc/src/components/cockpit/deal-trajectory.tsx
git commit -m "feat(ui): add MEDDPICC % to the deal trajectory chart"
```

---

### Task 16: MEDDPICC panel UI

**Files:**
- Create: `artifacts/edc/src/components/cockpit/v2/meddpicc-panel.tsx`

**Interfaces:**
- Consumes: `useGetMeddpiccAssessment`, `useUpsertMeddpiccAnswer` from `@workspace/api-client-react` (Task 12); shadcn `Card, CardHeader, CardTitle, Badge, Button, Textarea, Skeleton, Collapsible, CollapsibleTrigger, CollapsibleContent` (already used by `playbook-panel.tsx`/`stakeholders-panel.tsx`); `useToast`; `cn` from `@/lib/utils`.
- Produces: `export function MeddpiccPanel({ dealId }: { dealId: string })`, consumed by Task 17.

- [ ] **Step 1: Write the panel**

Create `artifacts/edc/src/components/cockpit/v2/meddpicc-panel.tsx`:

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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

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
  isAutoSuggested: boolean;
}
interface Suggestion {
  questionOrder: number;
  suggestedScore: number;
  reason: string;
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
  suggestions: Suggestion[];
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

function QuestionRow({
  question,
  answer,
  suggestion,
  onScore,
}: {
  question: Question;
  answer: Answer | undefined;
  suggestion: Suggestion | undefined;
  onScore: (score: number, note: string | null) => void;
}) {
  const [noteDraft, setNoteDraft] = useState(answer?.note ?? "");

  return (
    <div className="flex flex-col gap-2 border-b border-border/50 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm">
          {question.questionText}
          {question.helpText && (
            <span className="ml-2 text-xs text-muted-foreground">{question.helpText}</span>
          )}
        </p>
        {suggestion && answer?.score == null && (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            Suggested: {suggestion.suggestedScore}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {[3, 2, 1, 0].map((n) => (
          <Button
            key={n}
            type="button"
            size="sm"
            variant={answer?.score === n ? "default" : "outline"}
            className="h-7 w-9 px-0"
            onClick={() => onScore(n, noteDraft || null)}
          >
            {n}
          </Button>
        ))}
        {answer?.isAutoSuggested && (
          <span className="text-xs text-muted-foreground">accepted suggestion</span>
        )}
      </div>
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

function PillarSection({
  pillar,
  breakdown,
  questions,
  answers,
  suggestions,
  onScore,
}: {
  pillar: string;
  breakdown: PillarBreakdown | undefined;
  questions: Question[];
  answers: Answer[];
  suggestions: Suggestion[];
  onScore: (questionOrder: number, score: number, note: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const answerByOrder = new Map(answers.map((a) => [a.questionOrder, a]));
  const suggestionByOrder = new Map(suggestions.map((s) => [s.questionOrder, s]));

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between py-2 text-left">
        <span className="text-sm font-medium">{PILLAR_LABEL[pillar] ?? pillar}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {breakdown?.raw ?? 0}/{breakdown?.max ?? 0} · {breakdown?.pct ?? 0}%
          </span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {questions.map((q) => (
          <QuestionRow
            key={q.questionOrder}
            question={q}
            answer={answerByOrder.get(q.questionOrder)}
            suggestion={suggestionByOrder.get(q.questionOrder)}
            onScore={(score, note) => onScore(q.questionOrder, score, note)}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

const PILLAR_ORDER = [
  "Metrics",
  "EconomicBuyer",
  "DecisionCriteria",
  "DecisionProcess",
  "PaperProcess",
  "IdentifyPain",
  "Champion",
  "Competition",
];

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

  const { questions, answers, suggestions, score } = assessment;
  const breakdownByPillar = new Map(score.pillarBreakdown.map((b) => [b.pillar, b]));
  const questionsByPillar = new Map<string, Question[]>();
  for (const q of questions) {
    const list = questionsByPillar.get(q.pillar) ?? [];
    list.push(q);
    questionsByPillar.set(q.pillar, list);
  }

  return (
    <Card className="p-4">
      <CardHeader className="flex-row items-center justify-between space-y-0 p-0 pb-3">
        <CardTitle className="text-base">MEDDPICC Qualification</CardTitle>
        <div className="flex items-center gap-2">
          <Badge className={RAG_BADGE[score.ragStatus]}>{score.overallPct}% overall</Badge>
          <Badge variant="outline">{score.stagePct}% at this stage</Badge>
        </div>
      </CardHeader>
      <div className="mb-3 flex gap-4 text-xs text-muted-foreground">
        <span>Strong No: {score.strongNoCount}</span>
        <span>Unknown: {score.unknownCount}</span>
      </div>
      {PILLAR_ORDER.map((pillar) => (
        <PillarSection
          key={pillar}
          pillar={pillar}
          breakdown={breakdownByPillar.get(pillar)}
          questions={questionsByPillar.get(pillar) ?? []}
          answers={answers}
          suggestions={suggestions}
          onScore={handleScore}
        />
      ))}
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm run typecheck`
Expected: no errors. (The panel isn't wired into any page yet — that's Task 17 — so this only proves the component itself compiles cleanly against the generated hooks from Task 12.)

- [ ] **Step 3: Commit**

```bash
git add artifacts/edc/src/components/cockpit/v2/meddpicc-panel.tsx
git commit -m "feat(ui): add the MEDDPICC qualification panel"
```

---

### Task 17: Register the MEDDPICC cockpit tab

**Files:**
- Modify: `artifacts/edc/src/components/cockpit/cockpit-tabs.ts`
- Modify: `artifacts/edc/src/pages/deal-cockpit.tsx`

**Interfaces:**
- Consumes: `MeddpiccPanel` from `@/components/cockpit/v2/meddpicc-panel` (Task 16).
- Produces: a `"meddpicc"` sub-tab under the existing `"validation"` group (alongside "Technical Gates" and "Playbook" — MEDDPICC is a qualification gate, the same family), wired to render `<MeddpiccPanel dealId={id} />`.

- [ ] **Step 1: Add the sub-tab**

In `artifacts/edc/src/components/cockpit/cockpit-tabs.ts`, in the `"validation"` group's `subs` array, add a new entry after `"playbook"`:

```ts
  { id: "validation", label: "Validation", icon: Activity, subs: [
      { id: "technical", label: "Technical Gates" },
      { id: "playbook", label: "Playbook" },
      { id: "meddpicc", label: "MEDDPICC" },
  ] },
```

- [ ] **Step 2: Run the existing structure test**

Run: `pnpm --filter @workspace/edc exec vitest run src/components/cockpit/cockpit-tabs.test.ts`
Expected: PASS (confirms the new entry didn't break the existing group/sub invariants that test checks — e.g. every group having at least one sub, no duplicate ids).

- [ ] **Step 3: Wire the panel in `deal-cockpit.tsx`**

Add the import near the other panel imports (around line 49-55):

```ts
import { MeddpiccPanel } from "@/components/cockpit/v2/meddpicc-panel";
```

In the `renderPanel(subId)` switch (around line 244-275), add a case alongside `"playbook"`:

```tsx
    case "meddpicc": return <MeddpiccPanel dealId={id} />;
```

- [ ] **Step 4: Typecheck**

Run: `pnpm run typecheck`
Expected: no errors.

- [ ] **Step 5: Run the dev servers and visually verify**

Run: `pnpm --filter @workspace/api-server run dev` (terminal 1)
Run: `pnpm --filter @workspace/edc run dev` (terminal 2)

Open a deal in the browser, click the Validation group, click the new "MEDDPICC" sub-tab. Expected: 8 collapsible pillar sections, each showing `raw/max · pct%`; expanding one shows its questions with 0/1/2/3 buttons and a notes box; clicking a score button immediately updates the header's overall %/RAG badge and stage % without a page reload.

- [ ] **Step 6: Commit**

```bash
git add artifacts/edc/src/components/cockpit/cockpit-tabs.ts artifacts/edc/src/pages/deal-cockpit.tsx
git commit -m "feat(ui): register the MEDDPICC cockpit tab"
```

---

### Task 18: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `pnpm run typecheck`
Expected: no errors across all packages.

- [ ] **Step 2: Full build**

Run: `pnpm run build`
Expected: succeeds.

- [ ] **Step 3: Engine test suite**

Run: `pnpm --filter @workspace/engine run test`
Expected: all tests pass, including the new `meddpicc.test.ts` (12 tests) and the pre-existing 65+ engine tests (unchanged pattern/factor counts — this feature does not touch `scoring.ts` or the risk engine).

- [ ] **Step 4: API server test suite**

Run: `pnpm --filter @workspace/api-server run test`
Expected: all tests pass, including `meddpicc-signals.test.ts`, `meddpicc.test.ts`, `subscribers/meddpicc.test.ts`, and the pre-existing `subscribers/playbook-engine.test.ts` (proving Task 1's extraction didn't regress the auto-assign behavior).

- [ ] **Step 5: Fresh seed run end-to-end**

Run: `pnpm --filter @workspace/api-server run seed`
Expected: completes without error; MEDDPICC questions and thresholds seed (or skip if already present) alongside every other seed step.

- [ ] **Step 6: Manual smoke test via the Deal-Commander:verify skill**

Invoke the `Deal-Commander:verify` skill (or follow its recipe manually) to launch the app end-to-end and confirm: the MEDDPICC tab renders, scoring an answer updates the RAG badge live, and — for a Discovery-stage deal with an assigned "Discovery / Qualification Playbook" — scoring all 43 questions to 3 auto-completes the "MEDDPICC qualification scored" playbook step (visible in the Playbook tab) without a page reload.

- [ ] **Step 7: Final commit (if any cleanup was needed)**

```bash
git status --short
```

If clean, no commit needed — the feature is fully committed task-by-task. If any stray changes exist (e.g. a typecheck fix), commit them:

```bash
git add -A
git commit -m "chore: final typecheck fixes for MEDDPICC auto-scoring"
```
