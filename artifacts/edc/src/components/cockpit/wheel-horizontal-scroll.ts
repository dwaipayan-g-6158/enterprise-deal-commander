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
