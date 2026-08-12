/**
 * Pull-to-refresh resistance.
 *
 * Pure, so the curve can be checked without a touch device — which matters
 * because this is one of the few things in the shell that cannot be reviewed by
 * looking at a screenshot.
 */

/** Pull distance, after resistance, that arms the refresh. */
export const TRIGGER_PX = 68;

/**
 * Asymptote. The finger can travel any distance; the content approaches this and
 * never reaches it.
 */
export const MAX_PULL_PX = 120;

/**
 * How much of the content's travel a docked bottom bar takes on.
 *
 * The docks used to take none of it: `PullToRefresh` translates its own children
 * and the docks are siblings, so a pull moved the list and left the search bar
 * frozen mid-screen. On a list long enough to reach the dock nobody noticed; on
 * a short one it read as a stuck control, which is how it was reported.
 *
 * Not 1. A dock that matched the content exactly would travel the full 120px —
 * it sits 64px above the bottom and is 71px tall, so at full pull almost all of
 * it would be behind the tab bar or off screen. At 0.3 it moves at most 36px:
 * enough to read as attached to the surface, never enough to leave.
 */
export const DOCK_PULL_RATIO = 0.3;

/**
 * Maps raw finger travel to content displacement.
 *
 * Exponential rather than the previous linear `travel * 0.5` capped at 96. A
 * linear curve with a cap has a hard edge in it: resistance feels constant, then
 * the content simply stops, and the finger keeps going against a wall. Every
 * native rubber band instead gets progressively harder and never quite arrives,
 * which is what makes the surface feel physical rather than geared.
 *
 * At the origin the derivative is 1, so the first few pixels track the finger
 * exactly — a gesture that starts by lagging reads as dropped input.
 */
export function pullDistance(travelled: number): number {
  if (travelled <= 0) return 0;
  return MAX_PULL_PX * (1 - Math.exp(-travelled / MAX_PULL_PX));
}

/** How far through the arming gesture a given pull is, clamped to 1. */
export function pullProgress(pull: number): number {
  return Math.min(pull / TRIGGER_PX, 1);
}

export function isArmed(pull: number): boolean {
  return pull >= TRIGGER_PX;
}
