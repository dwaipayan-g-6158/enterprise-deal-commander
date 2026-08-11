/**
 * Per-history-entry scroll restoration for the shell's scroll container.
 *
 * The browser cannot do this for us. Its own `history.scrollRestoration` tracks
 * the DOCUMENT's scroll position, and the shell never scrolls the document — it
 * is a fixed 100dvh frame with an overflowing <main> inside it. So the browser
 * faithfully restores a scroll of 0 while the list the reader was halfway down
 * snaps back to the top.
 *
 * That is not only a comfort problem. shared-card.ts had to make the card→detail
 * morph FORWARD-ONLY, and its comment names the reason: "the list remounts at
 * the top of its scroll", so there was nothing at the right place to morph back
 * into. Restoring scroll is what makes the reverse morph possible at all.
 */

import { readIndex } from "./history-index";

/** index → scrollTop. Session-scoped; a reload legitimately starts fresh. */
const positions = new Map<number, number>();

let container: HTMLElement | null = null;

/**
 * Takes ownership of scroll restoration.
 *
 * `history.scrollRestoration = "manual"` stops the browser from ALSO restoring
 * the document scroll on a pop. Without it the browser's restore and ours race,
 * and on iOS the browser's tends to land second — producing a jump after the
 * content has already settled, which reads as a bug rather than as a scroll.
 */
export function installScrollMemory(el: HTMLElement | null): void {
  container = el;
  if (typeof history !== "undefined" && "scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }
}

export function forgetScrollMemory(): void {
  container = null;
}

/** Records the current position against a history index. */
export function rememberScroll(index: number): void {
  if (!container) return;
  positions.set(index, container.scrollTop);
}

/**
 * Restores the position recorded for a history index.
 *
 * Must be called INSIDE the view transition's update callback, after React has
 * committed the new screen — the container has to be tall enough to hold the
 * offset or the assignment silently clamps to the current scrollHeight. That
 * ordering is the whole reason back-gesture.ts wraps its restore and its
 * re-dispatch in one flushSync.
 *
 * Unknown index means a forward navigation to a screen never visited: the top
 * is correct there, and is also what a fresh screen would do anyway.
 */
export function restoreScroll(index: number): void {
  if (!container) return;
  // Marked BEFORE the assignment: the scroll event it produces must already
  // find the window open, or the capsule reads the restore as a flick.
  markProgrammaticScroll();
  container.scrollTop = positions.get(index) ?? 0;
}

/**
 * When the current programmatic scroll stops counting as one.
 *
 * The scroll container cannot tell us who moved it, and a `scroll` event from
 * `restoreScroll` is indistinguishable from a thumb. That matters because the
 * Commander capsule hides itself on downward scroll: restoring a screen to 300px
 * looked like a deliberate 300px flick, so the capsule ducked out for its full
 * settle window on every back-navigation, and `scrollIntoView` from the
 * capsule's own jump list hid the capsule that offered the jump.
 *
 * A timestamp rather than a boolean flag, because smooth scrolling keeps firing
 * events for hundreds of milliseconds after the call that started it — there is
 * no single event to clear a flag on. `scrollend` would be the precise signal
 * and is too new to rely on here.
 */
let programmaticUntil = 0;

/**
 * Declare that the next scroll events are the app's doing, not the reader's.
 *
 * The default covers an instant jump; callers that start a SMOOTH scroll pass a
 * longer window, since those keep emitting until the animation lands.
 */
export function markProgrammaticScroll(durationMs = 250): void {
  const now = typeof performance === "undefined" ? 0 : performance.now();
  // Never shortens an in-flight window: a restore landing inside a smooth jump
  // must not hand the rest of that jump back to the reader.
  programmaticUntil = Math.max(programmaticUntil, now + durationMs);
}

/** Whether the scroll happening right now was started by the app. */
export function isProgrammaticScroll(): boolean {
  const now = typeof performance === "undefined" ? 0 : performance.now();
  return now < programmaticUntil;
}

/**
 * Whether we have ever recorded a position for this entry — i.e. whether the
 * reader has been on it and left it.
 *
 * Used by the reverse morph as its "is there something to morph back into"
 * check. It is a proxy for a warm query cache rather than a reading of one, and
 * a deliberately cheap one: a screen we have never left cannot have a card
 * sitting where the hero would fly to, and a screen we have just left almost
 * certainly still has its data. See armSharedReturn for the residual case.
 */
export function hasRememberedScroll(index: number): boolean {
  return positions.has(index);
}

/** Reads the index off a popstate event's state, defaulting to the first entry. */
export function indexOfEvent(state: unknown): number {
  return readIndex(state) ?? 0;
}

/** Test seam. */
export function _resetScrollMemory(): void {
  positions.clear();
  container = null;
  programmaticUntil = 0;
}
