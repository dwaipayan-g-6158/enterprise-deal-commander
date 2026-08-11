import { useCallback, useSyncExternalStore, type CSSProperties } from "react";
import { supportsViewTransitions } from "./view-transition-support";
import { hasRememberedScroll } from "./scroll-memory";

/**
 * The card-to-detail morph.
 *
 * A view-transition-name may be held by exactly one element per frame, so a
 * name cannot simply live on every card in a list. Instead one card is
 * "armed" at the moment it is pressed, and the detail screen it opens claims
 * the same names on arrival — the browser sees one element leaving and one
 * arriving under a shared name, and morphs between them.
 *
 * The two sides are stamped differently on purpose. The leaving card is
 * already on screen and React will not re-render it before the snapshot is
 * taken, so its names are written straight to the DOM. The arriving screen
 * renders inside the transition's own flushSync, so it can read this store
 * during that render and stamp itself through ordinary style props.
 *
 * It used to be forward-only, and the reason was real: the list remounted at
 * the top of its scroll, so the card the hero would morph into was often
 * nowhere near where it was tapped. lib/scroll-memory.ts removed that — its
 * own header records that restoring scroll "is what makes the reverse morph
 * possible at all" — so the morph now runs in both directions.
 *
 * The two directions mirror each other rather than sharing a path, because
 * which side React controls is reversed. Forward, the LEAVING card is stamped
 * straight to the DOM from the Link's onClick and the ARRIVING screen reads the
 * store during the transition's flushSync. Backward, the leaving HERO is
 * stamped straight to the DOM from the navigation handler, and the arriving
 * list's cards read the store the same way.
 */

/** Each part morphs on its own, so the three lines travel independently. */
const PARTS = ["card", "eyebrow", "title", "value"] as const;
export type SharedCardPart = (typeof PARTS)[number];

function nameFor(part: SharedCardPart): string {
  return `m-shared-${part}`;
}

/**
 * What the tapped card already knew.
 *
 * The detail screen it opens starts with an empty query, so without this it
 * would render a shimmer — and a morph needs something to morph into. Handing
 * the three lines forward means the destination can draw its own headline
 * immediately, which is both what makes the morph land and, on its own, a far
 * better loading state than a grey box where the deal name goes.
 */
export interface SharedCardSeed {
  eyebrow: string;
  title: string;
  value: string;
  /** Classes for the value, when it is a tinted badge rather than a figure. */
  valueClassName?: string;
}

let armedId: string | null = null;
let armedSeed: SharedCardSeed | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Claim the morph for `id`, stamp the leaving element, and hand its content
 * forward to the screen it opens.
 *
 * `root` is the card itself; every descendant carrying `data-shared-part`
 * gets its own name. Call this from the press handler, before navigating —
 * wouter runs a Link's own onClick before it navigates, so this lands ahead
 * of the snapshot.
 */
export function armSharedCard(id: string, seed: SharedCardSeed, root: HTMLElement | null): void {
  // Without view transitions these names do nothing, and nothing would ever
  // clear them — leave the DOM alone.
  if (!supportsViewTransitions()) return;

  stampParts(root);
  armedId = id;
  armedSeed = seed;
  emit();
}

/** Writes the names straight to the DOM, for whichever side React will not
 *  re-render before the snapshot is taken. */
function stampParts(root: HTMLElement | null): void {
  if (!root) return;
  root.style.viewTransitionName = nameFor("card");
  for (const el of root.querySelectorAll<HTMLElement>("[data-shared-part]")) {
    const part = el.dataset.sharedPart as SharedCardPart | undefined;
    if (part && (PARTS as readonly string[]).includes(part)) {
      el.style.viewTransitionName = nameFor(part);
    }
  }
}

/**
 * The hero currently on screen, if any, keyed by the record it shows.
 *
 * A map rather than a single slot even though only one detail screen is ever
 * mounted: during a route transition React briefly holds both, and a stale
 * entry left by the outgoing one would arm the wrong element. Sized checks
 * below treat anything other than exactly one candidate as "do not morph".
 */
const returnSources = new Map<string, HTMLElement>();

/**
 * Ref callback for a detail hero, making it the source of a reverse morph.
 *
 * A ref rather than an effect because the element has to be findable
 * synchronously from a popstate handler, which runs outside React entirely.
 */
export function registerReturnSource(id: string, el: HTMLElement | null): void {
  if (el) returnSources.set(id, el);
  else returnSources.delete(id);
}

export function useSharedReturnSource(id: string | null | undefined) {
  return useCallback(
    (el: HTMLElement | null) => {
      if (id) registerReturnSource(id, el);
    },
    [id],
  );
}

/**
 * Claim the morph for the way back, stamping the hero before the snapshot.
 *
 * Called from BOTH navigation paths, which are genuinely different code:
 * `aroundNav` sees programmatic navigations only, while a hardware back or an
 * iOS edge swipe arrives as `popstate` in back-gesture.ts. Arming in one and
 * not the other would give the chevron a morph and the gesture — the common
 * case — a plain cut.
 *
 * ## The guard, and what it does not cover
 *
 * Morphing needs something to morph INTO. If the list arrives as a shimmer,
 * nothing claims the names and the browser is left animating the hero out on
 * its own, flying to nothing. `hasRememberedScroll` is the cheap proxy: a
 * screen we have never left cannot be holding a card where the hero would land.
 *
 * It is a proxy and not a proof. A cache evicted while the app sat in the
 * background would pass this check and still render a shimmer. That case
 * degrades to a lone fade rather than a morph, which is worth accepting for
 * not threading the query client through two navigation handlers.
 */
export function armSharedReturn(toIndex: number): boolean {
  if (!supportsViewTransitions()) return false;
  if (returnSources.size !== 1) return false;
  if (!hasRememberedScroll(toIndex)) return false;

  const [[id, root]] = returnSources;
  stampParts(root);
  armedId = id;
  // The seed described the trip out and has nothing to say about the trip back;
  // leaving it would let a later mount read a stale headline.
  armedSeed = null;
  emit();
  return true;
}

/**
 * Release the morph. Called from aroundNav once the transition settles, which
 * re-renders the arriving screen without the names — otherwise a later
 * navigation would find two elements claiming one name and abort.
 *
 * The seed deliberately outlives the disarm: the screen that received it is
 * still drawing from it while its own query is in flight.
 */
export function disarmSharedCard(): void {
  if (armedId === null) return;
  armedId = null;
  emit();
}

/**
 * Whether `id` is armed right now. A one-shot read, not a subscription —
 * callers use it to decide how a screen arrived, which must not change under
 * them when the morph is released.
 */
export function isSharedCardArmed(id: string | null | undefined): boolean {
  return armedId != null && armedId === id;
}

/**
 * What the card that opened `id` was showing, if this screen was opened that
 * way. Read once at mount — see disarmSharedCard on why it is still here.
 */
export function sharedCardSeed(id: string): SharedCardSeed | null {
  return armedId === id ? armedSeed : null;
}

/** Test seam. */
export function _resetSharedCard(): void {
  armedId = null;
  armedSeed = null;
  returnSources.clear();
}

/**
 * Style props for the arriving side. Returns undefined unless this id is the
 * one that was armed, so every other row on the screen stays unnamed.
 */
export function useSharedCardStyle(
  id: string | null | undefined,
): (part: SharedCardPart) => CSSProperties | undefined {
  const armed = useSyncExternalStore(
    subscribe,
    () => armedId,
    () => null,
  );
  const active = armed != null && armed === id;

  return useCallback(
    (part: SharedCardPart) => (active ? { viewTransitionName: nameFor(part) } : undefined),
    [active],
  );
}
