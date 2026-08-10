import { useCallback, useRef, useState } from "react";
import { haptic } from "@/mobile/lib/haptics";
import { fractionAt, indexAt, indexForKey, shouldHaptic } from "@/mobile/charts/scrub-model";

/**
 * Scrub-to-inspect for a chart.
 *
 * Pointer Events rather than touch: one code path covers finger, pen and mouse,
 * and `setPointerCapture` keeps the gesture alive when the finger leaves the
 * element — which it will, because a chart is 160px tall and a thumb moving
 * horizontally does not stay inside it.
 *
 * The pure half lives in scrub-model.ts. This is the plumbing.
 */
export function useScrub(count: number) {
  const [index, setIndex] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const lastHapticRef = useRef<number | null>(null);
  const indexRef = useRef<number | null>(null);

  const moveTo = useCallback(
    (next: number, now: number) => {
      if (shouldHaptic(indexRef.current, next, lastHapticRef.current, now)) {
        haptic();
        lastHapticRef.current = now;
      }
      indexRef.current = next;
      setIndex(next);
    },
    [],
  );

  const fromPointer = useCallback(
    (event: { clientX: number; currentTarget: Element }) => {
      const rect = event.currentTarget.getBoundingClientRect();
      moveTo(indexAt(fractionAt(event.clientX, rect), count), performance.now());
    },
    [count, moveTo],
  );

  const handlers = {
    onPointerDown: (event: React.PointerEvent<Element>) => {
      // Capture BEFORE the first read, so a fast flick that starts and leaves in
      // the same frame still belongs to this element.
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setScrubbing(true);
      fromPointer(event);
    },
    onPointerMove: (event: React.PointerEvent<Element>) => {
      if (!scrubbing) return;
      fromPointer(event);
    },
    onPointerUp: (event: React.PointerEvent<Element>) => {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      setScrubbing(false);
    },
    onPointerCancel: () => setScrubbing(false),
    onKeyDown: (event: React.KeyboardEvent<Element>) => {
      const next = indexForKey(event.key, indexRef.current ?? 0, count);
      if (next == null) return; // not ours — let Tab and the rest through
      event.preventDefault();
      moveTo(next, performance.now());
    },
    onBlur: () => setIndex(null),
    // touch-action: pan-y keeps VERTICAL scrolling working while this element
    // owns horizontal movement. `none` would trap the page under the finger,
    // and on the left edge would also fight iOS's back swipe — which is why
    // .m-edge-guard exists for anything that reaches it.
    style: { touchAction: "pan-y" as const },
  };

  return { index, scrubbing, handlers, clear: () => setIndex(null) };
}
