import { useCallback, useSyncExternalStore, type CSSProperties } from "react";
import { supportsViewTransitions } from "@/mobile/lib/view-transitions";

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
 * Deliberately forward-only. Going back, the list remounts at the top of its
 * scroll, so the card the hero would morph into is often nowhere near where
 * it was when it was tapped — the hero would fly off to an off-screen
 * position. Back gets the ordinary directional slide instead.
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

  if (root) {
    root.style.viewTransitionName = nameFor("card");
    for (const el of root.querySelectorAll<HTMLElement>("[data-shared-part]")) {
      const part = el.dataset.sharedPart as SharedCardPart | undefined;
      if (part && (PARTS as readonly string[]).includes(part)) {
        el.style.viewTransitionName = nameFor(part);
      }
    }
  }

  armedId = id;
  armedSeed = seed;
  emit();
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
