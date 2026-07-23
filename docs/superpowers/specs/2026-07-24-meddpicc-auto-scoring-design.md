# MEDDPICC Auto-Scoring Design

Date: 2026-07-24
Status: Approved direction, pending implementation plan.

## Problem

The Discovery/Qualification playbook already contains a step named **"MEDDPICC
qualification scored"** (`artifacts/api-server/src/seed.ts:469`, also in
`lib/db/sql/2026-07-playbook-catalog-expansion.sql`), described as: *"Complete
a MEDDPICC qualification (metrics, economic buyer, decision criteria/process,
paper process, pain, champion, competition) and record the score."* Today this
is a bare complete/skip/block checkbox with a free-text note — there is no
structured data model, no scoring formula, and no automation behind it
anywhere in the codebase (confirmed by full-repo search: schema, engine,
routes, PRDs, and memory files).

This is greenfield work: build a real MEDDPICC qualification score, ported
from the `dealpad_io_meddpicc_score_template.xlsx` reference template (43
questions across the 8 MEDDPICC pillars, 0–3 scored, RAG-banded), that is
automatically calculated and recalculated as the rep enters or changes
answers — and pre-fills the handful of questions the tool already has real
data for.

## Reference template (dealpad.io xlsx)

- 43 questions across 8 pillars: Metrics (5), Economic Buyer (5), Decision
  Criteria (5), Decision Process (5), Paper Process (3), Identify Pain &
  Value Drivers (10), Champion(s) (4), Competition (6).
- Each question scored 0–3 (3=Strong Yes, 2=Neutral, 1=Strong No, 0=Unknown/
  not completed). Unanswered cells count as 0 toward a **fixed** denominator
  — the max points don't shrink as questions go unanswered.
- Each question is tagged Q/P/N (Qualification/Proposition/Negotiation) —
  the stage at which it becomes realistically answerable.
- Per-pillar "Weighted Status" = pillar sum / pillar max.
- Overall score = sum of all 43 (max 129); overall % = score/129.
- Stage-filtered "Opp Stage pWin%": Qualification stage counts only
  Q-tagged questions (/81), Proposition counts Q-or-P (/108), Negotiation
  counts everything (/129).
- RAG: Red <40%, Amber 40–75%, Green >75%.

Full 43-question catalog (pillar, stage tag Q/P/N, text) — ported verbatim:

**Metrics**
1. Q — Does our solution make the project viable and will it deliver significant improvements?
2. Q — Do we fully understand what value the customer is seeking to get? Business outcomes, measurements or results known.
3. Q — Are there serious business/technical/financial implications if the project is not executed?
4. Q — Is there an on-going benefit to the customer's business?
5. Q — Is there a pertinent ROI story that can be translated into $ value?

**Economic Buyer**
6. P — Do we know who has the power to spend the budget?
7. P — Additional financial approvers identified?
8. P — Do we understand the economic buyer's mindset, expectations and priorities?
9. Q — Has budget been approved internally?
10. P — Do we understand the economic buyer's challenges and buying criteria?

**Decision Criteria**
11. Q — Do we understand the vendor evaluation/selection criteria and how it will be weighted?
12. Q — Do we understand the customer's decision criteria for each stage in their purchasing cycle?
13. Q — Do we understand who or what organization will influence each decision criteria?
14. Q — The customer is not buying on the lowest price.
15. P — The contract terms and conditions are acceptable to us and to the customer?

**Decision Process**
16. N — Have we met with the key decision makers (C-level) to discuss their needs and the strengths of our solution?
17. Q — Have we identified the individuals with decision-making powers and the roles each play in this specific opportunity?
18. Q — Do we fully understand the customer timeline and is it realistic?
19. Q — Do we understand what decision will be made at each stage of the process, when it will happen and who will be involved?
20. P — Do we have internal teams on-board to support the customer with any queries at each stage of the process?

