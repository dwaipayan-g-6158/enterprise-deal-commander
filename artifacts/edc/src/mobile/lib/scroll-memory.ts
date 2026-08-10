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
  container.scrollTop = positions.get(index) ?? 0;
}

/** Reads the index off a popstate event's state, defaulting to the first entry. */
export function indexOfEvent(state: unknown): number {
  return readIndex(state) ?? 0;
}

/** Test seam. */
export function _resetScrollMemory(): void {
  positions.clear();
  container = null;
}
