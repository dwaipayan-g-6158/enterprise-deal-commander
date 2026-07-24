# MEDDPICC Playbook Gate: Drive Auto-Complete from the Score, Not an Event

Date: 2026-07-24
Status: Approved, pending implementation.

## Problem

The "MEDDPICC qualification scored" playbook step (Discovery / Qualification
Playbook) is supposed to auto-complete once the MEDDPICC score reaches Green.
Today that only happens via `subscribers/meddpicc.ts`, which listens
exclusively for the `meddpicc.answer_changed` event — emitted only when a
user manually PATCHes an answer.

Since the MEDDPICC simplification (43 → 8 questions), 7 of 8 questions are
computed live with zero manual input, and `TOTAL_MAX` is 24. A deal can reach
21/24 = 87.5% (Green, threshold >75%) purely from auto-computed signals
(stakeholders, gates, competitors) with Metrics — the one manual question —
still completely unanswered. In that realistic scenario, `meddpicc.answer_changed`
never fires, so the playbook step never auto-completes, even though the score
shown on the tab is Green. The gate is out of sync with the score it's
supposed to reflect.

## Decision

Move the auto-complete check out of the event subscriber and run it directly,
inline, wherever the score is actually computed — `computeMeddpiccScoreForDeal()`
in the score service (`artifacts/api-server/src/lib/meddpicc.ts`). That
function already runs on every GET of the assessment (i.e. every time the
MEDDPICC tab is viewed) and every PATCH of an answer, so this guarantees the
gate reflects the score the moment it's computed — not only after a manual
answer happens to trigger an event.

- Extract the existing logic (`autoCompleteMeddpiccStepIfGreen`,
  `completeStepIfNotAlready`, `runSerialPerAssignment`) out of
  `subscribers/meddpicc.ts` into a new plain module,
  `artifacts/api-server/src/lib/meddpicc-playbook-gate.ts` — no event
  dependency, just an exported function `autoCompleteMeddpiccStepIfGreen(dealId, overallPct)`.
- `computeMeddpiccScoreForDeal` calls it directly when
  `result.ragStatus === "Green"`, after computing and persisting the score
  snapshot.
- Delete `subscribers/meddpicc.ts` and its registration in
  `subscribers/index.ts` — no longer needed.
- The `meddpicc.answer_changed` event itself is unchanged and keeps firing on
  every manual PATCH — `activity-logger.ts` still legitimately consumes it to
  log manual answer edits to the activity feed. Only the playbook auto-complete
  side effect moves off the event bus.
- All existing safety guarantees carry over unchanged: never overrides an
  explicit skip/block, per-assignment serialization still prevents duplicate
  completion rows under concurrent calls, no change to the Green threshold,
  step name, or playbook name being targeted.

## Testing

The existing subscriber test (`subscribers/meddpicc.test.ts`) is rewritten
against the new direct-call path (`computeMeddpiccScoreForDeal` /
`getMeddpiccAssessment`, not `emitDealEvent`), covering the same three cases
as before (auto-completes at Green, respects an explicit skip, no duplicate
completion rows under concurrent calls) plus one new case that specifically
exercises the bug just fixed: the step auto-completes when Green is reached
purely from auto-computed signals, with zero manual answers ever given.

## Out of scope

- No change to the RAG thresholds, the Green-completion note text, or which
  playbook/step this targets.
- No new UI — the Playbook journey panel already reflects step completion via
  its existing polling/refresh; this only fixes *when* the completion actually
  happens on the backend. Showing a live score percentage directly on the
  playbook step row (mentioned as a possible extra) was explicitly not
  requested — not part of this change.
