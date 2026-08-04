import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";

/** Long enough to read as a count, short enough not to delay the number. */
const DURATION_MS = 800;

/** Decelerating, so it lands on the real figure rather than snapping to it. */
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * Figures that have already counted once this session, by `once` key. Screens
 * remount on every navigation, so without this a tab switch back to the
 * Command Center would replay the whole ramp — charming the first time,
 * tiresome by the fourth.
 */
const played = new Set<string>();

/**
 * A headline figure counting up to its value the first time it appears.
 *
 * Plain requestAnimationFrame rather than a spring library: this is a scalar
 * ramp with no gesture behind it, and the mobile chunk should not carry an
 * animation runtime for one number.
 *
 * The shell sets tabular-nums, so the digits do not jitter as they change.
 * The formatted width still grows — $0 to $1.4M is three characters wider —
 * which is why this belongs on left-aligned headline figures and not inside
 * a row that other content has to sit beside.
 *
 * Re-runs only when the value itself changes, so a refetch that returns the
 * same number does not replay it.
 */
export function CountUp({
  value,
  format,
  className,
  once,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
  /** Ramp only the first time this key is seen. Omit to ramp on every mount. */
  once?: string;
}) {
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [shown, setShown] = useState(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduce || !Number.isFinite(value) || (once != null && played.has(once))) {
      setShown(value);
      return;
    }
    if (once != null) played.add(once);

    const from = 0;
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
  }, [value, reduce, once]);

  return <span className={className}>{format(shown)}</span>;
}
