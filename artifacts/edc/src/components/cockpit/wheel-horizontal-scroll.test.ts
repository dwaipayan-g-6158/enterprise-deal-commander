import { describe, it, expect } from "vitest";
import {
  shouldConvertWheelToHorizontalScroll,
  lerpScrollPosition,
  clampScrollTarget,
} from "./wheel-horizontal-scroll";

const overflowing = { scrollWidth: 2000, clientWidth: 800 };
const notOverflowing = { scrollWidth: 800, clientWidth: 800 };

describe("shouldConvertWheelToHorizontalScroll", () => {
  it("converts a plain vertical wheel tick when the strip overflows", () => {
    const result = shouldConvertWheelToHorizontalScroll(
      { deltaX: 0, deltaY: 100, ctrlKey: false },
      overflowing,
    );
    expect(result).toBe(true);
  });

  it("declines when the strip has no horizontal overflow", () => {
    const result = shouldConvertWheelToHorizontalScroll(
      { deltaX: 0, deltaY: 100, ctrlKey: false },
      notOverflowing,
    );
    expect(result).toBe(false);
  });

  it("declines a pinch-zoom gesture even when the strip overflows", () => {
    const result = shouldConvertWheelToHorizontalScroll(
      { deltaX: 0, deltaY: 100, ctrlKey: true },
      overflowing,
    );
    expect(result).toBe(false);
  });

  it("declines when the horizontal delta already dominates (trackpad swipe / Shift+wheel)", () => {
    const result = shouldConvertWheelToHorizontalScroll(
      { deltaX: 50, deltaY: 5, ctrlKey: false },
      overflowing,
    );
    expect(result).toBe(false);
  });

  it("converts when the vertical and horizontal deltas are equal", () => {
    const result = shouldConvertWheelToHorizontalScroll(
      { deltaX: 30, deltaY: 30, ctrlKey: false },
      overflowing,
    );
    expect(result).toBe(true);
  });
});

describe("lerpScrollPosition", () => {
  it("moves partway toward target by factor", () => {
    expect(lerpScrollPosition(0, 100, 0.2)).toBeCloseTo(20);
  });

  it("returns current unchanged when target equals current", () => {
    expect(lerpScrollPosition(50, 50, 0.2)).toBe(50);
  });

  it("moves partway toward a target below current (negative direction)", () => {
    expect(lerpScrollPosition(100, 0, 0.2)).toBeCloseTo(80);
  });
});

describe("clampScrollTarget", () => {
  it("clamps a target above max down to max", () => {
    expect(clampScrollTarget(500, 300)).toBe(300);
  });

  it("clamps a negative target up to 0", () => {
    expect(clampScrollTarget(-50, 300)).toBe(0);
  });

  it("passes an in-range target through unchanged", () => {
    expect(clampScrollTarget(150, 300)).toBe(150);
  });
});
