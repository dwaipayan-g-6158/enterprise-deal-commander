/**
 * Decision Log statuses, spelled the way the Data Store spells them.
 *
 * Capitalised because that is what the repository writes — `status: "Pending"`
 * on create and the `=== "Completed"` that stamps `completed_at`, both in
 * `lib/db/src/catalyst/repositories/intel-core.ts` — and the API hands the value
 * back verbatim. There is no normalisation anywhere between the two.
 *
 * Named here because `status` is typed as a bare `string` in `openapi.yaml`, so
 * nothing in the contract stops a caller inventing its own casing, and nothing
 * did: the mobile panel filtered on lowercase `"completed"`, which no row has
 * ever held. Its Completed section could therefore never populate, and every
 * finished decision rendered in the Open list — styled as live work somebody
 * still owed. A typecheck cannot catch a string compared against the wrong
 * string, so the only defence is having exactly one place the string lives.
 */
export const DECISION_STATUS = {
  pending: "Pending",
  inProgress: "In Progress",
  completed: "Completed",
  overridden: "Overridden",
} as const;

export type DecisionStatus = (typeof DECISION_STATUS)[keyof typeof DECISION_STATUS];

/** Takes a bare `string` because that is what the generated client hands over. */
export function isDecisionCompleted(status: string): boolean {
  return status === DECISION_STATUS.completed;
}
