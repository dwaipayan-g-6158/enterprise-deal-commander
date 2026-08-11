/**
 * What a figure said last time you looked at it.
 *
 * Nothing in the mobile shell held a previous value to compare against, which
 * is why every animated number was an ENTRANCE and never a delta: `CountUp`
 * ramped from a hard-coded zero, so a pipeline that moved from $3.1M to $3.4M
 * counted up from nothing exactly as if it had just been created. The motion
 * was decoration, and decoration does not ship (styles/motion.css).
 *
 * With a previous value the same ramp becomes information: it starts where the
 * figure was, so its LENGTH is the size of the change and its direction is the
 * sign of it. Same animation, now worth watching.
 *
 * ## Session-scoped, and deliberately not persisted
 *
 * A reload legitimately starts fresh — the same rule scroll-memory.ts uses. A
 * delta against a figure from three days ago is not a delta anybody asked
 * about, and restoring one from storage would animate a jump the reader has no
 * context for the moment they open the app.
 *
 * Pure and dependency-free so it stays node-testable; vitest's standalone
 * config has no `resolve.alias`, so anything imported from here would have to
 * be relative anyway.
 */

const values = new Map<string, number>();

/** The last value recorded for `key`, or null if this is its first sighting. */
export function previousValue(key: string): number | null {
  const seen = values.get(key);
  return seen === undefined ? null : seen;
}

/**
 * Records what `key` is showing now.
 *
 * Non-finite values are ignored rather than stored: NaN would never compare
 * equal to itself, so a figure that briefly went undefined would then animate
 * on every single render.
 */
export function rememberValue(key: string, value: number): void {
  if (!Number.isFinite(value)) return;
  values.set(key, value);
}

/**
 * How a figure should arrive.
 *
 * Three cases, and the middle one is the reason this is a function rather than
 * a `?? 0`:
 *
 *   - unseen      ramp from zero. An entrance, which is correct the first time
 *                 a number appears on screen.
 *   - unchanged   do not ramp at all. Screens remount on every navigation, and
 *                 replaying the entrance each time is the tiresome behaviour
 *                 the old `once` flag existed to suppress.
 *   - changed     ramp from where it was. The delta, which is the point.
 */
export function rampFrom(key: string | undefined, value: number): number | null {
  if (key === undefined) return 0;
  const seen = previousValue(key);
  if (seen === null) return 0;
  return seen === value ? null : seen;
}

/** Test seam. */
export function _resetPreviousValues(): void {
  values.clear();
}
