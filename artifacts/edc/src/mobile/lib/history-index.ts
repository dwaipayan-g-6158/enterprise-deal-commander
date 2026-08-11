/**
 * A monotonic index stamped into `history.state`, so navigation direction is a
 * FACT rather than an inference.
 *
 * ## Why the old approach could not work
 *
 * Direction used to be derived from path depth: deeper meant forward, shallower
 * meant back, equal meant lateral. Depth is a proxy for history, and the two
 * disagree constantly — going back from `/deals` to `/analytics` read as
 * lateral, and jumping forward from `/deals/:id` to `/memory` read as a pop. The
 * animation then argues with what the user just did, which is worse than having
 * no animation at all.
 *
 * An index answers the question directly: the entry you are arriving at either
 * came before or after the one you left. wouter forwards `navigate(to, { state })`
 * straight to `history.pushState`, so the slot is ours to use.
 *
 * The tab-to-tab case is still decided by a lookup rather than by index (see
 * mobile-nav.ts): peer destinations have no hierarchy, so their movement is
 * lateral no matter which order they were visited in.
 */

const INDEX_KEY = "__mIndex";

export type NavDirection = "forward" | "back" | "lateral";

/** The index carried by a history state object, or null if it carries none. */
export function readIndex(state: unknown): number | null {
  if (!state || typeof state !== "object") return null;
  const raw = (state as Record<string, unknown>)[INDEX_KEY];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/**
 * Merges an index into a history state, preserving whatever else is there.
 *
 * Non-object states (wouter allows any value) are replaced rather than merged —
 * there is nothing to preserve, and spreading a string would produce an object
 * of character indices.
 */
export function stampIndex(state: unknown, index: number): Record<string, unknown> {
  const base = state && typeof state === "object" ? (state as Record<string, unknown>) : {};
  return { ...base, [INDEX_KEY]: index };
}

/**
 * Direction implied by two indices.
 *
 * Equal indices mean a `replace:true` navigation — the entry was swapped rather
 * than pushed — which is lateral by definition. That is exactly what the
 * Intelligence lens switcher does.
 */
export function directionBetween(from: number, to: number): NavDirection {
  if (to > from) return "forward";
  if (to < from) return "back";
  return "lateral";
}

/** The current entry's index. Entries predating this module count as 0. */
export function currentIndex(): number {
  if (typeof history === "undefined") return 0;
  return readIndex(history.state) ?? 0;
}

/**
 * Whether the entry before this one belongs to the app.
 *
 * `ensureCurrentIndexed` stamps 0 onto whatever entry the shell mounted on, and
 * every in-app push increments — so a non-zero index means there is an earlier
 * in-app entry to pop to, and zero means this screen IS the entry point (a deep
 * link, a home-screen shortcut, a shared URL).
 *
 * The back chevron needs the distinction: popping is the correct back
 * behaviour, but popping from the entry point would leave the app entirely.
 */
export function canPopWithinApp(): boolean {
  return currentIndex() > 0;
}

/**
 * Where the shell believes it currently is.
 *
 * The tracker lives here, in the module that owns the index, rather than in
 * back-gesture.ts where it is read — otherwise nav-transition.ts (which must
 * update it after a programmatic navigation) and back-gesture.ts (which must
 * read it on a pop) would import each other.
 *
 * `popstate` does not fire for programmatic navigations, so without this the
 * tracker would still hold the path from two screens ago and hand the next back
 * gesture the wrong direction.
 */
let lastPath = typeof window === "undefined" ? "/" : window.location.pathname;
let lastIndex = 0;

export function noteNavigation(path: string, index: number): void {
  lastPath = path;
  lastIndex = index;
}

export function lastNavigation(): { path: string; index: number } {
  return { path: lastPath, index: lastIndex };
}

/**
 * Ensures the CURRENT entry carries an index.
 *
 * Called once when the shell mounts. Without it, the first navigation would push
 * index 1 on top of an unindexed entry that reads as 0 — which happens to be
 * right — but going back to it would then find no index at all and have to
 * guess. Stamping it up front makes the very first back gesture as correct as
 * every later one.
 *
 * Uses replaceState so it does not add an entry of its own.
 */
export function ensureCurrentIndexed(): void {
  if (typeof history === "undefined") return;
  if (readIndex(history.state) !== null) return;
  history.replaceState(stampIndex(history.state, 0), "");
}
