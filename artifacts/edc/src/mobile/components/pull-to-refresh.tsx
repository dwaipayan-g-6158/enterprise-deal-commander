import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { haptic } from "@/mobile/lib/haptics";
import { useShellScrollRef } from "@/mobile/shell/mobile-shell";

/** Pull distance, after resistance, that arms the refresh. */
const TRIGGER_PX = 64;
/** Half the finger's travel, so the gesture feels weighted rather than loose. */
const RESISTANCE = 0.5;
/** Hard stop, so a long drag doesn't tear the content off the screen. */
const MAX_PULL_PX = 96;
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
 */
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<unknown> | unknown;
  children: ReactNode;
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
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const reset = () => {
      startYRef.current = null;
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
      const next = Math.min(travelled * RESISTANCE, MAX_PULL_PX);
      pullRef.current = next;
      setPull(next);
    };

    const onTouchEnd = () => {
      if (startYRef.current == null) return;
      startYRef.current = null;

      if (pullRef.current < TRIGGER_PX) {
        pullRef.current = 0;
        setPull(0);
        return;
      }

      // Hold the indicator at the trigger point for the duration of the
      // refetch, so a fast response still reads as "something happened."
      refreshingRef.current = true;
      haptic();
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

  const progress = Math.min(pull / TRIGGER_PX, 1);

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex justify-center"
        style={{ height: pull, opacity: progress }}
        aria-hidden={!refreshing}
      >
        <RefreshRing progress={progress} spinning={refreshing} confirming={confirming} />
      </div>
      <div
        style={{
          transform: `translateY(${pull}px)`,
          // Untransitioned while the finger is down so the content tracks it
          // exactly. On release it springs: a plain ease lands flat, and the
          // slight overshoot is what makes the gesture feel elastic rather
          // than mechanical.
          transition:
            pull === 0 || refreshing || confirming
              ? "transform 320ms var(--m-ease-spring)"
              : "none",
        }}
      >
        {children}
      </div>
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
        stroke="var(--m-keyline)"
        strokeWidth="2.5"
      />
      <circle
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        stroke="var(--m-primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - arc)}
        transform="rotate(-90 12 12)"
      />
    </svg>
  );
}