**Paper Process**
21. P — Do we understand their signature process and identified all the signatories?
22. Q — Do we have an existing MSA that we can leverage? If not, have we submitted our MSA for review?
23. N — SOW or CO drafted and ready or with the customer for review?

**Identify Pain & Value Drivers**
24. Q — Are they an existing customer or new customer? (existing = higher score)
25. P — Do we fully understand the customer's requirements, the problem they are trying to address and the outcome they want to achieve?
26. N — Our proposal contains win themes, competitive advantages and addresses the concerns of discriminators and distractors.
27. Q — Is there a compelling event to close within the timeframe identified — will the project reduce cost, improve agility, or mitigate risk?
28. N — The technical, operational and commercial proposal satisfies requirements and fits the customer's business strategy.
29. Q — Does our standard solution solve the customer's problem?
30. Q — Can we fully deliver on all mandatory requirements?
31. Q — Are any non-compliant areas not show-stoppers?
32. Q — Can we deliver any non-standard requirements?
33. Q — Are partners needed, and if so, have they been identified and on-boarded?

**Champion(s)**
34. P — Have we identified champion(s)?
35. N — Do they fully understand the value we will deliver and are they most likely to benefit from our solution?
36. N — Are the champions prepared to become true defenders of the cause and sell our solution within their organization on our behalf?
37. N — Do the champions have the influencing power, good track record, and acceptance by peers/decision makers to swing the decision in our favor?

**Competition**
38. Q — Have we had early engagement to influence the client against the competition?
39. Q — Do we have a strong relationship with the customer and a distinct competitive advantage from the start?
40. Q — Is there a compelling event needing them to move away from their incumbent?
41. Q — If a competitor is favored by the customer, can we overcome this?
42. Q — Do we have reference customers with similar outcomes in the same sector?
43. Q — Will winning open up new market opportunities for us?

## Scope decisions (confirmed with user)

1. **Full 43-question fidelity** — ported verbatim, not trimmed to a
   pillar-level summary.
2. **Stage-gated sub-score ported** — EDC's 5 pipeline stages collapse into
   the xlsx's 3 buckets: Discovery → Qualification (/81, Q-tagged only),
   Validation & Commercial → Proposition (/108, Q-or-P), Procurement &
   Closed → Negotiation (/129, everything). This mapping lives in one small
   config object and can be adjusted later without touching the scoring
   math.
3. **Standalone for now** — does not feed `lib/engine/src/scoring.ts`
   (Predictive Score) or the Risk Engine. Gets its own tab, own score, own
   RAG badge. Can be wired into either system later once real data exists.
4. **Auto-suggest where derivable, manual otherwise** — 7 of 43 questions
   get a pre-filled suggested score from existing structured data (see
   below); the rep can accept or override. The remaining ~36 are genuinely
   qualitative judgment calls with no structured proxy anywhere in the tool
   and stay fully manual.
5. **RAG thresholds are tunable** via the existing Settings → Thresholds
   tab (`engine_thresholds`), default Red <40% / Green >75%, matching the
   xlsx.
6. **Playbook step auto-completes at Green**, one-way (never
   auto-reopens if the score later drops).
7. **Trajectory tracking** — MEDDPICC overall % becomes a new series in
   `deal_snapshots` / the Deal Trajectory chart.

## Data model

New tables in `lib/db/src/schema/edc_v2_intel.ts`:

