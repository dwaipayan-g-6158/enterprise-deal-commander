import { flushSync } from "react-dom";
import { disarmSharedCard } from "./shared-card";
import {
  currentIndex,
  directionBetween,
  noteNavigation,
  stampIndex,
  type NavDirection,
} from "./history-index";
import { rememberScroll } from "./scroll-memory";
import { isLateralRoot } from "../nav/mobile-nav";
import {
  prefersReducedMotion,
  supportsViewTransitions,
  type StartViewTransition,
} from "./view-transition-support";

// Re-exported so callers have one place to import navigation concerns from.
export { prefersReducedMotion, supportsViewTransitions };

type NavigateOptions = { replace?: boolean; state?: unknown; transition?: boolean };
type Navigate = (to: string, options?: NavigateOptions) => void;

/**
 * Which way the screens should move.
 *
 * Peer destinations come first and unconditionally: the four tab roots and
 * Intelligence's three lenses have no hierarchy between them, so movement among
 * them is lateral whatever the history says. A push between peers would imply a
 * stack that does not exist, and the user would then find that "back" does not
 * undo it.
 *
 * Everything else is decided by history index, not by path depth. See
 * history-index.ts for why depth was wrong.
 */
export function navDirection(
  from: { path: string; index: number },
  to: { path: string; index: number },
): NavDirection {
  if (isLateralRoot(from.path) && isLateralRoot(to.path)) return "lateral";
  return directionBetween(from.index, to.index);
}

/** Publishes the direction for motion.css, and returns a cleanup. */
export function markDirection(direction: NavDirection): () => void {
  const root = document.documentElement;
  root.dataset.mNav = direction;
  return () => {
    delete root.dataset.mNav;
  };
}

/**
 * Runs `update` inside a view transition, or plainly when transitions are not
 * available or not wanted.
 *
 * flushSync is required, not defensive: the browser needs the new DOM before
 * startViewTransition's callback resolves, and React would otherwise batch the
 * update into a later frame — the transition would then snapshot the old screen
 * twice and cross-fade it with itself.
 */
export function runTransition(
  direction: NavDirection,
  update: () => void,
  /**
   * Runs after the commit but still inside the transition callback, so its
   * effects are captured in the "new" snapshot. Scroll restoration lives here:
   * assigning scrollTop before the commit silently clamps to the old, shorter
   * scrollHeight.
   */
  afterCommit?: () => void,
): void {
  const start = (document as Document & { startViewTransition?: StartViewTransition })
    .startViewTransition;

  if (!start || prefersReducedMotion()) {
    update();
    afterCommit?.();
    return;
  }

  const clear = markDirection(direction);
  const transition = start.call(document, () => {
    flushSync(update);
    afterCommit?.();
  });

  void transition.finished
    .catch(() => {
      // A transition interrupted by a second navigation rejects. Nothing to
      // handle — the cleanup below still has to run.
    })
    .finally(() => {
      clear();
      disarmSharedCard();
    });
}

/**
 * Wraps every wouter navigation in the mobile shell.
 *
 * Mounted as `<Router aroundNav={...}>` in MobileApp. A nested Router with no
 * base of its own inherits the parent's, so the desktop shell is untouched.
 *
 * NOTE ON COVERAGE, because it is the thing people get wrong about this hook:
 * `aroundNav` sees PROGRAMMATIC navigations only. Android's hardware back and
 * iOS's edge swipe fire `popstate`, which wouter handles directly — they never
 * reach here. Those are back-gesture.ts's job, and before it existed every back
 * gesture in the app was an instant cut.
 *
 * `options.transition === false` opts out. wouter's <Redirect> navigates from a
 * layout effect, where flushSync is not safe to call.
 */
export function aroundNav(navigate: Navigate, to: string, options?: NavigateOptions): void {
  if (options?.transition === false) {
    navigate(to, options);
    return;
  }

  const from = { path: window.location.pathname, index: currentIndex() };
  // A replace keeps the entry, so it keeps the index. A push takes the next one.
  const toIndex = options?.replace ? from.index : from.index + 1;

  const withIndex: NavigateOptions = {
    ...options,
    state: stampIndex(options?.state, toIndex),
  };

  runTransition(
    navDirection(from, { path: to, index: toIndex }),
    () => navigate(to, withIndex),
    () => {
      // Keep the back-gesture tracker in step. It cannot learn about
      // programmatic navigations on its own — popstate does not fire for them —
      // and a stale "from" would give the next gesture the wrong direction.
      noteNavigation(to, toIndex);
      rememberScroll(from.index);
    },
  );
}
