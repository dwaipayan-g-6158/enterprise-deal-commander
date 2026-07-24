# MEDDPICC Playbook Gate: Auto-Reopen on Score Regression

Date: 2026-07-24
Status: Approved, implementing directly.

## Problem

The MEDDPICC playbook gate auto-completes when the score reaches Green
(previous fix, same day). It never reverses: once completed, the gate stays
completed even if the score later drops back to Amber or Red — e.g. a
champion stakeholder is removed, a gate gets un-toggled, a competitor
displaces the deal's position. The "MEDDPICC qualification scored" step then
misrepresents the deal's actual current qualification state.

This is a real gap, not a prior deliberate decision — the original fix only
implemented the forward direction (auto-complete on Green) and never
considered the regression case.

## Decision

Make the gate bidirectional, but only for completions the system itself
granted — never for a rep's own manual action.

- **Green:** unchanged. If no completion row exists yet, insert one
  (`status: "completed"`, `completedBy: "system"`).
- **Not Green (Amber or Red):** if a completion row exists with
  `status === "completed"` **and** `completedBy === "system"`, delete it
  (reopen). Any other state — a rep's manual completion, an explicit skip, an
  explicit block — is left untouched regardless of what the score does
  afterward. A human's deliberate decision is never silently undone by a
  later score dip.

Both directions run through the same per-assignment serialization already in
place, so the check stays atomic per deal/assignment.

## Schema change

Add `completedBy` (nullable `varchar(255)`) to `playbook_step_completions` —
reusing the exact column name/pattern already established on
`deal_technical_gates.completedBy` elsewhere in this schema. Additive
nullable column: applied via direct SQL against the dev database (per this
repo's convention for additive changes, avoiding an interactive `db push`
prompt), not a destructive migration.

- The MEDDPICC auto-complete insert sets `completedBy: "system"`.
- The manual "set step state" route (`POST
  /playbook-assignments/:assignmentId/steps/:stepId/state`) currently reads
  `actor.displayName` only to emit an event, discarding it — it's updated to
  also persist `completedBy: actor.displayName` on the row, so a manual
  completion is unambiguously distinguishable from a system one. This is the
  one piece of the fix outside the MEDDPICC-specific files, needed for the
  reopen check to work correctly.

## Mechanism

`autoCompleteMeddpiccStepIfGreen` is replaced by a single entry point,
`syncMeddpiccPlaybookGate(dealId, ragStatus, overallPct)`, called
unconditionally from `computeMeddpiccScoreForDeal` on every score
computation (replacing the current `if (ragStatus === "Green") { ... }`
guard at the call site — the branching moves inside the function):

```
if ragStatus === "Green":
  complete-if-not-already (existing logic, now also sets completedBy: "system")
else:
  reopen-if-system-completed (new: delete the row only if status="completed" AND completedBy="system")
```

An auto-reopen emits the same `playbook.step_changed` event as a manual
reopen, with `actor: "system"` (matching the existing convention for
auto-complete's emitted event) and `action: "reopened"`.

## Testing

Extends `meddpicc-playbook-gate.test.ts` with two new cases:
- A step auto-completed by the system (`completedBy: "system"`) is reopened
  when the score subsequently drops to Amber/Red.
- A step manually completed by a rep (`completedBy` set to an actor name,
  simulating the manual route) is **not** reopened even when the score is
  Red — proving the "never undo a human decision" guarantee.

## Out of scope

- No hysteresis/buffer at the Green/Amber boundary — each score computation
  reflects the current state plainly, same as the RAG badge itself has no
  hysteresis. Not introducing hysteresis complexity without a demonstrated
  flapping problem.
- No change to the manual Reopen button's own behavior (still a full row
  delete, already compatible with this fix — see prior verification).
- No retroactive `completedBy` backfill for existing rows created before this
  column existed (all `NULL`, which correctly reads as "not system" and is
  therefore never touched by the reopen check — safe default).