```ts
export const meddpiccQuestions = edcV2.table("meddpicc_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionOrder: smallint("question_order").notNull().unique(), // 1-43
  pillar: varchar("pillar", { length: 30 }).notNull(),
  // "Metrics" | "EconomicBuyer" | "DecisionCriteria" | "DecisionProcess" |
  // "PaperProcess" | "IdentifyPain" | "Champion" | "Competition"
  stageTag: varchar("stage_tag", { length: 1 }).notNull(), // "Q" | "P" | "N"
  questionText: text("question_text").notNull(),
  helpText: text("help_text"), // ported from the xlsx's F-column guidance where present
});

export const dealMeddpiccAnswers = edcV2.table(
  "deal_meddpicc_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id").notNull().references(() => enterpriseDeals.id, { onDelete: "cascade" }),
    questionId: uuid("question_id").notNull().references(() => meddpiccQuestions.id),
    score: smallint("score"), // 0-3, nullable = unanswered
    isAutoSuggested: boolean("is_auto_suggested").notNull().default(false),
    suggestedScore: smallint("suggested_score"), // last computed suggestion, kept even after override
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
    dealId: uuid("deal_id").notNull().references(() => enterpriseDeals.id, { onDelete: "cascade" }),
    overallScore: integer("overall_score").notNull(), // 0-129
    overallPct: numeric("overall_pct", { precision: 5, scale: 2 }).notNull(),
    // Nullable as a defensive fallback only — every current pipeline stage
    // resolves to a bucket via the stage-bucket mapping below, so this is
    // null only if a future/custom stage is added without updating that map.
    stagePct: numeric("stage_pct", { precision: 5, scale: 2 }),
    ragStatus: varchar("rag_status", { length: 10 }).notNull(), // Red|Amber|Green
    pillarBreakdown: jsonb("pillar_breakdown").notNull().$type<PillarBreakdown[]>(),
    strongNoCount: smallint("strong_no_count").notNull(),
    unknownCount: smallint("unknown_count").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("deal_meddpicc_score_deal_time_idx").on(t.dealId, t.computedAt.desc())],
);
```

`meddpicc_questions` is seeded once (43 rows), following the same
presence-check guard as `seedPlaybooks()`. `deal_meddpicc_answers` is
upserted per question as the rep answers. `deal_meddpicc_scores` is a
snapshot log mirroring `deal_scores` exactly, giving trajectory history for
free.

## Scoring engine (pure, isomorphic)

New `lib/engine/src/meddpicc.ts`, same shape and no-DB-calls discipline as
`scoring.ts` / `dimensions.ts`:

```ts
export const QUESTION_CATALOG: MeddpiccQuestion[] = [ /* the 43 above */ ];

export function computeMeddpiccScore(
  answers: Record<string /* questionId */, number | null>,
  stageBucket: "Qualification" | "Proposition" | "Negotiation",
): MeddpiccScoreResult {
  // per-pillar {raw, max, pct}; overallScore/overallPct (sum/129);
  // stagePct (sum of stage-tag-filtered questions / their fixed max,
  // mirroring the xlsx SUMIF logic); ragStatus from the two thresholds;
  // strongNoCount / unknownCount.
}
```

Unanswered questions contribute 0 to `overallScore` but the denominator
stays fixed (129 / 81 / 108), matching the xlsx exactly — score starts at
0% and climbs as the rep answers.

## Auto-suggestion layer

New `artifacts/api-server/src/lib/meddpicc-signals.ts` (same shape as the
existing `playbook-signals.ts`), computing suggestions for the questions
with a genuine structured proxy in the current schema:

