import { describe, expect, it } from "vitest";
import {
  detentFor,
  fractionAt,
  HAPTIC_MIN_INTERVAL_MS,
  indexAt,
  indexForKey,
  shouldHaptic,
} from "./scrub-model";

describe("indexAt", () => {
  it("rounds to the nearest index so every item owns equal territory", () => {
    // Flooring would give the last item a half-width target, which makes the
    // end of any chart feel unreachable under a thumb.
    expect(indexAt(0, 5)).toBe(0);
    expect(indexAt(1, 5)).toBe(4);
    expect(indexAt(0.5, 5)).toBe(2);
    expect(indexAt(0.9, 5)).toBe(4);
  });

  it("clamps a finger dragged off either end", () => {
    expect(indexAt(-3, 5)).toBe(0);
    expect(indexAt(9, 5)).toBe(4);
  });

  it("survives an empty or single-point series", () => {
    expect(indexAt(0.5, 0)).toBe(0);
    expect(indexAt(0.5, 1)).toBe(0);
  });
});

describe("fractionAt", () => {
  it("maps a client x onto the element's box", () => {
    const rect = { left: 20, width: 200 };
    expect(fractionAt(20, rect)).toBe(0);
    expect(fractionAt(120, rect)).toBeCloseTo(0.5, 5);
    expect(fractionAt(220, rect)).toBe(1);
  });

  it("clamps outside the box and survives a zero-width element", () => {
    // A chart measured before layout has width 0; dividing by it yields
    // Infinity, and an Infinity index blanks the readout.
    expect(fractionAt(0, { left: 20, width: 200 })).toBe(0);
    expect(fractionAt(999, { left: 20, width: 200 })).toBe(1);
    expect(fractionAt(50, { left: 0, width: 0 })).toBe(0);
  });
});

describe("detentFor", () => {
  it("places detents at the ends and evenly between", () => {
    expect(detentFor(0, 5)).toBe(0);
    expect(detentFor(4, 5)).toBe(1);
    expect(detentFor(2, 5)).toBeCloseTo(0.5, 5);
  });

  it("centres a lone detent", () => {
    expect(detentFor(0, 1)).toBe(0.5);
  });

  it("round-trips with indexAt", () => {
    // The property that makes the gesture feel snapped rather than approximate.
    for (let i = 0; i < 7; i++) expect(indexAt(detentFor(i, 7), 7)).toBe(i);
  });
});

describe("shouldHaptic", () => {
  it("stays silent while the finger is within one detent", () => {
    expect(shouldHaptic(3, 3, 0, 1000)).toBe(false);
  });

  it("fires on the first crossing of a gesture", () => {
    expect(shouldHaptic(null, 1, null, 0)).toBe(true);
  });

  it("rate-limits a fast scrub", () => {
    // Thirty bars crossed in half a second is thirty pulses, which is a buzz
    // rather than feedback.
    expect(shouldHaptic(1, 2, 1000, 1000 + HAPTIC_MIN_INTERVAL_MS - 1)).toBe(false);
    expect(shouldHaptic(1, 2, 1000, 1000 + HAPTIC_MIN_INTERVAL_MS)).toBe(true);
  });
});

describe("indexForKey", () => {
  it("steps with the arrows in both orientations", () => {
    expect(indexForKey("ArrowRight", 2, 10)).toBe(3);
    expect(indexForKey("ArrowUp", 2, 10)).toBe(3);
    expect(indexForKey("ArrowLeft", 2, 10)).toBe(1);
    expect(indexForKey("ArrowDown", 2, 10)).toBe(1);
  });

  it("jumps to the ends and by pages", () => {
    expect(indexForKey("Home", 5, 10)).toBe(0);
    expect(indexForKey("End", 5, 10)).toBe(9);
    expect(indexForKey("PageUp", 0, 100)).toBe(10);
    expect(indexForKey("PageDown", 50, 100)).toBe(40);
  });

  it("never steps outside the series", () => {
    expect(indexForKey("ArrowRight", 9, 10)).toBe(9);
    expect(indexForKey("ArrowLeft", 0, 10)).toBe(0);
    expect(indexForKey("PageUp", 99, 100)).toBe(99);
  });

  it("returns null for keys it does not own", () => {
    // So the caller knows whether to preventDefault — swallowing Tab would trap
    // keyboard focus inside a chart.
    expect(indexForKey("Tab", 1, 10)).toBeNull();
    expect(indexForKey("a", 1, 10)).toBeNull();
    expect(indexForKey("Enter", 1, 10)).toBeNull();
  });

  it("always advances by at least one page step, however short the series", () => {
    // Math.round(3/10) is 0 — a PageUp that moves nowhere reads as a dead key.
    expect(indexForKey("PageUp", 0, 3)).toBe(1);
  });
});
