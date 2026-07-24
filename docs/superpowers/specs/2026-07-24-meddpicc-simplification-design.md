# MEDDPICC Simplification: 8 Questions, Mostly Auto-Computed

Date: 2026-07-24
Status: Approved, pending implementation plan.

## Problem

The MEDDPICC feature shipped earlier today with a faithful 43-question replica of
the dealpad.io template, 7 of those questions offered as click-to-accept
"suggestions" derived from existing deal data. In practice, working through 43
questions per deal — even with 7 pre-filled suggestions — is tedious enough that
the feature is more irritating than useful. Most of what the questions ask is
already knowable from data already in the tool (stakeholders, technical gates,
playbook completions, competitor tracking, deal history); only a genuine handful
of pillars have no such signal.

## Decision

Replace the 43-question catalog with exactly **8 questions — one per MEDDPICC
letter**. 7 of the 8 are computed automatically, live, from existing deal data
every time the score is viewed. Only 1 (Metrics/ROI) has no reliable signal
anywhere in the current schema and remains a manual question. The score itself
is always a live, automatic function of current data — never requires a
first-time sweep through 43 rows to become meaningful.

## The 8 questions and their data sources

| # | Pillar | questionOrder | stageTag | Source(s) | Score rule | Reason text (example) |
|---|---|---|---|---|---|---|
| 1 | Metrics | 1 | Q | *(none — manual)* | User answers 0-3 directly | — |
| 2 | Economic Buyer | 2 | P | Stakeholder `roleType='Economic Buyer'` + gate `G1_EXECUTIVE_AGREED` | both→3, one→2, neither→0 | "Economic Buyer tagged (Jane Doe); executive-agreement gate not yet completed" |
| 3 | Decision Criteria | 3 | Q | Gate `G1_CRITERIA_LOCKED` | completed→3, else→0 | "Technical success criteria gate completed" / "not yet completed" |
| 4 | Decision Process | 4 | Q | Count of stakeholders with `isDecisionMaker=true` | 2+→3, 1→2, 0→0 | "2 stakeholders tagged as decision-makers" |
| 5 | Paper Process | 5 | N | "Resolve legal redlines" step + "NDA, DPA & compliance evidence provided" step (Procurement/Legal Playbook) + gate `G4_COMPLIANCE_VALIDATED` | sum of the 3 booleans (naturally 0-3) | "2 of 3 signals complete: redlines done, NDA/DPA done, compliance gate not yet done" |
| 6 | Identify Pain | 6 | Q | Account has a prior Won deal in `deal_memory` | won-before→3, else→2 | "Acme Corp has a prior Won deal on record" / "No prior Won deal — treated as net-new" |
| 7 | Champion | 7 | P | Stakeholder `sentiment='Champion'` + gate `G2_CHAMPION_DEFENSIBLE` | both→3, one→2, neither→**1** | "Champion tagged (Priya Nair); internal-defensibility gate not yet completed" |
| 8 | Competition | 8 | Q | Tracked competitor(s) + historical win-rate (`competitorWinRates`) | win-rate data exists→`round(avgWinRate×3)` clamped 0-3, else→0 | "Average historical win rate vs. 1 tracked competitor: 67%" / "No win-rate evidence against a tracked competitor yet" |

Absence-of-signal defaults to 0 (Unknown) **except** two pillars that keep their
already-shipped, deliberately-chosen precedent:
- **Identify Pain** never scores below 2 — a net-new account isn't a real "no."
- **Champion** scores 1 (Strong No), not 0, when no champion is tagged and the
  gate isn't complete — an actively-checked absence of a champion is a real
  negative signal, not "we haven't looked."

`TOTAL_MAX` becomes `8 × 3 = 24` (was 129). RAG thresholds (Red<40%, Amber
40-75%, Green>75%) are unchanged and still settings-tunable.

## Computation model

- **Live, not event-driven.** Every fetch of the score/assessment recomputes
  the 7 auto-answers fresh from current data — the same pattern the existing
  suggestion engine (`meddpicc-signals.ts`) already uses, just applied by
  default instead of requiring a click. No new domain event types or
  subscribers are added for stakeholder/competitor mutations (neither emits
  events today).
