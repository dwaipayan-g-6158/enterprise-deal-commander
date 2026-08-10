/**
 * The undo window.
 *
 * Pure state machine plus the inverse-action derivation, so both can be tested
 * without timers or a rendered tree.
 */

export type UndoableAction =
  | { kind: "playbook-step"; assignmentId: string; stepId: string; label: string }
  | { kind: "gate"; dealId: string; gateCode: string; wasCompleted: boolean; label: string }
  | { kind: "disposition"; dealId: string; patternCode: string; label: string };

export interface UndoEntry {
  id: string;
  action: UndoableAction;
  /** When the window opened, in the caller's clock. */
  openedAt: number;
}

/** How long an undo stays offered. */
export const UNDO_WINDOW_MS = 6000;

/**
 * Whether an entry is still offerable.
 *
 * Takes `now` rather than reading the clock, so the boundary is testable and the
 * caller cannot disagree with it about which clock is in use.
 */
export function isUndoable(entry: UndoEntry, now: number): boolean {
  return now - entry.openedAt < UNDO_WINDOW_MS;
}

export function remainingMs(entry: UndoEntry, now: number): number {
  return Math.max(0, UNDO_WINDOW_MS - (now - entry.openedAt));
}

/**
 * One entry at a time, and a navigation clears it.
 *
 * A queue of undos would be a queue of decisions the reader has to hold in their
 * head; and an undo bar that outlives the screen it belongs to offers to reverse
 * something no longer on screen, which is worse than not offering at all.
 */
export function pushUndo(current: UndoEntry | null, next: UndoEntry): UndoEntry {
  return next;
}

export function clearOnNavigation(): null {
  return null;
}

/**
 * What the undo of an action is.
 *
 * Deliberately total over the actions that HAVE an undo. Accepting a risk is not
 * among them: accept carries a mandatory rationale and CLEARS THE SERVER-SIDE
 * STAGE GUARDRAIL, so it is an authorization rather than a note. Reversing it
 * silently from a phone, inside a six-second window, with no second rationale,
 * would let a guardrail be lifted and put back with nothing on the record about
 * why. Acknowledge and snooze carry no such authority and are undoable.
 *
 * Stage advance is also absent: the inverse of advancing is moving BACKWARD,
 * which is a different act with its own audit meaning, not an undo.
 */
export function describeUndo(action: UndoableAction): string {
  switch (action.kind) {
    case "playbook-step":
      return `Reopen ${action.label}`;
    case "gate":
      return action.wasCompleted ? `Re-open ${action.label}` : `Undo ${action.label}`;
    case "disposition":
      return `Restore ${action.label}`;
  }
}
