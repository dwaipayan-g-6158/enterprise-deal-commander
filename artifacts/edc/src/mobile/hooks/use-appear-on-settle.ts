import { useRef } from "react";
import { appearsOnSettle } from "@/mobile/lib/appear";

/**
 * The class that fades content in when it replaces its own skeleton, or
 * undefined when it must not.
 *
 * Returns `.m-appear` — motion.css's existing "content replacing its own
 * skeleton" animation, used unchanged. The class is applied to the container
 * that was already there rather than to a new wrapper, which is enough: adding
 * an `animation-name` to an element that had none starts the animation, so the
 * fade runs on the same commit that swaps the content in.
 *
 * Deliberately sticky. Once a screen has faded, the class stays, so the
 * animation does not replay when an unrelated re-render happens. A screen
 * unmounts on a route change, so returning to it starts this over — which is
 * correct in both directions: cold cache fades, warm cache does not.
 *
 * The ref write during render is idempotent (it only ever sets true), so
 * StrictMode's double render cannot change the outcome.
 */
export function useAppearOnSettle(loading: boolean): string | undefined {
  const everLoaded = useRef(false);
  if (loading) everLoaded.current = true;
  return appearsOnSettle(everLoaded.current, loading) ? "m-appear" : undefined;
}
