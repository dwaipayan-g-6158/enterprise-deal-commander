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

/*
 * There is deliberately no DOCK_PULL_RATIO any more, and the history is worth
 * keeping so it is not reintroduced a third time.
 *
 * The docked search bars on Deals and Memory originally took none of the pull:
 * `PullToRefresh` transforms its own children and the docks are siblings, so a
 * pull moved the list and left the bar still. That was reported as a stuck
 * control, and the fix was to hand the dock a damped copy of the transform —
 * 0.3 of the content's travel, at most 36px.
 *
 * That was then reported the other way round, on the same screen and for a
 * reason the first fix did not account for: **Deals has no scroll range at all**
 * with a typical pipeline. Three active deals underfill the viewport, so
 * `scrollHeight === clientHeight` and pull-to-refresh arms on EVERY downward
 * drag — there is no ordinary scrolling to be had. A bar that travels on every
 * drag reads as unstable rather than attached, because on an underfilled list no
 * content ever reaches the dock for it to look attached TO.
 *
 * Measured on the deployed app at 390x844: Deals scroll range 0px, Memory 959px,
 * both moving the dock exactly 24px on the same gesture. Same code, same
 * behaviour; only the odds of entering it differ, which is why it looked like a
 * Deals-only bug.
 *
 * The dock is now static, chosen over softening the ratio because half-measures
 * leave both readings present and neither resolved. If the "stuck control"
 * reading ever comes back on a genuinely long list, the answer is to keep the
 * dock still and stop the content sliding behind it — not to start moving the
 * one control on screen that the user is trying to aim at.
 */

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
