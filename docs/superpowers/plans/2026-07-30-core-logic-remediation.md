# Core-Logic Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Critical/High/selected-Medium defects found by the 2026-07-30 core-logic review of `@workspace/engine` and the server modules that assemble or duplicate its math. Every defect below was proven by executing the current code (not inferred from reading), and the engine's existing 175-test suite passes today even with all of them present — meaning none of these are caught by current coverage. Each task adds the regression test that would have caught its bug, fixes the bug, and keeps the full suite green.

**Non-goals (explicitly out of scope for this plan):** security/auth/RBAC, performance, UI/UX, styling, any Medium/Low finding not listed below (M2, M3, M5–M13, M15, M16, all LOW/FYI items) — these are real but lower-leverage and are deferred to a follow-up plan so this one stays reviewable. The frontend `PlaybookJourneyStatus`/`JourneyStatus` enum is deliberately NOT widened in this plan (see Task 11) — only the scoring-facing bug is fixed.

**Architecture:** `@workspace/engine` (`lib/engine/src`) is a pure, isomorphic library — no DB/network calls, consumed identically by the server (`artifacts/api-server`) and the browser Risk Simulator (`artifacts/edc`). Every fix to engine math must keep it pure and must not introduce `Date.now()`/`Math.random()` — all temporal/random inputs are already passed in as arguments. Server-side fixes live in `artifacts/api-server/src/{lib,routes}`.

**Tech Stack:** Node 24, TypeScript, Vitest. `pnpm --filter @workspace/engine run test` runs the engine's pure-function suite (no DB needed, fast). `pnpm --filter @workspace/api-server run test` needs `DATABASE_URL` set to the dev Postgres (already configured in this environment — engineer confirmed tests currently pass).

## Global Constraints

- Run `pnpm run typecheck` from the repo root before considering ANY task done — `@workspace/engine`'s types flow into both the server and `artifacts/edc`, so a type change ripples further than its own package.
- Run the affected package's test suite (`pnpm --filter @workspace/engine run test` and/or `pnpm --filter @workspace/api-server run test`) before considering ANY task done. Where a task's own brief names a narrower test file, run at least that file plus the full package suite.
- Never hand-edit `lib/api-zod/src/generated/**` or `lib/api-client-react/src/generated/**`. No task in this plan touches the OpenAPI contract (`lib/api-spec/openapi.yaml`) — every fix is internal engine/library logic or a route handler's internal computation, not its request/response shape. If an implementer believes a contract change is needed, STOP and escalate — that is out of scope for this plan.
- `artifacts/api-server` is bundled with esbuild; `pnpm --filter @workspace/api-server run dev` always rebuilds before starting.
- This codebase is near production. TDD is mandatory, not optional: write the failing test that reproduces the OLD (buggy) numeric output FIRST, confirm it fails against the current code, then fix, then confirm it passes. Do not weaken an assertion to make it pass — if a test can't be made to pass without weakening it, that's a NEEDS_CONTEXT/BLOCKED signal, not a license to soften the check.
- Every numeric example in a task's brief (thresholds, weights, expected scores) is exact and must be used verbatim in tests — do not substitute approximate values.
- `pipelineStages.stageName` literals are exactly `"Discovery"`, `"Validation"`, `"Commercial"`, `"Procurement"`, `"Closed-Won"`, `"Closed-Lost"` — copy existing strings, don't retype them.
- Tasks are ordered so each can be implemented and reviewed independently; later tasks may touch files earlier tasks also touched (expected — sequential commits on the same file, never parallel). Do not reorder tasks.

---

## Task 1: Four isolated sign/comparison fixes (independent files, no shared state)

**Files:**
- Modify: `lib/engine/src/contextual-patterns.ts` (`CompetitorProfile.historicalWinRate` field + `evaluateCompetitivePatterns`)
- Modify: `artifacts/api-server/src/lib/contextual-alerts.ts` (the one caller that builds `CompetitorProfile`)
- Modify: `lib/engine/src/dimensions.ts` (`scoreTemporalPressure`, Signal 4.2)
- Modify: `artifacts/api-server/src/lib/scoring.ts` (`buildScoringInput`, the `ctoSignedOff`/`executiveAgreed` derivation)
- Modify: `lib/engine/src/meddpicc.ts` (`ragFor`, `computeMeddpiccScore`)
- Test: `lib/engine/src/contextual-patterns.test.ts` (new file — none exists today), `lib/engine/src/dimensions.test.ts` (add cases), `lib/engine/src/meddpicc.test.ts` (add cases), `artifacts/api-server/src/lib/scoring.test.ts` (add cases)

**Context:** these four are unrelated defects that each happen to be a single-clause fix. They're bundled into one task because none needs design judgment — each fix and its exact test assertion are fully specified below.

### Fix 1a — `LOST_TO_PATTERN` fires on our WINS, not our losses (Critical C1)

