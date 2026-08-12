import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { haptic } from "@/mobile/lib/haptics";
import { useShellScrollRef } from "@/mobile/shell/m-shell";
import { isArmed, pullDistance, pullProgress, TRIGGER_PX } from "@/mobile/ui/pull-physics";

/** One beat of "that worked" before the content settles back. */
const CONFIRM_MS = 340;

/**
 * Pull down at the top of a list to refetch.
 *
 * An installed PWA has no browser chrome and therefore no native
 * pull-to-refresh, but the gesture is the one every phone user already
 * reaches for. useAppResumeRefetch covers coming back to the app; this covers
 * "I'm looking at it right now and want the current number."
 *
 * Listeners are attached natively rather than through React props because
 * touchmove has to be non-passive: React registers its touch handlers as
 * passive, where preventDefault is ignored, and without it iOS rubber-bands
 * the scroll container underneath the gesture.
 *
 * ## Docked bars stay still, via `dock`
 *
 * Only this component's own children are transformed, so anything rendered
 * beside it — the search docks on Deals and Memory — holds position while the
 * list moves under the finger. That is the intended behaviour: the dock is the
 * one control on screen the user may be reaching for, and a target that moves
 * during the gesture is worse than one that sits out of it.
 *
 * `dock` therefore exists for POSITION, not for motion: it renders the bar
 * outside the transformed element, because a transformed ancestor would become
 * the containing block for a `position: fixed` descendant and demote the dock
 * from viewport-pinned to a box that scrolls away with the list.
 *
 * It briefly took a damped copy of the transform instead. See pull-physics.ts
 * for why that was tried, why it was reverted, and the measurements behind both
 * — the short version is that Deals has no scroll range, so every drag there is
 * a pull, and a bar that moves on every drag reads as unstable.
 */
export function PullToRefresh({
  onRefresh,
  children,
  dock,
}: {
  onRefresh: () => Promise<unknown> | unknown;
  children: ReactNode;
  /**
   * Bottom furniture that holds position while the list pulls — the search bars
   * on Deals and Memory.
   *
   * Rendered as a SIBLING of the transformed content, never inside it, which is
   * the whole reason this prop exists rather than the screens just placing the
   * bar themselves: a transformed ancestor becomes the containing block for a
   * `position: fixed` descendant, which would demote the dock from
   * viewport-pinned to a box that scrolls away with the list.
   */
  dock?: ReactNode;
}) {
  const scrollRef = useShellScrollRef();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  /** Held between the refetch resolving and the content springing back. */
  const [confirming, setConfirming] = useState(false);

  // Mirrors of the reactive state, so the native listeners can stay attached
  // for the life of the component instead of re-binding on every frame of the
  // drag.
  const pullRef = useRef(0);
  const startYRef = useRef<number | null>(null);
  const refreshingRef = useRef(false);
  /** Whether the arm-threshold haptic has already fired for this gesture. */
  const armedRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const reset = () => {
      startYRef.current = null;
      armedRef.current = false;
      pullRef.current = 0;
      setPull(0);
    };

    const onTouchStart = (e: TouchEvent) => {
      // Only own the gesture when there is nothing above to scroll to.
      if (el.scrollTop > 0 || refreshingRef.current || e.touches.length !== 1) {
        startYRef.current = null;
        return;
      }
      startYRef.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current == null) return;
      const travelled = e.touches[0].clientY - startYRef.current;
      // Upward travel is an ordinary scroll — hand it back to the browser.
      if (travelled <= 0) {
        reset();
        return;
      }
      e.preventDefault();
      const next = pullDistance(travelled);
      pullRef.current = next;
      setPull(next);

      // Fired when the gesture ARMS, not when it is released. That is the
      // moment the outcome is decided, and it is what lets someone commit or
      // back off without watching the indicator. Latched, so a finger resting
      // near the threshold cannot buzz repeatedly.
      const armed = isArmed(next);
      if (armed && !armedRef.current) haptic();
      armedRef.current = armed;
    };

    const onTouchEnd = () => {
      if (startYRef.current == null) return;
      startYRef.current = null;

      if (!isArmed(pullRef.current)) {
        armedRef.current = false;
        pullRef.current = 0;
        setPull(0);
        return;
      }

      // Hold the indicator at the trigger point for the duration of the
      // refetch, so a fast response still reads as "something happened."
      armedRef.current = false;
      refreshingRef.current = true;
      setRefreshing(true);
      setPull(TRIGGER_PX);
      void Promise.resolve(onRefreshRef.current()).finally(() => {
        // The ring completes and pulses before the content springs back —
        // without the beat, a fast refetch reads as the gesture having been
        // ignored.
        setRefreshing(false);
        setConfirming(true);
        setTimeout(() => {
          refreshingRef.current = false;
          setConfirming(false);
          pullRef.current = 0;
          setPull(0);
        }, CONFIRM_MS);
      });
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [scrollRef]);

  const progress = pullProgress(pull);

  // Untransitioned while the finger is down so the content tracks it exactly.
  // On release it springs: a plain ease lands flat, and the slight overshoot is
  // what makes the gesture feel elastic rather than mechanical.
  //
  // Shared with the dock deliberately — two different transitions would let the
  // bar and the list settle at different moments, which reads worse than the
  // frozen dock this replaced.
  const transition =
    pull === 0 || refreshing || confirming ? "transform 320ms var(--m-ease-spring)" : "none";

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex justify-center"
        style={{ height: pull, opacity: progress }}
        aria-hidden={!refreshing}
      >
        <RefreshRing progress={progress} spinning={refreshing} confirming={confirming} />
      </div>
      {/* `none` at rest, not translateY(0px). A transform — even an identity
          one — makes this div a containing block AND a stacking context for
          everything inside it, which quietly capped any sticky descendant's
          z-index at this element's own. The Deals group header is sticky and
          lives in here: at z-20 it could never rise above the z-30 nav bar no
          matter what offset it was given, so fixing the offset alone would not
          have been enough. Only during an actual pull is the transform real,
          and the dock stays outside it regardless (see below). */}
      <div
        style={{ transform: pull === 0 ? "none" : `translateY(${pull}px)`, transition }}
      >
        {children}
      </div>
      {/* Outside the transformed element on purpose: the dock is `fixed`, and a
          transformed ancestor would capture it as its containing block. Still
          true during a pull, which is the only time the transform is real.

          No transform of its own, so it stays exactly where it is for the whole
          gesture — see this component's docblock and pull-physics.ts. */}
      {dock}
      <span role="status" className="sr-only">
        {refreshing ? "Refreshing" : ""}
      </span>
    </div>
  );
}

/**
 * Draws its stroke as you pull, spins while the refetch is in flight, then
 * closes to a full ring and pulses once on success.
 */
function RefreshRing({
  progress,
  spinning,
  confirming,
}: {
  progress: number;
  spinning: boolean;
  confirming: boolean;
}) {
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const arc = confirming ? 1 : spinning ? 0.25 : progress;
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      className={cn("mt-5", spinning && "animate-spin", confirming && "m-ptr-pulse")}
      style={{ transform: spinning ? undefined : `rotate(${progress * 360 - 90}deg)` }}
    >
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke="hsl(var(--border))"
        strokeWidth="2.5"
      />
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - arc)}
        transform="rotate(-90 12 12)"
      />
    </svg>
  );
}