- **Merge order:** if a `deal_meddpicc_answers` row exists for a question (a
  human explicitly answered or overrode it), that value wins, permanently,
  until changed again. Otherwise the live-computed value is used. A row's mere
  existence *is* the override signal — there is no separate "accepted
  suggestion" concept anymore.
- **Reason is always computed and always shown**, even when a question is
  currently overridden — so a user who disagrees with the system can still see
  why it thought what it thought (e.g. "System: 2 · Champion tagged, gate not
  complete" next to their own overriding answer of 3).
- **Playbook auto-complete-on-Green** keeps firing on the same trigger points
  as today (any manual answer change, plus gate/playbook-step events) — see
  Out of Scope below for the one known lag this leaves.

## Schema changes

- `meddpicc_questions`: clean cutover — delete all 43 existing rows, insert the
  new 8 (`questionOrder` 1-8, per the table above).
- `deal_meddpicc_answers`: delete all existing rows (clean cutover, per
  earlier confirmation — negligible real data exists). Drop the
  `isAutoSuggested` and `suggestedScore` columns — no longer meaningful once a
  row's existence alone signals an override; a row now simply has `score`,
  `note`, `answeredAt`, `answeredBy`.
- `deal_meddpicc_scores`: delete all existing rows (stale against the old
  43-question denominator). No structural column changes — `pillarBreakdown`
  keeps the same `{pillar, raw, max, pct}[]` shape, just with 8 pillars of
  max-3 each instead of 43 questions' worth.
- `lib/engine/src/meddpicc.ts`: `QUESTION_CATALOG` shrinks to 8 entries;
  `computeMeddpiccScore()`'s logic is otherwise unchanged (it already takes a
  plain `Record<questionOrder, score>` and doesn't care where the values came
  from).

## API / response shape changes

- The standalone `Suggestion` type/array disappears. Each `Answer` gains:
  - `score: number | null` — the *effective* score (manual override if one
    exists, else the live-computed value, else `null` only for an unanswered
    Metrics).
  - `source: "manual" | "computed" | "unanswered"`.
  - `reason: string | null` — always populated for the 7 auto pillars
    (regardless of override state), `null` for Metrics.
- `openapi.yaml`, generated Zod schemas, and the React Query hooks are
  regenerated accordingly (`pnpm --filter @workspace/api-spec run codegen`).

## UI changes

`meddpicc-panel.tsx` drops the collapsible pillar/sub-question structure
entirely — with one question per pillar there's nothing left to collapse.
Renders as a flat list of 8 rows. Each row keeps the same color-coded 0/1/2/3
button row just shipped (`meddpicc-legend-design.md`) — auto rows arrive
pre-selected at the computed score with their reason shown as a caption line;
clicking a different button overrides it exactly like answering Metrics does
today. The header legend/RAG badge/overall-vs-stage percentages are unchanged.

## Testing impact

Existing tests hard-code the old 43-question catalog and questionOrder values
and need a full rewrite, not a patch:
- `lib/engine/src/meddpicc.test.ts` (if present) — `TOTAL_MAX`, catalog length,
  stage-bucket filtering against the new 8 questions.
- `artifacts/api-server/src/lib/meddpicc-signals.test.ts` — every test
  references old questionOrders (6, 9, 21, 22, 24, 34, 39) and old
  single-signal logic; rewritten against the new combined-signal functions and
  questionOrders 2-8.
- `artifacts/api-server/src/lib/meddpicc.test.ts` (score service, if present) —
  merge-order (manual-row-wins) behavior is new and needs direct coverage.

## Out of scope

- No new domain event types for stakeholder or competitor mutations. This
  means the playbook auto-complete-on-Green side effect can lag behind a pure
  stakeholder/competitor edit (e.g. tagging a Champion) until the MEDDPICC tab
  is next viewed or an unrelated gate/playbook/answer event fires. The score
  itself is never stale when actually viewed — only this specific downstream
  side effect can lag.
- No new "business value / ROI" data field added anywhere to auto-derive
  Metrics — it stays the one manual question.
- No change to RAG thresholds, the Settings score-weights panel, or trajectory
  integration beyond seeing the new smaller `TOTAL_MAX`.
- No change to any other panel (`playbook-panel.tsx`, `stakeholders-panel.tsx`,
  gates UI) — this is scoped to the MEDDPICC data model, its two backing
  service files, its routes/schema, and its own panel component.
