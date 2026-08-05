import { flushSync } from "react-dom";
import { disarmSharedCard } from "@/mobile/lib/shared-card";

type NavigateOptions = { replace?: boolean; state?: unknown; transition?: boolean };
type Navigate = (to: string, options?: NavigateOptions) => void;

interface ViewTransition {
  finished: Promise<void>;
}

type StartViewTransition = (update: () => void) => ViewTransition;

/**
 * Same-document view transitions: Safari 18+, and every Chromium since 111.
 * Anything older navigates normally, which is the whole appeal — there is no
 * polyfill to ship and no fallback path to maintain.
 */
export function supportsViewTransitions(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof (document as Document & { startViewTransition?: StartViewTransition })
      .startViewTransition === "function"
  );
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * How deep a route sits, for choosing which way the screens slide.
 *
 * Every tab root counts as the same level — Home included, despite having one
 * fewer segment — so switching tabs reads as lateral movement rather than as
 * a step down into Deals and back up out of it. Only a drill-down
 * (/deals → /deals/:id) counts as going deeper.
 */
function depthOf(path: string): number {
  return Math.max(0, path.split("/").filter(Boolean).length - 1);
}

function directionFor(from: string, to: string): "forward" | "back" | "lateral" {
  const delta = depthOf(to) - depthOf(from);
  if (delta > 0) return "forward";
  if (delta < 0) return "back";
  return "lateral";
}

/**
 * Wraps every wouter navigation in the mobile shell — Links, the Commander
 * sheet's programmatic jumps, all of it — in a view transition.
 *
 * Mounted as `<Router aroundNav={...}>` inside MobileApp rather than patched
 * onto each Link, because wouter routes every navigate() through this hook.
 * A nested Router with no `base` of its own inherits the parent's, so the
 * desktop shell is untouched.
 *
 * `options.transition === false` opts a navigation out. wouter's <Redirect>
 * fires from a layout effect, where flushSync is not safe to call, so the one
 * redirect in the mobile route table passes it.
 */
export function aroundNav(navigate: Navigate, to: string, options?: NavigateOptions): void {
  const start = (document as Document & { startViewTransition?: StartViewTransition })
    .startViewTransition;

  if (options?.transition === false || !start || prefersReducedMotion()) {
    navigate(to, options);
    return;
  }

  const root = document.documentElement;
  root.dataset.mNav = directionFor(window.location.pathname, to);

  const transition = start.call(document, () => {
    // The browser needs the new DOM before startViewTransition's callback
    // resolves; React would otherwise batch the update to a later frame and
    // the snapshot would capture the old screen twice.
    flushSync(() => navigate(to, options));
  });

  void transition.finished
    .catch(() => {
      // A transition skipped by a second navigation rejects. Nothing to do —
      // the cleanup below still has to run.
    })
    .finally(() => {
      delete root.dataset.mNav;
      disarmSharedCard();
    });
}
