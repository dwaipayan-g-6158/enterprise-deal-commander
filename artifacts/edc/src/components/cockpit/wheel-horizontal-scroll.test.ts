import { describe, it, expect } from "vitest";
import { shouldConvertWheelToHorizontalScroll } from "./wheel-horizontal-scroll";

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