`historicalWinRate` on `CompetitorProfile` (`contextual-patterns.ts`) is documented "our win rate against them" everywhere else in the codebase (`dimensions.ts` Signal 6.2: `minWinRate >= 0.6` → risk 10, the LOWEST risk bucket; `lib/competitive.ts`'s `reduceWinRates`: `wins = "Won Against"`). But `evaluateCompetitivePatterns`'s `LOST_TO_PATTERN` fires when `cp.historicalWinRate > 0.6` and its message reads `"${name} has won ${round(rate*100)}% of head-to-head encounters"` — treating a HIGH value (we usually win) as a threat.

Verified: with `competitorWinRates()` returning `winRate: 0.7` for a competitor we beat 7 of 10 times, this pattern currently fires `COMPETITIVE DISADVANTAGE: X has won 70% of head-to-head encounters` — false. A competitor we lose to 70% of the time (`winRate: 0.3`, i.e. OUR win rate is 30%) currently produces NO alert at all (the `> 0.6` check is never true for it).

- [ ] **Step 1: Write the failing test** in `lib/engine/src/contextual-patterns.test.ts` (new file):
  ```typescript
  import { describe, it, expect } from "vitest";
  import { evaluateCompetitivePatterns } from "./contextual-patterns";

  describe("evaluateCompetitivePatterns — LOST_TO_PATTERN polarity", () => {
    it("does NOT fire when we usually win against an active competitor (ourWinRate 0.7)", () => {
      const alerts = evaluateCompetitivePatterns({
        activeCompetitors: 1,
        technicalProgressPct: 80,
        competitorProfiles: [
          { competitorName: "Beatable Co", status: "Active", historicalWinRate: 0.7 },
        ],
      });
      expect(alerts.find((a) => a.code === "LOST_TO_PATTERN")).toBeUndefined();
    });

    it("DOES fire when we usually lose against an active competitor (ourWinRate 0.2)", () => {
      const alerts = evaluateCompetitivePatterns({
        activeCompetitors: 1,
        technicalProgressPct: 80,
        competitorProfiles: [
          { competitorName: "Tough Co", status: "Active", historicalWinRate: 0.2 },
        ],
      });
      const alert = alerts.find((a) => a.code === "LOST_TO_PATTERN");
      expect(alert).toBeDefined();
      expect(alert!.message).toContain("80%"); // 1 - 0.2 = 0.8 = their win rate against us
    });

    it("boundary: exactly 0.4 (our win rate) still fires; exactly 0.6 does not", () => {
      const at04 = evaluateCompetitivePatterns({
        activeCompetitors: 1, technicalProgressPct: 0,
        competitorProfiles: [{ competitorName: "X", status: "Active", historicalWinRate: 0.4 }],
      });
      expect(at04.find((a) => a.code === "LOST_TO_PATTERN")).toBeDefined();
      const at06 = evaluateCompetitivePatterns({
        activeCompetitors: 1, technicalProgressPct: 0,
        competitorProfiles: [{ competitorName: "X", status: "Active", historicalWinRate: 0.6 }],
      });
      expect(at06.find((a) => a.code === "LOST_TO_PATTERN")).toBeUndefined();
    });
  });
  ```
  Run `pnpm --filter @workspace/engine exec vitest run src/contextual-patterns.test.ts` — confirm the first and second cases currently FAIL (the pattern fires on 0.7 and doesn't fire on 0.2).

- [ ] **Step 2: Fix `contextual-patterns.ts`.** Rename the field `historicalWinRate` → `ourWinRate` on both `CompetitorProfile` and `CompetitiveContext` isn't required by the type (it's inline on `CompetitorProfile`) — rename it there for clarity, since "historicalWinRate" is ambiguous about whose rate it is. Update the threshold and message:
  ```typescript
  const threat = ctx.competitorProfiles.find(
    (cp) => cp.status === "Active" && cp.ourWinRate < 0.4,
  );
  if (threat) {
    const theirRate = Math.round((1 - threat.ourWinRate) * 100);
    alerts.push({
      code: "LOST_TO_PATTERN",
      severity: "YELLOW",
      weight: 50,
      message:
        `COMPETITIVE DISADVANTAGE: ${threat.competitorName} has won ` +
        `${theirRate}% of head-to-head encounters. Review competitive ` +
        `playbook and escalate differentiation strategy.`,
    });
  }
  ```
  Update the `CompetitorProfile` interface's field name to `ourWinRate` and its doc comment to say explicitly "our win rate against them, 0–1".

- [ ] **Step 3: Update the one caller.** `artifacts/api-server/src/lib/contextual-alerts.ts:65-69` builds `competitorProfiles: dealLinks.map((l) => ({ ..., historicalWinRate: winRate(l.competitorId) }))` — rename the field to `ourWinRate` to match.

- [ ] **Step 4: Run the test, confirm it passes.** Run `pnpm --filter @workspace/engine run test` (full suite) to confirm nothing else references the old field name (TypeScript will catch any missed rename as a compile error).

### Fix 1b — Close-date risk is maximal at 100% technical progress (Critical C2)

`dimensions.ts` `scoreTemporalPressure`, Signal 4.2 (`closeDateRisk`, weight 0.45): `const daysPerPoint = progressRemaining > 0 ? daysLeft / progressRemaining : 0;`. When `progressRemaining === 0` (100% complete — the best state), this collapses to `daysPerPoint = 0`, which the bucket ladder scores as `closeDateRisk = 95` (worst) — identical to "zero days available per remaining point." Verified: with `daysToClose: 60, benchmarkMedianDays: 30`, `progressPct: 50` scores `closeDateRisk: 50` but `progressPct: 100` scores `closeDateRisk: 95` — risk goes UP as the deal becomes fully validated.

- [ ] **Step 1: Write the failing test** in `lib/engine/src/dimensions.test.ts` (add to existing file):
  ```typescript
  it("closeDateRisk is monotonically non-increasing as progressPct rises, all else equal", () => {
    const scoreAt = (progressPct: number) =>
      scoreTemporalPressure({
        salesStage: "Procurement", daysInStage: 5, daysToClose: 60,
        expectedCloseDate: "2026-09-30", progressPct, benchmarkMedianDays: 30,
      }).signals.find((s) => s.factor.includes("days to close"))!.rawScore;
    const scores = [0, 25, 50, 75, 90, 99, 100].map(scoreAt);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
    // 100% complete must be in the lowest risk bucket (daysPerPoint effectively infinite).
    expect(scoreAt(100)).toBe(5);
  });
  ```
  Confirm it currently fails (scores[6] = 95 > scores[5]).

- [ ] **Step 2: Fix.** Change the guard to floor the denominator instead of substituting a literal 0:
  ```typescript
  const daysPerPoint = daysLeft / Math.max(1, progressRemaining);
  ```
  (Remove the `progressRemaining > 0 ? ... : 0` ternary entirely — `Math.max(1, progressRemaining)` handles `progressRemaining === 0` by treating it as "1 point remaining," which at any positive `daysLeft` lands in the `>= 3` bucket → risk 5. This mirrors the existing correct pattern in `lib/engine/src/scoring.ts`'s `close_pressure` factor: `Math.max(1, 100 - d.progressPct)`.)

- [ ] **Step 3: Run and confirm** `pnpm --filter @workspace/engine exec vitest run src/dimensions.test.ts` passes, then the full engine suite.

### Fix 1c — `executiveAgreed`/`ctoSignedOff` match the wrong gate codes (High H4)

`artifacts/api-server/src/lib/scoring.ts:96-97`:
```typescript
const ctoSignedOff = completed.some((g) => /CTO|SIGN/i.test(g.gateCode));
const executiveAgreed = completed.some((g) => /EXEC|AGREED|G1/i.test(g.gateCode));
```
`/G1/i` matches BOTH `G1_CRITERIA_LOCKED` and `G1_EXECUTIVE_AGREED` — completing criteria-locking alone (no executive involved) satisfies `executiveAgreed`, which feeds the `executive_alignment` scoring factor (weight 13) at `lib/engine/src/scoring.ts:111`: `d.ctoSignedOff ? 1.0 : d.executiveAgreed ? 0.7 : 0.15` — a `+0.55` raw-score jump (worth `+7.2` on the 0-100 predictive score) from locking criteria alone. The engine itself uses the exact codes everywhere else (`index.ts:496`: `!deal.gateMap["G1_EXECUTIVE_AGREED"]`; `meddpicc-signals.ts:34`).

- [ ] **Step 1: Write the failing test** in `artifacts/api-server/src/lib/scoring.test.ts` (add to existing describe block or a new one — reuse the existing `createDeal()` helper in that file, which needs a `gateCode` param; add one, defaulting to none, so this test can insert a specific completed gate via `dealTechnicalGates`):
  ```typescript
  it("G1_CRITERIA_LOCKED alone does not satisfy executiveAgreed", async () => {
    const dealId = await createDeal();
    await db.insert(dealTechnicalGates).values({
      dealId, gateCode: "G1_CRITERIA_LOCKED", isCompleted: true,
    });
    const input = await buildScoringInput(dealId);
    expect(input?.executiveAgreed).toBe(false);
  });

  it("G1_EXECUTIVE_AGREED satisfies executiveAgreed", async () => {
    const dealId = await createDeal();
    await db.insert(dealTechnicalGates).values([
      { dealId, gateCode: "G1_CRITERIA_LOCKED", isCompleted: true },
      { dealId, gateCode: "G1_EXECUTIVE_AGREED", isCompleted: true },
    ]);
    const input = await buildScoringInput(dealId);
    expect(input?.executiveAgreed).toBe(true);
  });
  ```
  Add `dealTechnicalGates` to the file's existing `@workspace/db` import and export `buildScoringInput` is already exported from `./scoring`. Confirm the first case currently fails (`executiveAgreed` is `true` today because `/G1/i` matches `G1_CRITERIA_LOCKED`).

- [ ] **Step 2: Fix.** Exact gate-code equality:
  ```typescript
  const ctoSignedOff = completed.some((g) => g.gateCode === "G5_CTO_SIGNED_OFF");
  const executiveAgreed = completed.some((g) => g.gateCode === "G1_EXECUTIVE_AGREED");
  ```

- [ ] **Step 3: Run and confirm** the two new tests pass, then `pnpm --filter @workspace/api-server run test` (or at minimum `pnpm --filter @workspace/api-server exec vitest run src/lib/scoring.test.ts`).

### Fix 1d — MEDDPICC RAG ignores `stagePct` and `greenMin` is exclusive (Medium M1)

`lib/engine/src/meddpicc.ts`: `ragFor(pct, thresholds)` is called with `overallPct` (`computeMeddpiccScore` line ~130: `ragStatus: ragFor(overallPct, thresholds)`), never with the stage-weighted `stagePct` the same function already computes — so a Discovery deal answering every Discovery-relevant question perfectly (`stagePct: 100`) still gets `overallPct: 63` (diluted by 3 stage-irrelevant questions counted as 0) and status `"Amber"`. Separately, `ragFor`'s `if (pct > thresholds.greenMin) return "Green"` is strictly `>`, making a value exactly AT `greenMin` (75 by default) `"Amber"` — inconsistent with `redMax`'s own `<` (exclusive on its side too, but the field name "greenMin" implies inclusive-at-minimum).

- [ ] **Step 1: Write the failing test** in `lib/engine/src/meddpicc.test.ts` (add to existing file):
  ```typescript
  it("uses stagePct (not overallPct) for RAG status", () => {
    // Every Qualification-tagged question (stageTag "Q": orders 1,3,4,6,8) perfect;
    // the rest unanswered.
    const answers = { 1: 3, 3: 3, 4: 3, 6: 3, 8: 3 };
    const result = computeMeddpiccScore(answers, "Qualification");
    expect(result.stagePct).toBe(100);
    expect(result.ragStatus).toBe("Green");
  });

  it("greenMin is inclusive: exactly at the boundary is Green", () => {
    // overallPct computed to land exactly on greenMin (75) using the DEFAULT bucket:
    // 18 of 24 points = 75%.
    const answers = { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3 }; // 18 points / 24 = 75%
    const result = computeMeddpiccScore(answers, "Negotiation"); // full-model bucket, stagePct === overallPct here
    expect(result.overallPct).toBe(75);
    expect(result.ragStatus).toBe("Green");
  });
  ```
  Confirm both currently fail (`"Amber"` in both cases today).

- [ ] **Step 2: Fix.** In `computeMeddpiccScore`, change `ragStatus: ragFor(overallPct, thresholds)` to `ragStatus: ragFor(stagePct, thresholds)` (compute `stagePct` before this line if it isn't already — it is, per the existing code order). In `ragFor`, change `if (pct > thresholds.greenMin) return "Green";` to `if (pct >= thresholds.greenMin) return "Green";`.

- [ ] **Step 3: Run and confirm** `pnpm --filter @workspace/engine exec vitest run src/meddpicc.test.ts` passes, then the full engine suite (this file's existing tests may assert on `overallPct`-driven RAG — check any existing test asserting a specific `ragStatus` still holds under the `stagePct`-driven rule; if an existing case's `stagePct` and `overallPct` coincidentally differ in a way that changes its expected RAG, that's this bug manifesting in the test itself — update the expectation to match `stagePct`, not `overallPct`).

**Task 1 completion:** all four sub-fixes done, all new/existing tests in the four touched test files pass, full engine suite green, `pnpm --filter @workspace/api-server run test` green, `pnpm run typecheck` clean.

---

## Task 2: Consolidate TCV to `calculateFlatTCV` everywhere (High H1)

**Files:**
- Modify: `artifacts/api-server/src/routes/v2/analytics.ts` (7 inline TCV computations)
- Modify: `artifacts/api-server/src/routes/intelligence.ts` (1 inline TCV computation — algebraically correct today, consolidate for DRY/drift-prevention, not because it's currently wrong)
- Modify: `artifacts/api-server/src/lib/scoring.ts` (`buildScoringInput`'s `calculatedTCV`)
- Test: `artifacts/api-server/src/routes/v2/analytics.test.ts` (new, or add to an existing analytics test file if one covers `/analytics/pipeline` — check first) plus one assertion added to `artifacts/api-server/src/lib/scoring.test.ts`

**Context:** `calculateFlatTCV` (`lib/engine/src/ramp.ts:36-44`, already exported from `@workspace/engine`) is `MULTI_YEAR ? productRevenue * contractTermYears + servicesRevenue : productRevenue + servicesRevenue`. Eight call sites across the server instead use `(Number(productRevenue)||0) + (Number(servicesRevenue)||0)` — dropping the `* contractTermYears` multiplier entirely for Multi-Year Committed deals. A $1,000,000/yr × 3yr + $200,000 services deal shows `calculatedTCV: 3,200,000` on the deal page but contributes only `1,200,000` to every one of these eight computations — a 62.5% understatement that also feeds `lib/scoring.ts`'s `deal_size_confidence` factor (compares against `avgWonTCV`, which IS computed correctly from `dealMemory.finalTcv`).

Each site below needs its `db.select({...})` widened to also select `contractTermYears: enterpriseDeals.contractTermYears` and the deal's pricing model name (join `pricingModels` where not already joined), then replace the inline sum with a call to `calculateFlatTCV`.

- [ ] **Step 1: Write failing tests first.** Create `artifacts/api-server/src/routes/v2/analytics.test.ts` (check first whether such a file already exists for this router — if `routes/v2/analytics.vital-signs.test.ts` or similar exists, add to the most relevant existing file instead of creating a new one) with a helper that creates ONE deal with `pricingModelId` pointing at the seeded "Multi-Year Committed" pricing model, `contractTermYears: 3`, `productRevenue: "1000000.00"`, `servicesRevenue: "200000.00"` — expected TCV `3,200,000`. Assert:
  ```typescript
  // GET /v1/analytics/pipeline — call the handler directly (see the
  // getHandler() pattern already used in routes/v2/config.test.ts for the
  // no-supertest-harness convention in this repo).
  const pipeline = await callPipeline();
  expect(pipeline.totalTcv).toBeGreaterThanOrEqual(3_200_000); // fails today at 1,200,000 + other seed deals
  ```
  Repeat the same assertion shape (deal's contribution equals `3_200_000`, not `1_200_000`) for whichever of the 7 analytics.ts routes is cheapest to invoke directly in a unit test without heavy fixture setup — at minimum cover `/analytics/pipeline` and `/analytics/vital-signs` (`totalTCV`). For the remaining 5 sites (simulation, product-gaps' `techBlockers.tcv`, memory-insights' `tcvOf`, competitive-loss's `tcv`, roster's `flow` `OpenDeal.tcv` in `loadOpenDeals`), a single shared unit test isn't practical per-route — instead add one assertion to `artifacts/api-server/src/lib/scoring.test.ts`:
  ```typescript
  it("buildScoringInput's calculatedTCV honors the Multi-Year Committed term multiplier", async () => {
    const dealId = await createMultiYearDeal({ productRevenue: 1_000_000, servicesRevenue: 200_000, termYears: 3 });
    const input = await buildScoringInput(dealId);
    expect(input?.calculatedTCV).toBe(3_200_000); // fails today at 1,200,000
  });
  ```
  (Add a `createMultiYearDeal` helper alongside the existing `createDeal()` in that file, parameterizing pricing model lookup by `modelName === "Multi-Year Committed"` instead of the first row.)

- [ ] **Step 2: Fix each site.** Import `calculateFlatTCV` from `@workspace/engine` in `analytics.ts`, `intelligence.ts`, and `lib/scoring.ts` (the latter already imports `computePredictiveScore` from the same package — add to that import). For each of the 7 `analytics.ts` sites (current line numbers, subject to drift — search for the literal `(Number(` + `productRevenue` pattern to find all of them, there are exactly 7): add `contractTermYears` and a `pricingModels` join/select (join on `enterpriseDeals.pricingModelId = pricingModels.id` where not already present in that query) to the row shape, then replace:
  ```typescript
  const tcv = (Number(r.productRevenue) || 0) + (Number(r.servicesRevenue) || 0);
  ```
  with
  ```typescript
  const tcv = calculateFlatTCV({
    productRevenue: Number(r.productRevenue) || 0,
    servicesRevenue: Number(r.servicesRevenue) || 0,
    contractTermYears: r.contractTermYears,
    pricingModel: r.pricingModel,
  });
  ```
  (adjust the local variable name to match each site's existing binding — some are `tcv`, one is inside a `.map()` callback, one is a named function `tcvOf`). For `routes/intelligence.ts`'s product-mix handler (already selects `contractTermYears` and `pricingModel` — just replace its inline ternary with the `calculateFlatTCV` call for consistency; this one is NOT currently producing a wrong number, so there is no new test needed for it, only the substitution). For `lib/scoring.ts`'s `buildScoringInput`: add `contractTermYears: enterpriseDeals.contractTermYears` to the existing `dealRows` select, then change `calculatedTCV: productRevenue + servicesRevenue,` to the `calculateFlatTCV` call using `deal.contractTermYears` and `deal.pricingModel`.

- [ ] **Step 3: Run and confirm.** `pnpm --filter @workspace/api-server run test`, `pnpm run typecheck`.

---

## Task 3: Unify `daysBetween`/`daysToClose` (Medium M14) — signed, one rounding rule

**Files:**
- Modify: `lib/engine/src/index.ts` (`processDealIntelligence`'s `daysToClose` computation)
- Modify: `lib/engine/src/dimensions.ts` (`scoreTemporalPressure`, Signal 4.2 — must handle negative `daysToClose` as maximal risk, not fall through to the "no date" branch)
- Modify: `artifacts/api-server/src/lib/scoring.ts` (`daysBetween` helper)
- Modify: `artifacts/api-server/src/routes/v2/analytics.ts` (`daysBetween` helper, used by velocity/roster/flow-health routes — do NOT touch `daysToClose` semantics elsewhere in this file, only the rounding rule)
- Test: `lib/engine/src/index.test.ts`, `lib/engine/src/dimensions.test.ts`

**Context:** three different roundings of "days between two dates" exist (`Math.floor` in the engine, `Math.round` in `lib/scoring.ts` and `analytics.ts`), so the same deal's `daysToClose` can differ by up to a day depending which module computed it, straddling `close_date_warning_days` differently. Separately, the engine (`index.ts:1136-1142`) clamps a past-due `daysToClose` to `0`, destroying overdue magnitude — a deal 90 days overdue looks identical to one closing today.

**Decision (documented here so the implementer doesn't have to re-derive it):** standardize on `Math.floor` (matches the engine, the "pure" source of truth) everywhere, and let `daysToClose` go negative when overdue (no clamp). This requires a companion fix in `dimensions.ts` (Signal 4.2), because that function's current logic only branches on `daysToClose !== null && daysToClose >= 0`; anything negative currently falls into the `else if (ACTIVE_STAGES_FOR_DATE(...))` branch, scoring a flat 35 — UNDER-stating risk for a deal that is actually overdue. A search for other consumers of `daysToClose` (`index.ts`'s `CLOSE_DATE_PRESSURE`/`SLOW_MOTION_COLLISION`/`NO_CLOSE_DATE` patterns, and `risk-v2.ts`'s `CLOSE_DATE_PRESSURE` action-text generator) was done as part of planning this task: all of them use `<=` comparisons against positive thresholds, which remain correct (more negative = more true = more risk) with no change needed. The `CLOSE_DATE_PRESSURE` action text (`risk-v2.ts` `perWeek` calc) produces a nonsensical number for an already-overdue deal — this is a pre-existing, separate, LOW-severity issue explicitly OUT OF SCOPE for this task; do not fix it here.

- [ ] **Step 1: Write the failing test** in `lib/engine/src/dimensions.test.ts`:
  ```typescript
  it("an overdue deal (negative daysToClose) scores maximal close-date risk, not the flat no-date bucket", () => {
    const overdue = scoreTemporalPressure({
      salesStage: "Commercial", daysInStage: 40, daysToClose: -10,
      expectedCloseDate: "2026-07-01", progressPct: 60, benchmarkMedianDays: 30,
    });
    const closeSignal = overdue.signals.find((s) => s.factor.includes("days to close"))!;
    expect(closeSignal.rawScore).toBe(100);
  });
  ```
  and in `lib/engine/src/index.test.ts` (find the existing `processDealIntelligence` fixture pattern and add):
  ```typescript
  it("daysToClose is negative (not clamped to 0) for a deal past its expected close date", () => {
    const yesterday = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    const output = processDealIntelligence(
      { ...baseDeal, expected_close_date: yesterday }, // reuse the file's existing base fixture
      [], [], baseThresholds,
    );
    expect(output.financials.daysToClose).toBeLessThan(0);
  });
  ```
  Confirm both fail today (index.test.ts case: `daysToClose` is `0`; dimensions.test.ts case: `rawScore` is `35`, not reachable via the `>= 0` branch at all since `-10` fails that guard).

- [ ] **Step 2: Fix `index.ts`.** Remove the clamp:
  ```typescript
  let daysToClose: number | null = null;
  if (deal.expected_close_date) {
    daysToClose = Math.floor(
      (new Date(deal.expected_close_date).getTime() - now.getTime()) / DAY,
    );
  }
  ```
  (delete the `if (daysToClose < 0) daysToClose = 0;` line).

- [ ] **Step 3: Fix `dimensions.ts` Signal 4.2.** Change the guard from `i.daysToClose !== null && i.daysToClose >= 0` to `i.daysToClose !== null`, and inside that branch, handle the negative case explicitly before the existing `daysPerPoint` ladder:
  ```typescript
  if (i.daysToClose !== null) {
    const daysLeft = i.daysToClose;
    if (daysLeft < 0 && i.progressPct < 100) {
      closeDateRisk = 100;
    } else {
      const progressRemaining = 100 - i.progressPct;
      const daysPerPoint = daysLeft / Math.max(1, progressRemaining); // Task 1b's fix — this file already has it by now
      if (daysPerPoint >= 3) closeDateRisk = 5;
      else if (daysPerPoint >= 2) closeDateRisk = 20;
      else if (daysPerPoint >= 1) closeDateRisk = 50;
      else if (daysPerPoint >= 0.5) closeDateRisk = 75;
      else closeDateRisk = 95;
      if (daysLeft <= 0 && i.progressPct < 100) closeDateRisk = 100; // now only reachable at exactly 0
    }
  } else if (ACTIVE_STAGES_FOR_DATE(i.salesStage)) {
    closeDateRisk = 35;
  }
  ```
  (Keep the existing `daysLeft <= 0 && progressPct < 100 → 100` line for the `daysLeft === 0` case — it's now redundant with the new `daysLeft < 0` branch for negatives but still needed for exactly-zero; simplify if the implementer prefers `daysLeft <= 0` as the single guard instead of splitting — either is acceptable as long as the test in Step 1 passes and the existing "0 days left, not complete → 100" case in the current test suite still passes.)

- [ ] **Step 4: Unify rounding in the server.** In `artifacts/api-server/src/lib/scoring.ts`, change `daysBetween`'s `Math.round` to `Math.floor`. In `artifacts/api-server/src/routes/v2/analytics.ts`, change its (differently-named but identical-shape) `daysBetween` helper's `Math.round` to `Math.floor` too. Neither of these two helpers currently computes a deal's close-date countdown (they compute stage age / activity age, which are always-non-negative by construction — no clamp exists to remove there); this step is purely the rounding-consistency half of the fix.

- [ ] **Step 5: Run and confirm.** Full engine suite, full api-server suite, `pnpm run typecheck`.

---

## Task 4: Populate `stageBenchmarkDays` and `winRateByProfile` (High H5)

**Files:**
- Modify: `artifacts/api-server/src/lib/scoring.ts` (`buildScoringInput`, `historicalContext`, `computeDealScore`, `scoreDeal`, `rescoreActiveDeals`)
- Test: `artifacts/api-server/src/lib/scoring.test.ts`

**Context:** `ScoringContext.stageBenchmarkDays` and `.winRateByProfile` (`lib/engine/src/scoring.ts:39,43`) are never populated by any server caller — a repo-wide search confirms the only place either is set is `v2.test.ts`. This pins two of nine scoring factors (`stage_velocity` weight 13, `historical_win_rate` weight 8 — 21 of 100 weight points) to their neutral/default values for every deal ever scored, caps the achievable predictive score at 82 for even a perfect deal, and makes `confidence: "HIGH"` (which requires all three of `daysToClose`, `avgWonTCV`, `stageBenchmarkDays` to be present) permanently unreachable.

**Decision on `winRateByProfile`'s key (documented here, not left to implementer judgment):** `ScoringInput.profileKey` is built as `` `${stageName}|${pricingModel}` `` (an ACTIVE deal's current stage). `dealMemory` (the closed-deal ledger `winRateByProfile` must be computed from) has no equivalent "matching active stage" concept — a closed deal doesn't have a "current stage." Keying by stage+pricingModel would require deriving, for every closed deal, which stages it passed through before closing (via `pipelineTransitions`), which is a bigger, separate task. Instead: key `winRateByProfile` by **pricing model alone** (`dealMemory.pricingModel`, which the schema already has, and which `/analytics/pricing-benchmarks` already groups by without a stage dimension) — and correspondingly change `profileKey` (used only as this lookup key, nowhere else) from `` `${stageName}|${pricingModel}` `` to just the pricing model string. Update the `ScoringInput.profileKey` doc comment's example (currently `"Commercial|Multi-Year"`) to `"Multi-Year Committed"`.

- [ ] **Step 1: Write the failing test** in `artifacts/api-server/src/lib/scoring.test.ts`:
  ```typescript
  it("historicalContext populates winRateByProfile keyed by pricing model", async () => {
    // Seed data already has dealMemory rows (used by other analytics tests) —
    // if a deterministic assertion needs specific rows, insert them here via
    // db.insert(dealMemory).values(...) with a known pricingModel + outcome mix,
    // then assert historicalContext().winRateByProfile[thatPricingModel] equals
    // the hand-computed wins/(wins+losses) ratio. Clean up inserted rows in afterAll.
    const ctx = await historicalContext();
    expect(ctx.winRateByProfile).toBeDefined();
  });

  it("buildScoringInput's profileKey matches a key winRateByProfile can resolve", async () => {
    const dealId = await createDeal();
    const input = await buildScoringInput(dealId);
    const ctx = await historicalContext();
    // profileKey must be exactly the pricing model name — no stage prefix.
    expect(input?.profileKey).not.toContain("|");
  });

  it("confidence reaches HIGH when daysToClose, avgWonTCV, and stageBenchmarkDays are all available", async () => {
    const dealId = await createDeal(); // Discovery stage per the existing helper
    // Give it an expected close date so daysToClose is non-null:
    await db.update(enterpriseDeals).set({ expectedCloseDate: "2026-12-31" }).where(eq(enterpriseDeals.id, dealId));
    const score = await computeDealScore(dealId);
    expect(score?.confidence).toBe("HIGH");
  });
  ```
  Confirm the third case currently fails (`confidence: "MEDIUM"`, capped because `stageBenchmarkDays` is always undefined).

- [ ] **Step 2: Fix `historicalContext()`.** Add a `winRateByProfile` computation grouping `dealMemory` by `pricingModel`, `outcome` in (`"Won"`, `"Lost"`):
  ```typescript
  export async function historicalContext(): Promise<ScoringContext> {
    const won = await db.select({ tcv: dealMemory.finalTcv }).from(dealMemory).where(eq(dealMemory.outcome, "Won"));
    const tcvs = won.map((w) => Number(w.tcv) || 0).filter((n) => n > 0);
    const avgWonTCV = tcvs.length ? tcvs.reduce((a, b) => a + b, 0) / tcvs.length : null;

    const decided = await db
      .select({ pricingModel: dealMemory.pricingModel, outcome: dealMemory.outcome })
      .from(dealMemory)
      .where(inArray(dealMemory.outcome, ["Won", "Lost"]));
    const tally = new Map<string, { won: number; total: number }>();
    for (const row of decided) {
      if (!row.pricingModel) continue;
      const t = tally.get(row.pricingModel) ?? { won: 0, total: 0 };
      t.total++;
      if (row.outcome === "Won") t.won++;
      tally.set(row.pricingModel, t);
    }
    const winRateByProfile: Record<string, number> = {};
    for (const [model, t] of tally) winRateByProfile[model] = t.won / t.total;

    return { avgWonTCV, winRateByProfile };
  }
  ```
  Add `inArray` to the file's `drizzle-orm` import (already imports `and`, `eq`, `isNull`, `desc`).

- [ ] **Step 3: Fix `buildScoringInput`'s `profileKey`.** Change:
  ```typescript
  profileKey: `${deal.stageName ?? deal.salesStageId}|${deal.pricingModel ?? deal.pricingModelId}`,
  ```
  to:
  ```typescript
  profileKey: deal.pricingModel ?? String(deal.pricingModelId),
  ```

- [ ] **Step 4: Populate `stageBenchmarkDays` per-deal.** `buildScoringInput` already resolves `deal.stageName` inside its existing `dealRows` query. Add one more query (mirroring `intelligence.ts:558-567`'s existing pattern for the same lookup) right after that, and widen `buildScoringInput`'s return type to attach it:
  ```typescript
  export interface ScoringInputWithBenchmark {
    input: ScoringInput;
    stageBenchmarkDays: number | null;
  }
  ```
  Actually — to minimize blast radius, do NOT change `buildScoringInput`'s return type (it's used as `ScoringInput | null` by `computeDealScore`/`scoreDeal` and nothing else per a repo-wide search performed during planning). Instead add a SEPARATE small exported helper in the same file:
  ```typescript
  async function stageBenchmarkDaysFor(stageName: string | null): Promise<number | null> {
    if (!stageName) return null;
    const rows = await db
      .select({ medianDays: velocityBenchmarks.medianDays })
      .from(velocityBenchmarks)
      .where(eq(velocityBenchmarks.stageName, stageName))
      .limit(1);
    return rows[0]?.medianDays != null ? Number(rows[0].medianDays) : null;
  }
  ```
  Add `velocityBenchmarks` to this file's `@workspace/db` import. `buildScoringInput` doesn't currently expose `stageName` to its caller either — the cleanest place to call `stageBenchmarkDaysFor` is inside `computeDealScore`, which needs the deal's stage name. Add ONE extra tiny query there (or thread `stageName` back some other way): simplest is to have `computeDealScore` call `stageBenchmarkDaysFor` using a stage-name lookup query of its own (same one-line query shape as above, by `dealId` via a join — reuse the exact join pattern already in `buildScoringInput`'s own `dealRows` select for consistency), then merge into `ctx`:
  ```typescript
  export async function computeDealScore(
    dealId: string,
    ctx?: ScoringContext,
    weights?: Record<string, number>,
  ): Promise<PersistedScore | null> {
    const input = await buildScoringInput(dealId);
    if (!input) return null;
    const baseCtx = ctx ?? (await historicalContext());
    const [stageRow] = await db
      .select({ stageName: pipelineStages.stageName })
      .from(enterpriseDeals)
      .leftJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
      .where(eq(enterpriseDeals.id, dealId))
      .limit(1);
    const stageBenchmarkDays = await stageBenchmarkDaysFor(stageRow?.stageName ?? null);
    const context: ScoringContext = { ...baseCtx, stageBenchmarkDays };
    const w = weights ?? (await getScoringWeights());
    const score = computePredictiveScore(input, context, w);
    return { score: score.score, confidence: score.confidence, breakdown: score.breakdown };
  }
  ```
  Note: when `ctx` IS passed in by a batch caller (`rescoreActiveDeals`, which builds one shared `historicalContext()` result and reuses it across every deal), the per-deal `stageBenchmarkDays` override above still applies correctly per-deal since it's computed fresh inside `computeDealScore` regardless of what `ctx` carried — `{ ...baseCtx, stageBenchmarkDays }` always uses THIS call's own per-deal value, never a stale one from the shared `ctx`. This is intentional and correct: only `avgWonTCV`/`winRateByProfile` are meant to be shared across the batch; `stageBenchmarkDays` is inherently per-deal (per current stage) and must never come from a cached/shared `ctx`.

- [ ] **Step 5: Run and confirm.** `pnpm --filter @workspace/api-server exec vitest run src/lib/scoring.test.ts`, full api-server suite, `pnpm run typecheck`.

---

## Task 5: Split `assessable` semantics; fix amplification and `topDrivers` (Critical C4)

**Files:**
- Modify: `lib/engine/src/risk-v2-types.ts` (if `DimensionFnResult`/`DimensionScore` types live there — confirm by reading the file; if `assessable` is declared there, this is where the type doc comment changes)
- Modify: `lib/engine/src/dimensions.ts` (`scoreStakeholderCoverage`, the ONLY function using `assessable: false` to mean "this IS a measurement" rather than "we have no data")
- Modify: `lib/engine/src/risk-v2.ts` (`applyAmplification`, `computeComposite`, `topDrivers`)
- Test: `lib/engine/src/dimensions.test.ts`, `lib/engine/src/risk-v2.test.ts`

**Context (verified by execution):** `assessable: false` is used for two incompatible meanings today. `scoreCompetitiveExposure` uses it correctly as "no opinion, contributes nothing" (score 5, a low neutral default). `scoreStakeholderCoverage` uses it for "no stakeholders tracked past Discovery" with `score: 60` — a real measurement of a real gap — but because `computeComposite` (`risk-v2.ts:210-213`) excludes `!assessable` dimensions from BOTH the numerator and denominator of the weighted mean, that 60-risk measurement contributes NOTHING to the composite. Proven: an otherwise-identical deal scores composite 50/MODERATE with a hostile decision-maker tracked (`assessable: true, score: 90`), and composite 20/LOW — GREEN health — the moment all stakeholders are deleted (`assessable: false, score: 60`). **Deleting risk-relevant data lowers the composite risk score.** Separately, `applyAmplification` (`risk-v2.ts:221-255`) computes and stamps pattern-driven amplification onto a dimension's `.amplification` field regardless of whether that dimension will end up `assessable`, so a firing pattern like `PHANTOM_CHAMPION` (which only targets Stakeholder Coverage + Engagement Vitality) can show `amplification: 20` on a dimension that then contributes zero to the composite — while `topDrivers` (which reads `.amplification` directly, not filtered by `assessable`) ranks that dimension as a top driver of a risk score it never actually influenced.

**Fix design:**
1. Change `scoreStakeholderCoverage`'s "no stakeholders past Discovery" branch from `assessable: false` to `assessable: true` — it IS a measurement (score 60 stands as computed). Leave the "no stakeholders, Discovery stage" branch (`score: 10`) as `assessable: true` too, for the same reason (it's a real, if low, assessment — "acceptable in Discovery" is itself a judgment, not an absence of one). ONLY `scoreCompetitiveExposure`'s "no competitors tracked" branch keeps `assessable: false`, since there genuinely is no signal to measure (competitors are optional relationship data with no implicit default state the way "no stakeholders past Discovery" has).
2. In `applyAmplification`, do not amplify a dimension whose base `assessable` is `false` — carry the base `assessable` flag through unchanged (already done: `return { ...dim, ... }` spreads it), but explicitly ZERO the amplification for non-assessable dimensions instead of computing and discarding it silently:
   ```typescript
   return baseDims.map((dim) => {
     const amplification = dim.assessable ? (accumulator[dim.name] || 0) : 0;
     const score = Math.min(dim.score + amplification, DIMENSION_SCORE_CAP);
     return {
       ...dim,
       baseScore: dim.score,
       amplification,
       score,
       weight: 0,
       contributingPatterns: dim.assessable && contributors[dim.name] ? [...contributors[dim.name]!] : [],
     };
   });
   ```
3. In `topDrivers`, filter to `assessable` dimensions only (a non-assessable dimension contributed nothing to the composite and must not appear as a "top driver" of it):
   ```typescript
   export function topDrivers(
     adjustedDims: DimensionScore[],
     weights: RiskV2Weights = HARDCODED_WEIGHTS,
   ): RiskDriver[] {
     const drivers: RiskDriver[] = adjustedDims
       .filter((dim) => dim.assessable)
       .flatMap((dim) => { /* unchanged body */ });
     return drivers.sort((a, b) => b.impact - a.impact).slice(0, 5);
   }
   ```

- [ ] **Step 1: Write the failing tests.**
  In `lib/engine/src/dimensions.test.ts`:
  ```typescript
  it("no stakeholders tracked past Discovery is assessable (a real measurement, not an absence of one)", () => {
    const result = scoreStakeholderCoverage({ salesStage: "Validation", stakeholders: [] });
    expect(result.assessable).toBe(true);
    expect(result.score).toBe(60);
  });
  ```
  In `lib/engine/src/risk-v2.test.ts`:
  ```typescript
  it("deleting all stakeholders does not LOWER the composite relative to a tracked hostile decision-maker", () => {
    const baseDims = [
      { name: "Technical Readiness" as const, score: 20, signals: [{ factor: "t", rawScore: 20, weight: 1 }], assessable: true },
    ];
    const tracked = computeUnifiedRisk({
      dimensionResults: [...baseDims, { name: "Stakeholder Coverage" as const, score: 90, signals: [{ factor: "hostile DM", rawScore: 90, weight: 1 }], assessable: true }],
      activePatternCodes: [], guardrailCodes: [], dealView: { tcv: 1, daysToClose: null, progressPct: 20 },
    });
    const deleted = computeUnifiedRisk({
      // After the fix, scoreStakeholderCoverage never returns assessable:false for this
      // branch — this fixture simulates the OLD shape to prove the synthesis layer no
      // longer collapses a false-assessable dimension's score to zero contribution.
      dimensionResults: [...baseDims, { name: "Stakeholder Coverage" as const, score: 60, signals: [{ factor: "none tracked", rawScore: 60, weight: 1 }], assessable: false }],
      activePatternCodes: [], guardrailCodes: [], dealView: { tcv: 1, daysToClose: null, progressPct: 20 },
    });
    expect(deleted.compositeScore).toBeLessThanOrEqual(tracked.compositeScore);
    // The core invariant: an assessable:false dimension must contribute its score
    // to nothing — composite is driven ONLY by Technical Readiness (20) here.
    expect(deleted.compositeScore).toBe(20);
  });

  it("amplification on a non-assessable dimension is zeroed, and it never appears in topDrivers", () => {
    const dims = [
      { name: "Technical Readiness" as const, score: 40, signals: [{ factor: "t", rawScore: 40, weight: 1 }], assessable: true },
      { name: "Competitive Exposure" as const, score: 5, signals: [{ factor: "none tracked", rawScore: 5, weight: 1 }], assessable: false },
    ];
    const result = computeUnifiedRisk({
      dimensionResults: dims,
      activePatternCodes: ["COMPETITIVE_DISPLACEMENT_STALL"], // amplifies Competitive Exposure +25, Temporal Pressure +15 — Temporal Pressure isn't in `dims` here, only Competitive Exposure matters for this assertion
      guardrailCodes: [],
      dealView: { tcv: 1, daysToClose: 10, progressPct: 40 },
    });
    const competitive = result.dimensions.find((d) => d.name === "Competitive Exposure")!;
    expect(competitive.amplification).toBe(0);
    expect(result.topDrivers.some((d) => d.dimension === "Competitive Exposure")).toBe(false);
  });
  ```
  Confirm all three currently fail (first: `assessable` is `false` today; second: `deleted.compositeScore` is `20` already by coincidence of THIS fixture's numbers matching the bug's own math — construct the fixture with the SAME numbers as the PROBE2b run during review if this exact one doesn't reproduce the failure: base Technical Readiness 20, tracked Stakeholder 90/assessable, untracked Stakeholder 60/non-assessable, both other-things-equal; the review's executed probe measured `tracked: 50 MODERATE` vs `deleted: 20 LOW` — reproduce those exact two numbers and assert `tracked.compositeScore` is `50` and `deleted.compositeScore` is `20` BEFORE the fix, i.e. write the test to assert the CORRECT post-fix relationship `deleted.compositeScore === tracked... ` — since post-fix, a non-assessable dimension no longer exists in this scenario at all (Step 2 makes `scoreStakeholderCoverage` never return `assessable:false` past Discovery), the meaningful regression test is really "the assessable:false EXCLUSION mechanism itself, generically, contributes zero" as written above, using a synthetic `dimensionResults` fixture rather than depending on `scoreStakeholderCoverage`'s specific old behavior); third: `competitive.amplification` is `25` today, and `topDrivers` includes it.

- [ ] **Step 2: Apply the three fixes** described above (dimensions.ts branch, risk-v2.ts `applyAmplification`, risk-v2.ts `topDrivers`).

- [ ] **Step 3: Run and confirm.** Full engine suite — pay particular attention to any EXISTING test in `dimensions.test.ts`/`risk-v2.test.ts`/`v2.test.ts`/`index.test.ts` that asserted a specific composite score or health status for a deal with untracked stakeholders past Discovery; those numbers will legitimately change (the fix makes the composite HIGHER/more accurate for such deals, since the risk now actually counts) — update expected values in those tests to the new, correct numbers rather than reverting the fix. Run `pnpm run typecheck`.

---

## Task 6: Fix loss-risk lethality normalization (Critical C3)

**Files:**
- Modify: `lib/engine/src/loss-risk.ts` (`scoreLossRisk`)
- Test: `lib/engine/src/loss-risk.test.ts`

**Context (verified by execution):** `scoreLossRisk`'s `score = Math.round((matchedSum / maxPossibleSum) * 100)` where `maxPossibleSum = lethality.reduce((s, l) => s + l.lethality, 0)` — the sum of EVERY distinct pattern's lethality ever observed across the lost cohort. As the cohort accumulates more DISTINCT patterns (not more severity), this denominator grows and every deal's score shrinks: measured, an active deal firing only `GHOST_PIPELINE` scored 100 against a 1-lost-deal cohort and 33 against a 3-lost-deal cohort where the other two losses fired unrelated patterns. The denominator is also structurally unreachable in practice — many patterns are mutually exclusive by stage (`PREMATURE_COMMERCIAL` needs Commercial/Procurement; `POC_DEATH_MARCH` needs Validation), so `maxPossibleSum` overstates what any single deal could ever match, permanently compressing every score toward 0 as the pattern catalog (currently 16 codes) grows.

**Fix:** replace the sum-normalized score with a **max-matched-lethality** score: report how lethal the SINGLE most dangerous pattern this deal shares with the lost cohort is, scaled to 0–100. This is stable under cohort growth (adding an unrelated lost deal's new pattern never changes an existing deal's max-matched value) and is exactly the number a human reads as "this deal carries the pattern that killed 80% of past losses."

```typescript
export function scoreLossRisk(
  activeAlertCodes: string[],
  lethality: PatternLethality[],
): LossRiskResult {
  const byCode = new Map(lethality.map((l) => [l.code, l.lethality]));

  const matchedPatterns: LossRiskMatch[] = [];
  for (const code of activeAlertCodes) {
    const matchedLethality = byCode.get(code);
    if (matchedLethality !== undefined) {
      matchedPatterns.push({ code, lethality: matchedLethality });
    }
  }

  if (matchedPatterns.length === 0) {
    return { score: 0, matchedPatterns: [] };
  }

  matchedPatterns.sort((a, b) => b.lethality - a.lethality);
  const maxMatchedLethality = matchedPatterns[0].lethality;
  const score = Math.min(100, Math.round(maxMatchedLethality * 100));

  return { score, matchedPatterns };
}
```
(`PatternLethality.lethality` is already a `[0, 1]` share by construction in `computePatternLethality` — `lostCount / total` — so no re-derivation of that function is needed, only `scoreLossRisk`'s aggregation.)

- [ ] **Step 1: Write the failing test** in `lib/engine/src/loss-risk.test.ts`:
  ```typescript
  it("score is stable (monotonically non-decreasing) as the lost cohort grows with UNRELATED patterns", () => {
    const active = ["GHOST_PIPELINE"];
    const cohortA = computePatternLethality([["GHOST_PIPELINE"]]);
    const cohortB = computePatternLethality([["GHOST_PIPELINE"], ["NO_CLOSE_DATE"], ["STALLED_VALIDATION"]]);
    const a = scoreLossRisk(active, cohortA);
    const b = scoreLossRisk(active, cohortB);
    expect(b.score).toBe(a.score); // GHOST_PIPELINE's own lethality (100% of its 1-deal cohort in both cases) is unchanged
    expect(a.score).toBe(100);
  });

  it("score reflects the single most-lethal MATCHED pattern, not a sum diluted by the full catalog", () => {
    // Cohort of 10 lost deals: GHOST_PIPELINE fired on 8 of them (80% lethality),
    // NO_CLOSE_DATE fired on 2 (20%). Active deal fires both.
    const lostCodes = [
      ...Array(8).fill(["GHOST_PIPELINE"]),
      ...Array(2).fill(["NO_CLOSE_DATE"]),
    ];
    const lethality = computePatternLethality(lostCodes);
    const result = scoreLossRisk(["GHOST_PIPELINE", "NO_CLOSE_DATE"], lethality);
    expect(result.score).toBe(80);
  });
  ```
  Confirm both fail today (first: `b.score` is `33`, not `100`; second: the sum-normalized formula gives a different, cohort-catalog-size-dependent number).

- [ ] **Step 2: Apply the fix** above.

- [ ] **Step 3: Run and confirm.** Full engine suite (check `analytics.ts`'s two consumers of `scoreLossRisk` — `/analytics/loss-risk` and the `matchedPatterns > 0` filter — still make sense with the new score scale; no server-side change is needed since both just pass `score`/`matchedPatterns` through unchanged, but re-read `routes/v2/analytics.ts:1054-1090` to confirm nothing there assumed the old sum-normalized scale specifically). `pnpm run typecheck`.

---

## Task 7: Stage-scope the 10 unguarded time-based patterns; evaluate lost-deal lethality at close time (High H6)

**Files:**
- Modify: `lib/engine/src/index.ts` (10 pattern `evaluate` functions)
- Test: `lib/engine/src/index.test.ts`

**Context:** `analytics.ts`'s `/analytics/loss-risk` and `/analytics/loss-dashboard` routes run the LIVE engine (`cachedIntel`, which calls `processDealIntelligence` with `now = Date.now()`) against Closed-Lost deals to derive "which patterns fired on past losses" — but 10 of the 16 patterns have no closed-stage guard, so `daysInStage`/`daysSinceLastUpdate`/`daysToClose` (all measured against TODAY, not against when the deal actually closed) make time-based patterns fire on every sufficiently-old closed deal regardless of what was actually true when it closed. `NO_CLOSE_DATE` already guards correctly (`salesStage !== "Closed-Won" && salesStage !== "Closed-Lost"`) — extend the same guard to the 10 patterns that lack it: `MISSING_STRUCTURAL_ANCHOR`, `PHANTOM_CHAMPION`, `GHOST_PIPELINE`, `STALLED_VALIDATION`, `CLOSE_DATE_PRESSURE`, `SLOW_MOTION_COLLISION`, `UNPROTECTED_ELEPHANT`, `LOW_ATTACH_ELEPHANT`, `SIEM_UNDERSCOPED`, `PLAYBOOK_EXECUTION_GAP`.

**Scope decision:** this task ONLY adds the closed-stage guard to these 10 patterns' `evaluate` functions (a small, uniform, low-risk change: `deal.salesStage !== "Closed-Won" && deal.salesStage !== "Closed-Lost" && (...)`). It does NOT attempt to reconstruct historical pattern state from `deal_snapshots` at actual close time — that is a separate, larger data-plumbing task (snapshot payload doesn't currently carry every field every pattern needs) and is explicitly deferred. Adding the guard alone fixes the dominant failure mode (patterns "still" firing on old closed rows because `now` keeps advancing) even without historical reconstruction, since a closed deal will simply stop tripping these patterns at all once this guard lands — which is the correct, conservative behavior (a closed deal's risk state is moot; it already closed).

- [ ] **Step 1: Write the failing test** in `lib/engine/src/index.test.ts` — for at least 3 of the 10 (pick `MISSING_STRUCTURAL_ANCHOR` since it's RED/highest severity, `GHOST_PIPELINE`, and `CLOSE_DATE_PRESSURE`), construct a Closed-Lost deal fixture whose raw field values would trip the pattern if it were still open (e.g., for `GHOST_PIPELINE`: no blockers, no blueprint notes, `updated_at` far in the past) and assert the pattern is NOT in `output.governance.alerts.map(a => a.code)` when `sales_stage === "Closed-Lost"`:
  ```typescript
  it("GHOST_PIPELINE does not fire on a Closed-Lost deal even with stale updated_at", () => {
    const output = processDealIntelligence(
      { ...baseDeal, sales_stage: "Closed-Lost", updated_at: "2020-01-01", manager_strategic_blueprint: null },
      [], [], baseThresholds,
    );
    expect(output.governance.alerts.map((a) => a.code)).not.toContain("GHOST_PIPELINE");
  });
  ```
  (Repeat the shape for `MISSING_STRUCTURAL_ANCHOR` — needs `sales_stage: "Closed-Lost"`, no `G1_CRITERIA_LOCKED` gate — and `CLOSE_DATE_PRESSURE` — needs a past `expected_close_date` and low gate completion.) Confirm all fail today.

- [ ] **Step 2: Add the guard to all 10 patterns' `evaluate` functions.** Each pattern's `evaluate` signature is `(deal, blockers, thresholds, context) => boolean` (or a subset of those params) — prepend the stage check to each pattern's existing boolean expression. Example for `GHOST_PIPELINE`:
  ```typescript
  evaluate: (deal, blockers, thresholds) => {
    if (deal.salesStage === "Closed-Won" || deal.salesStage === "Closed-Lost") return false;
    const hasNotes = !!(deal.blueprintNotes && deal.blueprintNotes.trim().length >= 20);
    return (
      blockers.active.length === 0 &&
      !hasNotes &&
      deal.daysSinceLastUpdate > thresholds.ghost_pipeline_days
    );
  },
  ```
  Apply the same `if (closed) return false;` pattern (or an equivalent `&&`-chained guard, whichever reads more naturally for that pattern's existing expression style) to the other 9: `MISSING_STRUCTURAL_ANCHOR`, `PHANTOM_CHAMPION`, `STALLED_VALIDATION`, `CLOSE_DATE_PRESSURE`, `SLOW_MOTION_COLLISION`, `UNPROTECTED_ELEPHANT`, `LOW_ATTACH_ELEPHANT`, `SIEM_UNDERSCOPED`, `PLAYBOOK_EXECUTION_GAP`. (`PREMATURE_COMMERCIAL` and `DISCOUNT_TRAP` already implicitly can't fire on closed deals since they check `salesStage` is exactly `"Commercial"`/`"Procurement"`; `NO_CLOSE_DATE` already guards; `UNRESOLVED_CRITICAL_BLOCKERS` and `COMPETITIVE_DISPLACEMENT_STALL` and `POC_DEATH_MARCH` are stage-scoped by construction too (`Validation`/`Commercial` only) — verify each pattern's CURRENT `evaluate` logic before assuming it needs the guard; only add it where the pattern's condition is NOT already stage-restricted to something that excludes Closed-Won/Closed-Lost.)

- [ ] **Step 3: Run and confirm.** Full engine suite. Since `analytics.ts`'s loss-risk/loss-dashboard routes call the engine on Closed-Lost deals specifically expecting SOME patterns to have fired historically, verify (by reading, not by guessing) that `computePatternLethality`'s input (`lostAlertCodes`) will now legitimately be sparser for many closed deals — this is the CORRECT outcome (most closed deals shouldn't retroactively trip patterns that were never true when they closed), not a regression; no server-side test change should be needed since those routes only pass codes through. `pnpm run typecheck`.

---

## Task 8: Unify the stage-advancement blocking-alert predicate (High H7)

**Files:**
- Modify: `artifacts/api-server/src/routes/deals.ts` (the `isAdvancing` block, `blockingCodes` computation)
- Modify: `artifacts/api-server/src/lib/intelligence.ts` (export a shared `isBlockingRedAlert` helper, or place it in a new small module both `deals.ts` and any future caller can import — implementer's choice of exact file, document the choice in the report)
- Test: `artifacts/api-server/src/routes/deals.test.ts` (find or create the file already covering stage-advancement guardrail tests — `CLAUDE.md` references this behavior, so a test file likely exists; add to it)

**Context (verified by reading, cross-checked against the disposition route's own rules):** `deals.ts`'s stage-advancement gate computes `blockingCodes` from `intel.governance.alerts` only (unmanaged alerts). Three gaps:
1. **Any disposition silently waives the gate.** `assembleDealIntelligence` moves a RED alert with ANY disposition (`acknowledge`, `accept`, OR `snooze`) into `managedAlerts`, invisible to `deals.ts`'s filter — so acknowledging a RED alert (which requires no rationale, per `routes/dispositions.ts`'s validation: only `accept` requires `rationale`, only `snooze` requires a duration) silently bypasses the guardrail with zero audit trail, contradicting `CLAUDE.md`'s documented behavior ("advancing past an active RED risk pattern returns 409 ... unless an override_reason is supplied").
2. **Contextual RED alerts (`HOSTILE_STAKEHOLDER`, weight 80) never block**, because `contextualAlertsFor()` is only called from the READ route (`routes/intelligence.ts:48`), never from `deals.ts`'s write path.

**Fix design — the guardrail should treat `accept` as the only disposition that legitimately clears a RED alert** (it already carries its own mandatory rationale from the disposition-setting flow — an independent audit trail). `acknowledge` and `snooze` must NOT clear a RED guardrail.

- [ ] **Step 1: Write the failing tests.** In the deals-route test file (find the existing one covering `override_reason`/`STAGE_GUARDRAIL` — search for `stageGuardrail` or `override_reason` in `*.test.ts` under `artifacts/api-server/src/routes/`):
  ```typescript
  it("acknowledging a RED alert does NOT waive the stage-advancement guardrail", async () => {
    // Create a deal that trips a RED pattern (e.g. MISSING_STRUCTURAL_ANCHOR:
    // sales_stage past Discovery, G1_CRITERIA_LOCKED not completed).
    // Acknowledge that pattern via PUT /deals/:id/alerts/:code/disposition
    // with disposition "acknowledge" (no rationale needed).
    // Then attempt to advance the stage via PATCH /deals/:id with no override_reason.
    // Expect: still 409 STAGE_GUARDRAIL, NOT a successful advance.
  });

  it("a hostile decision-maker (contextual RED alert) blocks stage advancement", async () => {
    // Create a deal, tag a stakeholder Hostile + isDecisionMaker, attempt to
    // advance the stage with no override_reason.
    // Expect: 409 STAGE_GUARDRAIL including HOSTILE_STAKEHOLDER in blockingCodes.
  });

  it("accepting a RED alert (with rationale) still clears the guardrail — unchanged behavior", async () => {
    // Same as the acknowledge case but disposition "accept" with a rationale.
    // Expect: stage advances successfully with no override_reason required.
  });
  ```
  Write these against the actual route-calling convention already used elsewhere in this test file (either supertest-style if this file uses it, or the direct-handler-off-router.stack pattern used in `routes/v2/config.test.ts` — match whatever this specific test file already does). Confirm the first and second currently fail.

- [ ] **Step 2: Implement the fix in `deals.ts`.** Change the `blockingCodes` computation:
  ```typescript
  if (isAdvancing) {
    const intel = await assembleDealIntelligence(id);
    const unmanagedRed = intel?.governance.alerts.filter((a) => a.severity === "RED").map((a) => a.code) ?? [];
    // A RED alert that's been "accept"-ed carries its own rationale (required by
    // the disposition route) and legitimately clears the guardrail; "acknowledge"
    // and "snooze" do not — they carry no equivalent accountability.
    const nonAcceptedManagedRed =
      intel?.governance.managedAlerts
        .filter((a) => a.severity === "RED" && a.disposition?.state !== "accept")
        .map((a) => a.code) ?? [];
    const contextualRed = (await contextualAlertsFor(id))
      .filter((a) => a.severity === "RED")
      .map((a) => a.code);
    const blockingCodes = [...new Set([...unmanagedRed, ...nonAcceptedManagedRed, ...contextualRed])];
    if (blockingCodes.length > 0) {
      // ... existing override_reason check, unchanged
    }
  }
  ```
  Import `contextualAlertsFor` from `../lib/contextual-alerts` in `deals.ts` (check the relative path matches this file's location).

- [ ] **Step 3: Run and confirm.** The full deals route test suite plus `pnpm --filter @workspace/api-server run test`, `pnpm run typecheck`.

---

## Task 9: Fix pipeline-transition value bridge and funnel conversion math (High H2 + H3)

**Files:**
- Modify: `artifacts/api-server/src/lib/subscribers/pipeline-transitions.ts` (handle `deal.created`, not just `deal.stage_changed`)
- Modify: `artifacts/api-server/src/lib/events.ts` (confirm `deal.created`'s event payload shape needs no change — verify by reading; if `occurredAt` isn't already on every event, check the base `DealEventBase` shape)
- Modify: `lib/engine/src/flow.ts` (`computeFunnel`'s `totalValue`; `computeFunnel`'s `enteredCount` → distinct-deal-based; `computeRecycleExit`'s `stillOpen` clamp)
- Test: `artifacts/api-server/src/lib/subscribers/pipeline-transitions.test.ts`, `lib/engine/src/flow.test.ts`

### Fix 9a — emit a `create` transition on deal creation (High H2)

**Context:** `pipeline_transitions` rows of type `"create"` are ONLY ever produced by the one-shot `scripts/src/backfill-pipeline-transitions.ts` — no live code path emits one, because `recordTransition` (the subscriber) only listens for `deal.stage_changed`, and `routes/deals.ts`'s POST handler already emits `deal.created` (line ~337) but nothing subscribes to it for transitions. Every deal created since the backfill therefore has NO `create` row, so `computeRecycleExit`'s value bridge (`waterfall`) under-counts `created` for every such deal, and `analytics.ts`'s flow routes' `tcvAtTransition` (looked up from `deal_snapshots`, which may not exist yet for a brand-new deal) resolves to `null` → `0`.

- [ ] **Step 1: Write the failing test** in `pipeline-transitions.test.ts` (mirror the existing test file's style for `recordTransition`):
  ```typescript
  it("a deal.created event produces a pipeline_transitions row with fromStageId null and the correct TCV", async () => {
    // Insert a deal directly (or via the existing test helper), emit
    // deal.created via the same dealEvents bus the subscriber listens on
    // (or call the new handler function directly if it's exported separately
    // from the dealEvents.on(...) registration), then query
    // pipeline_transitions for that dealId and assert exactly one row with
    // fromStageId === null, toStageId === the deal's salesStageId,
    // transitionType === "create", and tcvAtTransition matching
    // calculateFlatTCV({ productRevenue, servicesRevenue, contractTermYears, pricingModel }).
  });
  ```
  Confirm it fails today (no row is created).

- [ ] **Step 2: Implement.** In `pipeline-transitions.ts`, add handling for `deal.created` inside the same `dealEvents.on(...)` callback (alongside the existing `deal.stage_changed` branch):
  ```typescript
  if (event.type === "deal.created") {
    const [deal] = await db
      .select({
        salesStageId: enterpriseDeals.salesStageId,
        productRevenue: enterpriseDeals.productRevenue,
        servicesRevenue: enterpriseDeals.servicesRevenue,
        contractTermYears: enterpriseDeals.contractTermYears,
        pricingModel: pricingModels.modelName,
      })
      .from(enterpriseDeals)
      .leftJoin(pricingModels, eq(enterpriseDeals.pricingModelId, pricingModels.id))
      .where(eq(enterpriseDeals.id, event.dealId))
      .limit(1);
    if (!deal) return;
    const tcv = calculateFlatTCV({
      productRevenue: Number(deal.productRevenue) || 0,
      servicesRevenue: Number(deal.servicesRevenue) || 0,
      contractTermYears: deal.contractTermYears,
      pricingModel: deal.pricingModel ?? "",
    });
    await db
      .insert(pipelineTransitions)
      .values({
        dealId: event.dealId,
        fromStageId: null,
        toStageId: deal.salesStageId,
        transitionType: "create",
        tcvAtTransition: String(Math.round(tcv)),
        daysInFromStage: null,
        overridden: false,
        transitionedAt: event.occurredAt,
        createdBy: event.actor,
      })
      .onConflictDoNothing({ target: [pipelineTransitions.dealId, pipelineTransitions.transitionedAt] });
    return;
  }
  if (event.type === "deal.stage_changed") {
    // ... existing branch, unchanged
  }
  ```
  Add `pricingModels` to this file's `@workspace/db` import and `calculateFlatTCV` to its `@workspace/engine` import (add a new import line — this file currently only imports `computeTransitionType`/`StageDef` from there). Confirm `event.occurredAt` exists on the `deal.created` event shape in `events.ts` (`DealEventBase` — if it's not there, this is a NEEDS_CONTEXT signal; check before assuming).

- [ ] **Step 3: Unclamp the waterfall residual.** In `lib/engine/src/flow.ts`'s `computeRecycleExit`, change:
  ```typescript
  const stillOpen = Math.max(0, created - won - lost);
  ```
  to:
  ```typescript
  const stillOpen = created - won - lost;
  ```
  (If this goes negative in production data after Step 2 lands, that reveals a genuine double-count — e.g. a reopened Closed-Lost deal later closing Won — which needs its own investigation, not silent clamping. This task does not need to handle that case; removing the clamp is the whole fix.)

### Fix 9b — funnel `pctOfPipeline` and `convToNextPct` (High H3)

**Context:** `computeFunnel`'s `totalValue` sums ALL deals passed in (including terminal/closed ones, since `loadOpenDeals()` — despite its name — has no stage filter), while `inStage`/`dealCount` are correctly scoped to non-terminal `active` stages only — so `pctOfPipeline` values sum to far less than 100%. Separately, `convToNextPct`'s `enteredCount` counts every TRANSITION into a stage (including re-entries from backward recycles), not distinct deals, so a recycled deal can push the ratio above 100%.

- [ ] **Step 1: Write the failing tests** in `lib/engine/src/flow.test.ts`:
  ```typescript
  it("pctOfPipeline across active stages sums to ~100 even when closed deals exist", () => {
    const stages: StageDef[] = [
      { id: 1, name: "Discovery", sortOrder: 1 },
      { id: 2, name: "Validation", sortOrder: 2 },
      { id: 5, name: "Closed-Won", sortOrder: 5, terminal: "won" },
    ];
    const deals = [
      { id: "a", stageId: 1, tcv: 100, winProbabilityPct: 50, aiWinProbability: null, createdAt: "2026-01-01" },
      { id: "b", stageId: 5, tcv: 900, winProbabilityPct: 100, aiWinProbability: null, createdAt: "2026-01-01" },
    ];
    const rows = computeFunnel(deals, [], stages);
    const sum = rows.reduce((s, r) => s + r.pctOfPipeline, 0);
    expect(sum).toBeCloseTo(100, 1);
  });

  it("convToNextPct never exceeds 100% even when a deal is recycled back and re-advances", () => {
    const stages: StageDef[] = [
      { id: 1, name: "Discovery", sortOrder: 1 },
      { id: 2, name: "Validation", sortOrder: 2 },
    ];
    const t = [
      { dealId: "a", fromStageId: 1, toStageId: 2, transitionType: "forward" as const, tcv: 0, daysInFromStage: 1, transitionedAt: "2026-06-01T00:00:00Z" },
      { dealId: "b", fromStageId: 1, toStageId: 2, transitionType: "forward" as const, tcv: 0, daysInFromStage: 1, transitionedAt: "2026-06-02T00:00:00Z" },
      { dealId: "c", fromStageId: 1, toStageId: 2, transitionType: "forward" as const, tcv: 0, daysInFromStage: 1, transitionedAt: "2026-06-03T00:00:00Z" },
      { dealId: "c", fromStageId: 2, toStageId: 1, transitionType: "backward" as const, tcv: 0, daysInFromStage: 1, transitionedAt: "2026-06-04T00:00:00Z" },
      { dealId: "c", fromStageId: 1, toStageId: 2, transitionType: "forward" as const, tcv: 0, daysInFromStage: 1, transitionedAt: "2026-06-05T00:00:00Z" },
    ];
    const rows = computeFunnel([], t, stages);
    const discovery = rows.find((r) => r.stageName === "Discovery")!;
    expect(discovery.convToNextPct).toBeLessThanOrEqual(100);
    expect(discovery.convToNextPct).toBe(100); // 3 distinct deals entered Discovery, all 3 reached Validation
  });
  ```
  Confirm the first sums to `10` (not ~100) and the second currently gives `400` (not `100`).

- [ ] **Step 2: Fix `totalValue`.**
  ```typescript
  const active = [...stages].filter((s) => !s.terminal).sort((a, b) => a.sortOrder - b.sortOrder);
  const activeStageIds = new Set(active.map((s) => s.id));
  const totalValue = deals.filter((d) => activeStageIds.has(d.stageId)).reduce((sum, d) => sum + d.tcv, 0) || 1;
  ```

- [ ] **Step 3: Fix `enteredCount` to count distinct deals, not transitions.**
  ```typescript
  const enteredDealsByStage = new Map<number, Set<string>>();
  for (const t of transitions) {
    if (t.toStageId != null) {
      const set = enteredDealsByStage.get(t.toStageId) ?? new Set<string>();
      set.add(t.dealId);
      enteredDealsByStage.set(t.toStageId, set);
    }
  }
  ```
  and in the `active.map((stage, i) => {...})` body, replace:
  ```typescript
  const enteredThis = enteredCount.get(stage.id);
  const enteredNext = next ? (enteredCount.get(next.id) ?? 0) : null;
  ```
  with:
  ```typescript
  const enteredThis = enteredDealsByStage.get(stage.id)?.size;
  const enteredNext = next ? (enteredDealsByStage.get(next.id)?.size ?? 0) : null;
  ```
  and add a defensive cap where `convToNextPct` is computed:
  ```typescript
  convToNextPct:
    enteredThis != null && enteredThis > 0 && enteredNext != null
      ? Math.min(100, round1((enteredNext / enteredThis) * 100))
      : null,
  ```

- [ ] **Step 4: Run and confirm.** `pnpm --filter @workspace/engine exec vitest run src/flow.test.ts`, full engine suite, `pnpm --filter @workspace/api-server exec vitest run src/lib/subscribers/pipeline-transitions.test.ts`, full api-server suite, `pnpm run typecheck`.

---

## Task 10: Split MEDDPICC read path from write path (High H8)

**Files:**
- Modify: `artifacts/api-server/src/lib/meddpicc.ts` (extract a pure-read `assessMeddpicc`, keep `computeMeddpiccScoreForDeal` as the persist-and-sync path)
- Modify: `artifacts/api-server/src/routes/v2/meddpicc.ts` (GET uses the new read-only function; PATCH keeps using the persisting one)
- Test: `artifacts/api-server/src/lib/meddpicc-playbook-gate.test.ts` (already exercises `getMeddpiccAssessment` — extend it) or a new `meddpicc.test.ts` if none covers this file directly

**Context:** `GET /v1/deals/:dealId/meddpicc` calls `getMeddpiccAssessment` → `computeMeddpiccScoreForDeal`, which unconditionally `INSERT`s a `deal_meddpicc_scores` row AND calls `syncMeddpiccPlaybookGate` (a second write) — on every read, including from a read-only `reader` role (RBAC permits GET for readers). This is the exact bug class already fixed for `/deals/:dealId/score` (`computeDealScore` vs `scoreDeal`, with the docstring explicitly explaining why the split exists) — the same split was never applied here. Consequence beyond write amplification: `/analytics/deals/:dealId/trajectory` reads `dealScores`-equivalent history from `dealMeddpiccScores`, so N page views produce N identical history points.

- [ ] **Step 1: Write the failing test.** In the existing `meddpicc-playbook-gate.test.ts` (which already imports `getMeddpiccAssessment` and has DB fixtures set up — read it first to match its exact helper/fixture conventions), add:
  ```typescript
  it("getMeddpiccAssessment (read path) does not append a new dealMeddpiccScores row", async () => {
    const dealId = await createDeal(); // reuse this file's existing helper
    await getMeddpiccAssessment(dealId);
    const countAfterFirst = await scoreRowCount(dealId); // add a small count helper if none exists, mirroring scoring.test.ts's scoreRowCount
    await getMeddpiccAssessment(dealId);
    const countAfterSecond = await scoreRowCount(dealId);
    expect(countAfterSecond).toBe(countAfterFirst);
  });
  ```
  Confirm it fails today (`countAfterSecond` is `countAfterFirst + 1`).

- [ ] **Step 2: Refactor `lib/meddpicc.ts`.** Extract the pure scoring computation (everything up to but NOT including the `db.insert(dealMeddpiccScores)` and `syncMeddpiccPlaybookGate` calls) into a private helper, then expose two public functions:
  ```typescript
  async function computeAssessment(dealId: string): Promise<{ deal: DealForMeddpicc; result: MeddpiccScoreResult; effectiveAnswers: MeddpiccAnswerView[] } | null> {
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
    return { deal, result, effectiveAnswers };
  }

  /** Read-only: computes the current score WITHOUT persisting or syncing the playbook gate. */
  export async function assessMeddpicc(dealId: string): Promise<MeddpiccScoreResult | null> {
    const computed = await computeAssessment(dealId);
    return computed?.result ?? null;
  }

  /** Computes AND persists a new deal_meddpicc_scores row, then syncs the playbook gate. */
  export async function computeMeddpiccScoreForDeal(dealId: string): Promise<MeddpiccScoreResult | null> {
    const computed = await computeAssessment(dealId);
    if (!computed) return null;
    const { result } = computed;
    await db.insert(dealMeddpiccScores).values({
      dealId, overallScore: result.overallScore, overallPct: String(result.overallPct),
      stagePct: String(result.stagePct), ragStatus: result.ragStatus,
      pillarBreakdown: result.pillarBreakdown, strongNoCount: result.strongNoCount,
      unknownCount: result.unknownCount,
    });
    await syncMeddpiccPlaybookGate(dealId, result.ragStatus, result.overallPct);
    return result;
  }
  ```
  Then split `getMeddpiccAssessment` into two: the existing one keeps calling the PERSISTING path (used by PATCH, which legitimately wants a fresh persisted row after an answer changes) — rename it `recalculateMeddpiccAssessment` for clarity — and add a new `getMeddpiccAssessment` that calls `assessMeddpicc` (read-only) instead:
  ```typescript
  export async function getMeddpiccAssessment(dealId: string): Promise<MeddpiccAssessment | null> {
    const deal = await loadDeal(dealId);
    if (!deal) return null;
    const [answers, score] = await Promise.all([
      loadEffectiveAnswers(dealId, deal.accountName),
      assessMeddpicc(dealId),
    ]);
    if (!score) return null;
    return { questions: QUESTION_CATALOG, answers, score };
  }

  export async function recalculateMeddpiccAssessment(dealId: string): Promise<MeddpiccAssessment | null> {
    const deal = await loadDeal(dealId);
    if (!deal) return null;
    const [answers] = await Promise.all([loadEffectiveAnswers(dealId, deal.accountName)]);
    const score = await computeMeddpiccScoreForDeal(dealId);
    if (!score) return null;
    return { questions: QUESTION_CATALOG, answers, score };
  }
  ```

- [ ] **Step 3: Update the route.** In `routes/v2/meddpicc.ts`, change the PATCH handler's final `getMeddpiccAssessment(dealId)` call to `recalculateMeddpiccAssessment(dealId)`, importing it alongside the existing import. The GET handler keeps calling `getMeddpiccAssessment` (now read-only).

- [ ] **Step 4: Run and confirm.** `pnpm --filter @workspace/api-server exec vitest run src/lib/meddpicc-playbook-gate.test.ts`, full api-server suite (the existing tests in that file call `getMeddpiccAssessment` expecting it to trigger playbook-gate sync side effects in several cases — read each existing test carefully; any that relied on `getMeddpiccAssessment` itself performing the persist+sync must be updated to call `recalculateMeddpiccAssessment` instead, since that's now the correct function for "answer changed, recompute and sync" semantics — this is expected, not a sign the fix is wrong), `pnpm run typecheck`.

---

## Task 11: Add a `Superseded` playbook-assignment status; exclude it from the scoring aggregate (High H9)

**Files:**
- Modify: `artifacts/api-server/src/lib/playbook-signals.ts` (`getPlaybookSignals`; new `supersedeStalePlaybookAssignments`)
- Modify: `artifacts/api-server/src/lib/subscribers/playbook-engine.ts` (call the new function on every `deal.stage_changed`)
- Test: `artifacts/api-server/src/lib/playbook-signals.test.ts` (find or create)

**Context:** `getPlaybookSignals` aggregates across EVERY assignment a deal has ever picked up, with no way for an assignment to become inert once its stage is behind the deal. A deal that advances past a playbook's stage with steps still open keeps accruing `overdueCount` against a deadline (`assignedAt + cumulativeDuration`) that never moves, and keeps depressing `adherencePct` forever — which feeds both `playbook_adherence` (scoring.ts, capped penalty 0.5) and `PLAYBOOK_EXECUTION_GAP` (a RED... actually YELLOW risk pattern) permanently. **Advancing stages — the intended, desired action — monotonically worsens this signal with no way to clear it.**

**Scope decision (documented, not left to the implementer):** `dealPlaybookAssignments.status` is a free-form `varchar(20)` with no CHECK constraint (confirmed by reading `lib/db/src/schema/edc_v2_intel.ts:317`) — adding a new string value needs NO migration. This task changes `getPlaybookSignals` (the function feeding scoring/risk) to skip `"Superseded"` assignments, and adds the state-transition logic that marks an assignment `"Superseded"`. It deliberately does NOT touch `getPlaybookJourney`'s returned `PlaybookJourneyStatus` union (`"not_started" | "active" | "completed"`) or the frontend's own local `JourneyStatus` types (`playbook-panel.tsx`, `connections-tab.tsx`) — a `"Superseded"`-status assignment will continue to map to `"active"` in `getPlaybookJourney` exactly as it does today for any non-`"Completed"` assignment (`assignment.status === "Completed" ? "completed" : "active"` — no change needed there, since `"Superseded" !== "Completed"` already falls through to `"active"`, matching current behavior for a stuck assignment). This is intentional: fixing the SCORING bug does not require or justify a frontend UI change in this plan; a follow-up task can add a distinct "superseded" badge if desired.

- [ ] **Step 1: Write the failing test** in `playbook-signals.test.ts` (find the existing test file for this module — if none exists, create one following the DB-fixture conventions used in `meddpicc-playbook-gate.test.ts`):
  ```typescript
  it("getPlaybookSignals excludes a Superseded assignment from the aggregate", async () => {
    // Create a deal in Discovery, start its Discovery playbook, leave some
    // steps incomplete, then mark that assignment status = "Superseded"
    // directly (simulating what supersedeStalePlaybookAssignments will do).
    // Assert getPlaybookSignals(dealId) returns hasPlaybook: false (or
    // totalSteps: 0 if another active assignment exists) — the Superseded
    // assignment's steps/overdue/critical-gap counts must not appear.
  });

  it("supersedeStalePlaybookAssignments marks an earlier-stage Active assignment Superseded when the deal advances past it, and leaves a Completed assignment untouched", async () => {
    // Start a Discovery-stage playbook assignment (status stays "Active"
    // since no steps are completed). Call
    // supersedeStalePlaybookAssignments(dealId, validationSortOrder) — the
    // sortOrder of "Validation", which is greater than Discovery's. Assert
    // the assignment's status is now "Superseded". Separately, create a
    // second deal, complete its Discovery assignment fully (status becomes
    // "Completed" via the existing recomputeAssignment path), call
    // supersedeStalePlaybookAssignments again, and assert its status is
    // STILL "Completed" (never downgraded).
  });
  ```
  Confirm both fail today (no such exclusion or function exists).

- [ ] **Step 2: Add `supersedeStalePlaybookAssignments` to `playbook-signals.ts`:**
  ```typescript
  /**
   * Marks every "Active" assignment on this deal whose playbook targets a
   * stage strictly earlier (by sortOrder) than the deal's new stage as
   * "Superseded" — a terminal state distinct from "Completed", excluded from
   * getPlaybookSignals' aggregate. "Completed" assignments are never touched.
   */
  export async function supersedeStalePlaybookAssignments(
    dealId: string,
    newStageSortOrder: number,
  ): Promise<void> {
    const rows = await db
      .select({
        id: dealPlaybookAssignments.id,
        status: dealPlaybookAssignments.status,
        sortOrder: pipelineStages.sortOrder,
      })
      .from(dealPlaybookAssignments)
      .innerJoin(playbooks, eq(dealPlaybookAssignments.playbookId, playbooks.id))
      .innerJoin(pipelineStages, eq(playbooks.applicableStage, pipelineStages.stageName))
      .where(eq(dealPlaybookAssignments.dealId, dealId));
    for (const row of rows) {
      if (row.status === "Active" && row.sortOrder < newStageSortOrder) {
        await db
          .update(dealPlaybookAssignments)
          .set({ status: "Superseded" })
          .where(eq(dealPlaybookAssignments.id, row.id));
      }
    }
  }
  ```
  Add `pipelineStages` to this file's `@workspace/db` import if not already present (it is, per `getPlaybookJourney`'s existing use).

- [ ] **Step 3: Exclude `"Superseded"` from `getPlaybookSignals`'s loop:**
  ```typescript
  for (const assignment of assignments) {
    if (assignment.status === "Superseded") continue;
    const { steps, completions } = await stepsAndCompletionsFor(assignment.id, assignment.playbookId);
    // ... unchanged
  }
  ```

- [ ] **Step 4: Call it from the subscriber.** In `playbook-engine.ts`, after resolving the new stage's name, also resolve its `sortOrder` (extend the existing `stageName()` helper into a `stage()` helper returning `{ name, sortOrder } | null`, or add a sibling query) and call `supersedeStalePlaybookAssignments` unconditionally (regardless of whether a new playbook gets auto-assigned for the new stage):
  ```typescript
  export function registerPlaybookEngine(): () => void {
    return dealEvents.on(async (event) => {
      if (event.type !== "deal.stage_changed") return;
      const stage = await stageInfo(event.toStageId); // { name, sortOrder } | null — replaces stageName()
      if (!stage) return;

      await supersedeStalePlaybookAssignments(event.dealId, stage.sortOrder);

      const candidates = await db
        .select()
        .from(playbooks)
        .where(and(eq(playbooks.applicableStage, stage.name), eq(playbooks.isActive, true)))
        .limit(1);
      // ... existing auto-assign logic, unchanged, using stage.name where it used `name` before
    });
  }
  ```
  Import `supersedeStalePlaybookAssignments` from `../playbook-signals` (alongside the existing `startPlaybookForDeal` import).

- [ ] **Step 5: Run and confirm.** The new/existing playbook-signals tests, `pnpm --filter @workspace/api-server run test`, `pnpm run typecheck`.

---

## Task 12: Validate engine-threshold writes (Medium M4)

**Files:**
- Modify: `artifacts/api-server/src/routes/lookups.ts` (`PUT /lookups/engine-thresholds` handler)
- New: `artifacts/api-server/src/lib/threshold-validation.ts` (pure validator, DB-free, so it's unit-testable without a database — matches the existing convention in `lib/engine-config.ts`'s docstring: "No file here may import `@workspace/db`")
- Test: `artifacts/api-server/src/lib/threshold-validation.test.ts`

**Context:** `PUT /lookups/engine-thresholds` accepts arbitrary key/value pairs with zero range, type, or cross-key validation. Proven exploitable: setting all `risk_weight_*` keys to `0` collapses `computeComposite`'s `totalWeight` to `0`, making every deal's composite score `0`/LOW/GREEN regardless of actual risk; setting `risk_level_low_max` above `risk_level_moderate_max` (or above 100) makes `MODERATE`/`ELEVATED` unreachable; setting `low_attach_rate_threshold` to a value outside `[0, 1]` (it's a fraction, unlike every sibling threshold which is a count or percentage) makes `LOW_ATTACH_ELEPHANT` always-or-never fire.

**Scope (bounded, not a full schema rewrite):** validate exactly these rules, nothing more:
1. Every `risk_weight_{technical,commercial,stakeholder,temporal,financial,competitive,engagement}` key, if present in the update batch, must parse to a finite number `> 0`.
2. `risk_level_{low_max,moderate_max,elevated_max}`, if any is present in the update batch, must — after merging with the CURRENT values of whichever of the three are NOT in this batch — satisfy `0 <= low_max < moderate_max < elevated_max <= 100`.
3. `low_attach_rate_threshold`, if present, must parse to a finite number in `[0, 1]`.
4. `gate_completion_warn_pct`, `momentum_min_gate_pct`, `meddpicc_red_max`, `meddpicc_green_min`, if present, must parse to a finite number in `[0, 100]`; additionally if BOTH `meddpicc_red_max` and `meddpicc_green_min` end up set (merged with current DB values as in rule 2), `meddpicc_red_max < meddpicc_green_min` must hold.
5. Any key whose CURRENT `dataType` (from the existing `engine_thresholds` row, if one exists) is `"number"` must have a `parameter_value` that parses to a finite number (rejects `"NaN"`, `"Infinity"`, non-numeric garbage) — this is a generic backstop beyond rules 1-4's named keys.

A violation of any rule returns `400` with a message naming the offending key and the rule violated — do not silently clamp or drop the update.

- [ ] **Step 1: Write the failing tests** in `threshold-validation.test.ts` (pure, no DB):
  ```typescript
  import { describe, it, expect } from "vitest";
  import { validateThresholdUpdate } from "./threshold-validation";

  describe("validateThresholdUpdate", () => {
    it("rejects a risk_weight_* set to 0", () => {
      const result = validateThresholdUpdate(
        [{ parameter_key: "risk_weight_technical", parameter_value: "0" }],
        new Map(), // current DB rows, empty for this case
      );
      expect(result.valid).toBe(false);
    });

    it("rejects risk_level boundaries that are non-monotonic after merging with current values", () => {
      const current = new Map([
        ["risk_level_low_max", { parameterValue: "25", dataType: "number" }],
        ["risk_level_moderate_max", { parameterValue: "50", dataType: "number" }],
        ["risk_level_elevated_max", { parameterValue: "75", dataType: "number" }],
      ]);
      const result = validateThresholdUpdate(
        [{ parameter_key: "risk_level_low_max", parameter_value: "80" }], // now 80 > moderate_max's current 50
        current,
      );
      expect(result.valid).toBe(false);
    });

    it("rejects low_attach_rate_threshold outside [0, 1]", () => {
      const result = validateThresholdUpdate(
        [{ parameter_key: "low_attach_rate_threshold", parameter_value: "5" }],
        new Map(),
      );
      expect(result.valid).toBe(false);
    });

    it("accepts a valid, well-formed update", () => {
      const result = validateThresholdUpdate(
        [{ parameter_key: "stale_stage_days", parameter_value: "25" }],
        new Map([["stale_stage_days", { parameterValue: "21", dataType: "number" }]]),
      );
      expect(result.valid).toBe(true);
    });
  });
  ```
  Confirm these fail only in the sense that `validateThresholdUpdate` doesn't exist yet (compile error) — this IS the correct "failing test" for a brand-new module.

- [ ] **Step 2: Implement `threshold-validation.ts`:**
  ```typescript
  export interface ThresholdUpdateItem {
    parameter_key: string;
    parameter_value: string;
  }
  export interface CurrentThresholdRow {
    parameterValue: string;
    dataType: string;
  }
  export interface ValidationResult {
    valid: boolean;
    error?: string;
  }

  const POSITIVE_WEIGHT_KEYS = [
    "risk_weight_technical", "risk_weight_commercial", "risk_weight_stakeholder",
    "risk_weight_temporal", "risk_weight_financial", "risk_weight_competitive",
    "risk_weight_engagement",
  ];
  const UNIT_FRACTION_KEYS = ["low_attach_rate_threshold"];
  const PERCENT_KEYS = ["gate_completion_warn_pct", "momentum_min_gate_pct", "meddpicc_red_max", "meddpicc_green_min"];
  const BOUNDARY_KEYS = ["risk_level_low_max", "risk_level_moderate_max", "risk_level_elevated_max"] as const;

  function toFinite(v: string): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  export function validateThresholdUpdate(
    updates: ThresholdUpdateItem[],
    current: Map<string, CurrentThresholdRow>,
  ): ValidationResult {
    const byKey = new Map(updates.map((u) => [u.parameter_key, u.parameter_value]));

    for (const key of POSITIVE_WEIGHT_KEYS) {
      const v = byKey.get(key);
      if (v === undefined) continue;
      const n = toFinite(v);
      if (n === null || n <= 0) return { valid: false, error: `${key} must be a positive number, got ${v}` };
    }

    for (const key of UNIT_FRACTION_KEYS) {
      const v = byKey.get(key);
      if (v === undefined) continue;
      const n = toFinite(v);
      if (n === null || n < 0 || n > 1) return { valid: false, error: `${key} must be between 0 and 1, got ${v}` };
    }

    for (const key of PERCENT_KEYS) {
      const v = byKey.get(key);
      if (v === undefined) continue;
      const n = toFinite(v);
      if (n === null || n < 0 || n > 100) return { valid: false, error: `${key} must be between 0 and 100, got ${v}` };
    }

    const resolvedBoundary = (key: string): number | null => {
      const v = byKey.get(key) ?? current.get(key)?.parameterValue;
      return v === undefined ? null : toFinite(v);
    };
    const [lowMax, moderateMax, elevatedMax] = BOUNDARY_KEYS.map(resolvedBoundary);
    if (BOUNDARY_KEYS.some((k) => byKey.has(k))) {
      if (lowMax === null || moderateMax === null || elevatedMax === null) {
        return { valid: false, error: "risk_level boundaries must all be numeric" };
      }
      if (!(0 <= lowMax && lowMax < moderateMax && moderateMax < elevatedMax && elevatedMax <= 100)) {
        return { valid: false, error: `risk_level boundaries must satisfy 0 <= low_max(${lowMax}) < moderate_max(${moderateMax}) < elevated_max(${elevatedMax}) <= 100` };
      }
    }

    const resolvedMeddpicc = (key: string): number | null => {
      const v = byKey.get(key) ?? current.get(key)?.parameterValue;
      return v === undefined ? null : toFinite(v);
    };
    if (byKey.has("meddpicc_red_max") || byKey.has("meddpicc_green_min")) {
      const redMax = resolvedMeddpicc("meddpicc_red_max");
      const greenMin = resolvedMeddpicc("meddpicc_green_min");
      if (redMax !== null && greenMin !== null && !(redMax < greenMin)) {
        return { valid: false, error: `meddpicc_red_max(${redMax}) must be less than meddpicc_green_min(${greenMin})` };
      }
    }

    for (const u of updates) {
      const existing = current.get(u.parameter_key);
      if (existing?.dataType === "number" && toFinite(u.parameter_value) === null) {
        return { valid: false, error: `${u.parameter_key} expects a numeric value, got ${u.parameter_value}` };
      }
    }

    return { valid: true };
  }
  ```

- [ ] **Step 3: Wire into `routes/lookups.ts`.** In the `PUT /lookups/engine-thresholds` handler, after `const before = await db.select().from(engineThresholds);` and before the `for (const update of parsed.data.updates)` loop, build the `current` map and validate:
  ```typescript
  const currentMap = new Map(before.map((r) => [r.parameterKey, { parameterValue: r.parameterValue, dataType: r.dataType }]));
  const validation = validateThresholdUpdate(parsed.data.updates, currentMap);
  if (!validation.valid) {
    throw badRequest(validation.error ?? "Invalid threshold update");
  }
  ```
  Import `validateThresholdUpdate` from `../lib/threshold-validation`.

- [ ] **Step 4: Run and confirm.** `pnpm --filter @workspace/api-server exec vitest run src/lib/threshold-validation.test.ts`, then the full route test coverage for `lookups.ts` (find its existing test file and run it — a valid update in an existing test must still pass; if any existing test writes an update this validator would now reject, that's the validator correctly catching something the old code let through, not a bug in the validator — but VERIFY this by reading the failing existing test before changing it, in case it's actually a legitimate value this task's rule scope is too narrow to allow, which would be a NEEDS_CONTEXT signal, not something to paper over), `pnpm run typecheck`.

---

## Task 13: Property/invariant regression tests across the fixed modules

**Files:**
- New/extend: `lib/engine/src/dimensions.test.ts`, `lib/engine/src/loss-risk.test.ts`, `lib/engine/src/flow.test.ts`, `lib/engine/src/risk-v2.test.ts`

**Context:** each task above added a single-example regression test for the specific bug it fixed. This task adds a small SWEEP (a loop over a range of inputs, not a property-testing library — none is installed, and Global Constraints prefer the existing stack) for the four invariants proven broken during the review, so future changes to these functions can't silently reintroduce the same class of bug at a DIFFERENT specific input than the one example already covers.

- [ ] **Step 1:** In `dimensions.test.ts`, add:
  ```typescript
  it("[invariant] closeDateRisk is non-increasing in progressPct, for every daysToClose in a representative range", () => {
    for (const daysToClose of [-10, 0, 5, 15, 30, 60, 90]) {
      const scores = [];
      for (let progressPct = 0; progressPct <= 100; progressPct += 10) {
        const r = scoreTemporalPressure({
          salesStage: "Commercial", daysInStage: 10, daysToClose,
          expectedCloseDate: "2026-12-31", progressPct, benchmarkMedianDays: 30,
        });
        scores.push(r.signals.find((s) => s.factor.includes("days to close"))!.rawScore);
      }
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
      }
    }
  });
  ```

- [ ] **Step 2:** In `loss-risk.test.ts`, add:
  ```typescript
  it("[invariant] scoreLossRisk for a fixed active deal never decreases as the lost cohort grows", () => {
    const active = ["GHOST_PIPELINE", "NO_CLOSE_DATE"];
    let priorScore = 0;
    let cohort: string[][] = [];
    const additions = [["GHOST_PIPELINE"], ["STALLED_VALIDATION"], ["NO_CLOSE_DATE"], ["PHANTOM_CHAMPION"], ["GHOST_PIPELINE"]];
    for (const addition of additions) {
      cohort = [...cohort, addition];
      const lethality = computePatternLethality(cohort);
      const { score } = scoreLossRisk(active, lethality);
      expect(score).toBeGreaterThanOrEqual(priorScore > 0 ? 0 : 0); // score can fluctuate as ITS OWN matched patterns' lethality shifts — see note below
      priorScore = score;
    }
  });
  ```
  **Note for the implementer:** the max-matched-lethality fix (Task 6) makes the score stable ONLY when new cohort entries don't change the lethality of a pattern the active deal ITSELF matches (adding an unrelated pattern truly never changes it) — but adding MORE deals that also fire `GHOST_PIPELINE` or `NO_CLOSE_DATE` legitimately changes those patterns' own lethality share, which correctly moves the score. Write this test's assertions around that distinction precisely: assert the score is UNCHANGED when `additions` are patterns NOT in `active` (the true regression case), and don't assert monotonicity for entries that ARE in `active` (that's expected, legitimate movement). If the sketch above is ambiguous, split it into two focused tests instead of one loop — that is an acceptable, better-fitting deviation.

- [ ] **Step 3:** In `flow.test.ts`, add:
  ```typescript
  it("[invariant] pctOfPipeline across active stages always sums to ~100 regardless of closed-deal mix", () => {
    const stages: StageDef[] = [
      { id: 1, name: "Discovery", sortOrder: 1 },
      { id: 2, name: "Validation", sortOrder: 2 },
      { id: 3, name: "Commercial", sortOrder: 3 },
      { id: 5, name: "Closed-Won", sortOrder: 5, terminal: "won" },
      { id: 6, name: "Closed-Lost", sortOrder: 6, terminal: "lost" },
    ];
    for (const closedShare of [0, 0.3, 0.5, 0.9]) {
      const totalDeals = 10;
      const closedCount = Math.round(totalDeals * closedShare);
      const deals = Array.from({ length: totalDeals }, (_, i) => ({
        id: `d${i}`,
        stageId: i < closedCount ? 5 : (i % 3) + 1,
        tcv: 100,
        winProbabilityPct: 50, aiWinProbability: null, createdAt: "2026-01-01",
      }));
      const rows = computeFunnel(deals, [], stages);
      const sum = rows.reduce((s, r) => s + r.pctOfPipeline, 0);
      if (deals.some((d) => [1, 2, 3].includes(d.stageId))) {
        expect(sum).toBeCloseTo(100, 0);
      }
    }
  });
  ```

- [ ] **Step 4:** In `risk-v2.test.ts`, add:
  ```typescript
  it("[invariant] a non-assessable dimension never contributes to compositeScore or topDrivers, across a range of scores/amplifications", () => {
    for (const nonAssessableScore of [0, 30, 60, 90]) {
      for (const patternCodes of [[], ["PHANTOM_CHAMPION"], ["GHOST_PIPELINE", "PHANTOM_CHAMPION"]]) {
        const dims = [
          { name: "Technical Readiness" as const, score: 40, signals: [{ factor: "t", rawScore: 40, weight: 1 }], assessable: true },
          { name: "Stakeholder Coverage" as const, score: nonAssessableScore, signals: [{ factor: "x", rawScore: nonAssessableScore, weight: 1 }], assessable: false },
        ];
        const withoutStakeholder = computeUnifiedRisk({
          dimensionResults: [dims[0]], activePatternCodes: patternCodes, guardrailCodes: [],
          dealView: { tcv: 1, daysToClose: 10, progressPct: 40 },
        });
        const withStakeholder = computeUnifiedRisk({
          dimensionResults: dims, activePatternCodes: patternCodes, guardrailCodes: [],
          dealView: { tcv: 1, daysToClose: 10, progressPct: 40 },
        });
        expect(withStakeholder.compositeScore).toBe(withoutStakeholder.compositeScore);
        expect(withStakeholder.topDrivers.every((d) => d.dimension !== "Stakeholder Coverage")).toBe(true);
      }
    }
  });
  ```

- [ ] **Step 5: Run and confirm.** Full engine suite green, `pnpm run typecheck`.

---

## Final Verification (whole-branch, all tasks complete)

- [ ] `pnpm run typecheck` clean from repo root.
- [ ] `pnpm --filter @workspace/engine run test` — full pass.
- [ ] `pnpm --filter @workspace/api-server run test` — full pass.
- [ ] `pnpm run build` succeeds (typecheck + recursive build) — catches any dist/type drift the per-package test runs might miss.
- [ ] Re-read the ledger's deferred-minor list (if any task parked a finding at the fix-loop cap) and triage per superpowers:subagent-driven-development's final-review process before merge.
