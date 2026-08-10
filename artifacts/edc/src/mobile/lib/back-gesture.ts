import {
  navDirection,
  prefersReducedMotion,
  runTransition,
  supportsViewTransitions,
} from "./nav-transition";
import {
  currentIndex,
  ensureCurrentIndexed,
  lastNavigation,
  noteNavigation,
} from "./history-index";
import { indexOfEvent, rememberScroll, restoreScroll } from "./scroll-memory";

/**
 * Animates the back gesture.
 *
 * ## The bug this fixes
 *
 * `aroundNav` is a wouter *Router* option, and wouter only routes PROGRAMMATIC
 * navigations through it — Links, and anything calling navigate(). Android's
 * hardware/gesture back and iOS's edge swipe fire `popstate`, which wouter
 * handles directly through its own subscription. startViewTransition never ran
 * and `data-m-nav` was never set, so every back gesture in the app was an
 * instant cut, with all the push choreography reserved for the one direction
 * users press a button for.
 *
 * ## How it intercepts
 *
 * A capture-phase `popstate` listener that calls `stopImmediatePropagation()`,
 * runs the transition, and re-dispatches the event inside it so wouter commits
 * the route change at the right moment.
 *
 * ### The ordering requirement, which is load-bearing and easy to break
 *
 * `popstate` targets `window`, and for listeners on the event's own target the
 * DOM spec invokes them in REGISTRATION ORDER — the capture flag does not
 * promote them ahead of listeners registered earlier. So `capture: true` alone
 * does not put us first; being registered first does.
 *
 * That is why `installBackGesture()` is called at module scope from
 * mobile-app.tsx rather than from an effect. ES module evaluation happens before
 * any React render, so we are registered before wouter subscribes. Moving this
 * call into a component effect would silently stop the interception working
 * while leaving every other behaviour intact — the animation would just quietly
 * stop happening on gestures again.
 *
 * ### Predictive back
 *
 * Chromium drives its own preview animation for a predictive back gesture and
 * reports it as `hasUAVisualTransition`. Running ours as well would play the
 * animation twice, so we stand down and only restore scroll. This is also why
 * the Navigation API is not used here: intercepting there would mean
 * suppressing the UA's own gesture-driven preview, which is better than ours
 * because it tracks the finger.
 *
 * ### iOS's ceiling, stated honestly
 *
 * In a standalone PWA, iOS's edge swipe is a native gesture with no progress
 * signal and no interception point. The best available behaviour is a correct
 * COMMITTED pop, which is what this produces. A custom edge-pan would fight the
 * OS and break muscle memory, so it is deliberately not attempted. Two
 * consequences elsewhere: horizontal gestures inset themselves with
 * `.m-edge-guard`, and nothing reaching the left edge may set
 * `touch-action: none`.
 */

let installed = false;
/** Re-entrancy guard: our own re-dispatch must not be intercepted again. */
let redispatching = false;

function onPopState(event: PopStateEvent): void {
  const toIndex = indexOfEvent(event.state);
  const { path: fromPath, index: fromIndex } = lastNavigation();

  noteNavigation(window.location.pathname, toIndex);

  if (redispatching) return;

  // Record where we are leaving from before anything moves, so a later return
  // to this entry lands where the reader actually was.
  rememberScroll(fromIndex);

  const uaAnimated =
    (event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition === true;

  if (uaAnimated || !supportsViewTransitions() || prefersReducedMotion()) {
    // Let wouter handle the event untouched. Scroll still has to be restored,
    // but only after React has committed the new screen — hence the rAF.
    requestAnimationFrame(() => restoreScroll(toIndex));
    return;
  }

  event.stopImmediatePropagation();

  const direction = navDirection(
    { path: fromPath, index: fromIndex },
    { path: window.location.pathname, index: toIndex },
  );

  runTransition(
    direction,
    () => {
      redispatching = true;
      try {
        // Re-dispatched inside the transition's flushSync, so wouter's
        // useSyncExternalStore subscriber commits the new screen before
        // startViewTransition captures its "new" snapshot.
        window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
      } finally {
        redispatching = false;
      }
    },
    // After the commit, still inside the transition callback: the container is
    // now tall enough to hold the offset. Assigning scrollTop before the commit
    // would silently clamp to the old (short) scrollHeight.
    () => restoreScroll(toIndex),
  );
}

/**
 * Registers the interception. Idempotent, and must be called before wouter
 * mounts — see the ordering note above.
 */
export function installBackGesture(): () => void {
  if (installed || typeof window === "undefined") return () => {};
  installed = true;
  ensureCurrentIndexed();
  noteNavigation(window.location.pathname, currentIndex());

  window.addEventListener("popstate", onPopState, { capture: true });
  return () => {
    window.removeEventListener("popstate", onPopState, { capture: true });
    installed = false;
  };
}
