// Pure decision for converting a vertical wheel gesture into horizontal
// scrolling of the deal strip. Kept free of React/DOM so it stays
// node-testable, mirroring deal-strip-model.ts.

export interface WheelGesture {
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
}

export interface ViewportSize {
  scrollWidth: number;
  clientWidth: number;
}

/**
 * True when a wheel event over the strip should be converted into a
 * horizontal scroll instead of the browser's default handling.
 *
 * Declines (returns false, letting the browser do its default thing) when:
 * - the gesture is a pinch-zoom (ctrlKey)
 * - the strip has nothing to scroll (no horizontal overflow)
 * - the gesture is already horizontal-dominant (trackpad swipe, Shift+wheel)
 */
export function shouldConvertWheelToHorizontalScroll(
  wheel: WheelGesture,
  viewport: ViewportSize,
): boolean {
  if (wheel.ctrlKey) return false;
  if (viewport.scrollWidth <= viewport.clientWidth) return false;
  return Math.abs(wheel.deltaY) >= Math.abs(wheel.deltaX);
}

/**
 * One animation frame's step of linear interpolation from current toward
 * target. `factor` is the fraction of the remaining distance to close per
 * frame (e.g. 0.2 closes 20% of the gap each frame).
 */
export function lerpScrollPosition(
  current: number,
  target: number,
  factor: number,
): number {
  return current + (target - current) * factor;
}

/** Clamp a scroll target to a viewport's valid scroll range of [0, max]. */
export function clampScrollTarget(target: number, max: number): number {
  return Math.max(0, Math.min(target, max));
}
