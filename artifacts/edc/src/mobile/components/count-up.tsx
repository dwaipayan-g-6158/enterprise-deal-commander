import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { rampFrom, rememberValue } from "@/mobile/lib/previous-values";

/** Long enough to read as a count, short enough not to delay the number. */
const DURATION_MS = 800;

/** Decelerating, so it lands on the real figure rather than snapping to it. */
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * A headline figure moving to its value — from where it was, when it has been
 * seen before, and from zero when it has not.
 *
 * That distinction is the whole point of `valueKey`. The ramp used to start at
 * a hard-coded zero, so a pipeline going from $3.1M to $3.4M counted up from
 * nothing exactly as if it had just been created: an entrance every time, and
 * an entrance carries no information about a change. Started from the previous
 * value, the ramp's LENGTH is the size of the move and its direction is the
 * sign of it. See lib/previous-values.ts.
 *
 * It also subsumes the old `once` flag. A figure that has not moved does not
 * ramp at all, so a tab switch back to the Command Center no longer replays
 * anything — which is exactly what `once` existed to prevent, without also
 * suppressing the deltas that matter.
 *
 * Plain requestAnimationFrame rather than a spring library: this is a scalar
 * ramp with no gesture behind it, and the mobile chunk should not carry an
 * animation runtime for one number.
 *
 * The shell sets tabular-nums, so the digits do not jitter as they change.
 * The formatted width still grows — $0 to $1.4M is three characters wider —
 * which is why this belongs on left-aligned headline figures and not inside
 * a row that other content has to sit beside.
 */
export function CountUp({
  value,
  format,
  className,
  valueKey,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
  /**
   * Identifies this figure across mounts, so a later sighting can animate the
   * change rather than the arrival. Omit for a figure that is only ever an
   * entrance — a per-record number on a detail screen, say.
   */
  valueKey?: string;
}) {
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [shown, setShown] = useState(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduce || !Number.isFinite(value)) {
      setShown(value);
      return;
    }

    const from = rampFrom(valueKey, value);
    // Recorded before the ramp rather than after it: a navigation away
    // mid-animation still leaves the figure's real value behind, so coming
    // back does not replay from a number that was only ever a frame.
    if (valueKey !== undefined) rememberValue(valueKey, value);

    // Unchanged since last time — show it and stay still.
    if (from === null) {
      setShown(value);
      return;
    }

    const start = performance.now();

    const step = (now: number) => {
      const t = Math.min((now - start) / DURATION_MS, 1);
      setShown(from + (value - from) * easeOut(t));
      frameRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };

    setShown(from);
    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [value, reduce, valueKey]);

  return <span className={className}>{format(shown)}</span>;
}
