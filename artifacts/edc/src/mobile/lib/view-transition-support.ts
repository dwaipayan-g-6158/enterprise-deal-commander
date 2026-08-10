/**
 * Capability checks for view transitions.
 *
 * A module of their own, rather than living in nav-transition.ts where they are
 * used most, because shared-card.ts needs them too — and shared-card is imported
 * BY nav-transition (to disarm the morph when a transition finishes). Putting
 * the predicates in either of those files makes the two import each other.
 *
 * No imports at all, so it is node-testable and can never be the file that
 * introduces a cycle.
 */

interface ViewTransition {
  finished: Promise<void>;
}

export type StartViewTransition = (update: () => void) => ViewTransition;

/**
 * Same-document view transitions: Safari 18+, Chromium 111+. Anything older
 * navigates normally, which is the appeal — no polyfill, no fallback path.
 */
export function supportsViewTransitions(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof (document as Document & { startViewTransition?: StartViewTransition })
      .startViewTransition === "function"
  );
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
