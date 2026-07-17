# Playbook Intelligence — a live signal, not just data entry

**Date:** 2026-07-17
**Merged to `main`:** commit `f07c896` (fast-forward)
**Scope:** `37 files changed, +1,557 / −213`
**Areas:** `lib/engine`, `lib/api-spec` (+ generated `api-zod` / `api-client-react`), `lib/db`, `artifacts/api-server`, `artifacts/edc`

This change turns the **Validation → Playbook** tab (the `edc_v2` playbook engine — distinct from
the Technical Gates catalog) from passive check-off into a first-class, *live* input to the deal's
score, risk, health, and trajectory. It also fixes a long-standing bug where a **skipped** step
rendered the same green checkmark as a **completed** one.

Everything new degrades gracefully: the playbook inputs to the pure/isomorphic engine are optional
and neutral-defaulted, so deals with no playbook (and the browser Risk Simulator) are unaffected.

---

## 1. Robust step controls + the checkmark bug

- **Root cause of the bug:** `getDealPlaybook` returned `completedStepIds` built from the whole
  action ledger with no filter on the `skipped` flag, and the panel drew a green check for any id in
  that set — so skipped steps looked completed.
- **Data model:** added `status` (`completed | skipped | blocked`) to
  `edc_v2.playbook_step_completions` (migration `lib/db/sql/2026-07-playbook-step-status.sql`; the
  legacy `skipped` boolean is kept in sync).
- **API:** replaced the narrow `…/steps/{stepId}/complete` and `/skip` routes with a unified
  `POST …/steps/{stepId}/state` (`{ status, note? }`) and a `DELETE …/steps/{stepId}/state`
  (reopen). Steps are now **actionable in any order**; `getDealPlaybook` returns per-step
  `stepStates`, `progressPct`, and `overdueStepIds`.
- **UI:** `playbook-panel.tsx` rewritten — completed (green check), skipped (muted + strikethrough),
  **blocked** (amber), not-started, and an **overdue** clock chip all render distinctly, with a
  per-step note field and Complete / Skip / Block / Reopen controls on every step.

_Files:_ `lib/db/src/schema/edc_v2_intel.ts`, `artifacts/api-server/src/routes/v2/config.ts`,
`artifacts/edc/src/components/cockpit/v2/playbook-panel.tsx`, `lib/api-spec/openapi.yaml`

## 2. Playbook → predictive score

- New factor **`playbook_adherence`** in `lib/engine/src/scoring.ts` (the 9th). It rewards completion
  and penalises skipped/blocked-critical and overdue steps; returns a neutral 0.5 when a deal has no
  playbook. The other 8 weights were rebalanced so the set still sums to 100.
- `buildScoringInput` (`artifacts/api-server/src/lib/scoring.ts`) now reads the playbook signals.
  The factor weight is DB-tunable via `scoring_model_weights` and editable in Settings (§5).

## 3. Playbook → risk + governance health

- New pattern **`PLAYBOOK_EXECUTION_GAP`** (`lib/engine/src/index.ts`), **severity YELLOW** — fires
  when a critical step is skipped/blocked or a step is overdue. It amplifies **Engagement Vitality**
  + **Temporal Pressure** (`risk-v2.ts` `PATTERN_DIMENSION_MAP`) → composite risk → health. Being
  YELLOW, it enriches risk/health but does **not** trip the RED-only stage-advancement guardrail.
- Inputs (skipped/blocked-critical count, overdue count) are assembled server-side in
  `assembleDealIntelligence` and passed into the pure engine — the engine still does no DB access.
- Overdue is computed from `assignedAt` + cumulative `expectedDurationDays` +
  `playbook_overdue_grace_days` (a new tunable threshold).

## 4. Live wiring + trajectory

- New domain event **`playbook.step_changed`** (`events.ts`), emitted by the state routes. It is
  added to the scoring subscriber's `RESCORE_ON`, and the existing snapshot / health-tracker /
  activity-logger subscribers already listen to all events — so one action re-scores, snapshots,
  recomputes health, and logs to the deal's activity feed.
- The panel invalidates **all deal-scoped queries**, so the Score, Alerts, and Trajectory tabs
  update without a reload.
- **Trajectory** gains a **Playbook %** metric (snapshot payload → trajectory route →
  `deal-trajectory.tsx` line/tab/tooltip).

## 5. Settings

- New **`GET/PUT /api/v2/config/scoring-weights`** and a **Score Weights** Settings panel
  (`scoring-weights-settings.tsx`) to tune the predictive-score factor weights (with a live
  "total = 100%" indicator). The overdue-grace knob auto-appears in the existing Thresholds tab.

## 6. Shared signal helper

All of the above read one source of truth — `artifacts/api-server/src/lib/playbook-signals.ts`
(`getPlaybookSignals`) — so score, risk, trajectory, and the panel never diverge.

---

## Catalog expansion (bundled)

This commit also carries the earlier data-only catalog growth: **3 → 5 playbooks / 12 → 26 steps**,
adding a Discovery/Qualification playbook and a Closed-Won onboarding/handoff playbook so every
selling stage has one. See `lib/db/sql/2026-07-playbook-catalog-expansion.sql` and
`seedPlaybooks()` in `artifacts/api-server/src/seed.ts`.

## Invariants & migrations

- Engine invariants: **16 risk patterns**, **9 scoring factors** (tests updated in
  `index.test.ts`, `risk-v2.test.ts`, `v2.test.ts`, `engine-config.test.ts`; a new
  `playbook-signals.test.ts` covers the signal math).
- DB (dev already applied; run on other environments, or re-seed a blank DB):
  `2026-07-playbook-step-status.sql`, `2026-07-playbook-catalog-expansion.sql`,
  `2026-07-playbook-intelligence-config.sql` (grace threshold + rebalanced weights).
- Verified: typecheck clean; engine 149, edc 128, api-server 102 tests green; browser E2E across
  complete/skip/block/reopen, score movement, the YELLOW alert, live cross-tab refresh, the
  trajectory line, and the Settings panel.