| Q# | Pillar | Signal source | Suggestion rule |
|---|---|---|---|
| 6 | Economic Buyer | `stakeholders` row with `roleType = 'Economic Buyer'` | 3 if present, else 0 |
| 9 | Economic Buyer | `dealTechnicalGates` executive-agreement gate completed (same extraction `scoring.ts` already uses) | 3 if completed, else 0 |
| 21 | Paper Process | Procurement/Legal playbook step covering signature/redlines marked completed | 3 if completed, else unset |
| 22 | Paper Process | Procurement/Legal playbook step covering MSA/NDA/DPA marked completed | 3 if completed, else unset |
| 24 | Identify Pain | Another `enterpriseDeals`/`dealMemory` row for the same `accountName` with a won outcome | 3 if an existing won relationship exists, else 2 (never 0/1 — matches the xlsx's own guidance that this question is 3-vs-2, not a real "no") |
| 34 | Champion | `stakeholders` row with `sentiment = 'Champion'` exists | 3 if ≥1, else 1 |
| 39 | Competition | Risk Engine's existing competitive-exposure dimension score, inverted/scaled to 0–3 | scaled |

Exact playbook-step names for the Paper Process mapping will be confirmed
against the live seed data during implementation (the Procurement/Legal
playbook's step set is already known; this is a lookup detail, not an open
design question). All other 36 questions (the full Metrics, Decision
Criteria, and Decision Process pillars, 9 of 10 Identify Pain questions, 3 of
4 Champion questions, and 5 of 6 Competition questions) have no structured
proxy anywhere in the tool today and stay fully manual — auto-deriving them
would mean guessing, not measuring.

Suggestions never silently overwrite a rep's own answer: `suggestedScore`
is stored and shown even after the rep sets their own `score`, so the panel
can render "Suggested: 3 · You set: 1".

## API & events

- `GET /v2/deals/:id/meddpicc` — catalog + current answers + suggestions +
  live-recomputed score (same recompute-on-GET pattern as
  `GET /v2/deals/:id/score`).
- `PATCH /v2/deals/:id/meddpicc/:questionId` — upsert one answer
  (`{score, note}`).
- New event `meddpicc.answer_changed`, added to `RESCORE_ON`-equivalent
  subscriber wiring: persists a `deal_meddpicc_scores` snapshot, invalidates
  the deal's react-query cache keys, and feeds `deal_snapshots` with a new
  `meddpiccPct` field for trajectory.
- `openapi.yaml` gets the new paths + schemas; run Orval codegen.

## Playbook integration

After each recompute, if `overallPct` crosses the Green threshold **and**
the deal has an open "MEDDPICC qualification scored" step in an active
Discovery/Qualification playbook assignment, auto-complete that step via
the existing step-state route (`POST .../steps/:stepId/state`) with a
system-authored note (e.g. "Auto-completed: MEDDPICC reached Green, 82%").
This reuses all existing overdue/adherence/event logic unchanged.

This is **one-way**: if a later answer edit drags the score back below
Green, the step is **not** auto-reopened — the rep can manually reopen or
block it if they want to flag the regression. Below Green, the step behaves
exactly as it does today (manual complete/skip/block).

## Settings

Two new `engine_thresholds` rows, surfaced in the existing Settings →
Thresholds tab:
- `meddpicc_red_max` (default `40`)
- `meddpicc_green_min` (default `75`)

## UI

New Cockpit tab, `components/cockpit/v2/meddpicc-panel.tsx`:
- Header: overall % + RAG badge, stage-relevant % + RAG badge,
  Strong-No/Unknown counts (direct translation of the xlsx's summary rows).
- 8 collapsible pillar sections (accordion), each showing its
  weighted-status %.
- Each question: text, help text where present, a 0/1/2/3 button group,
  optional note field, and a "Suggested: N" chip for the 7 auto-suggestible
  questions when a suggestion exists and hasn't been overridden.
- `deal-trajectory.tsx` gets a new MEDDPICC % line/tooltip field, sourced
  from the new `deal_snapshots.meddpiccPct`.

## Testing

- Engine unit tests for `computeMeddpiccScore` — fixed-fixture answers →
  expected pillar/overall/stage percentages and RAG banding, mirroring
  `scoring.test.ts` conventions (including an all-unanswered fixture
  scoring exactly 0%, and an all-Strong-Yes fixture scoring exactly 100%).
- Signal-extraction unit tests for `meddpicc-signals.ts` (each of the 7
  suggestion rules, including the "no data yet" case).
- API route tests for `GET`/`PATCH /v2/deals/:id/meddpicc`.
- Seed-idempotency test: the 43-question catalog seeds exactly once
  (matching the existing playbook-seed guard pattern).
- A playbook-integration test: score crossing Green auto-completes the
  step; a subsequent drop below Green does not reopen it.

## Out of scope (this iteration)

- Feeding MEDDPICC into the Predictive Score or Risk Engine.
- A MEDDPICC column on the deal roster / dashboard widgets.
- Any NLP/LLM-based inference for the 37 non-derivable questions.
