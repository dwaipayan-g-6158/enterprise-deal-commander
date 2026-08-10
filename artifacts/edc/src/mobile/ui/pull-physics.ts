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
