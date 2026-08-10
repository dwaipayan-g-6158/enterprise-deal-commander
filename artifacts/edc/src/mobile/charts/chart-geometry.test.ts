import { describe, expect, it } from "vitest";
import {
  areaPath,
  bandPath,
  barRects,
  funnelGeometry,
  linePath,
  polygonPoints,
  radarPoints,
  ringSegments,
  scaleFor,
  seriesPoints,
  VIEW_H,
  VIEW_W,
  xFor,
  yFor,
} from "./chart-geometry";

/**
 * Charts are the part of a UI where a bug looks like data. A mis-scaled bar does
 * not throw, does not warn, and does not look broken — it looks like a deal is
 * doing better than it is. So the shapes are checked as numbers here rather than
 * being left to a screenshot.
 */

describe("scaleFor", () => {
  it("pads a normal series so the extremes are not on the frame edge", () => {
    const s = scaleFor([10, 20, 30]);
    expect(s.min).toBeLessThan(10);
    expect(s.max).toBeGreaterThan(30);
  });

  it("keeps a zero floor when asked, for magnitude charts", () => {
    // A bar chart that does not start at zero exaggerates every difference,
    // which is the single most common way a chart lies.
    expect(scaleFor([10, 20, 30], { zeroBased: true }).min).toBe(0);
  });

  it("does not force zero by default", () => {
    // A score that only ever moves between 61 and 68 would otherwise be a flat
    // line pinned to the top of the frame, hiding the only thing worth seeing.
    expect(scaleFor([61, 68]).min).toBeGreaterThan(0);
  });

  it("gives a flat series a band to sit in rather than dividing by zero", () => {
    const s = scaleFor([42, 42, 42]);
    expect(s.max).toBeGreaterThan(s.min);
    expect(Number.isFinite(yFor(42, s))).toBe(true);
  });

  it("survives an all-zero and an empty series", () => {
    expect(scaleFor([]).max).toBeGreaterThan(scaleFor([]).min);
    const zeros = scaleFor([0, 0]);
    expect(zeros.max).toBeGreaterThan(zeros.min);
  });

  it("ignores non-finite values instead of poisoning the range", () => {
    // One null from the API turning every coordinate into NaN would blank the
    // whole chart, which reads as "no data" rather than as a bug.
    const s = scaleFor([10, Number.NaN, 30, Number.POSITIVE_INFINITY]);
    expect(Number.isFinite(s.min)).toBe(true);
    expect(Number.isFinite(s.max)).toBe(true);
  });
});

describe("yFor / xFor", () => {
  it("puts larger values higher on the screen", () => {
    const s = { min: 0, max: 100 };
    expect(yFor(100, s)).toBeLessThan(yFor(0, s));
    expect(yFor(0, s)).toBe(VIEW_H);
    expect(yFor(100, s)).toBe(0);
  });

  it("spans the full width and centres a single point", () => {
    expect(xFor(0, 5)).toBe(0);
    expect(xFor(4, 5)).toBe(VIEW_W);
    expect(xFor(0, 1)).toBe(VIEW_W / 2);
  });
});

describe("linePath / areaPath", () => {
  const points = seriesPoints([0, 50, 100], { min: 0, max: 100 });

  it("moves once and then draws", () => {
    const d = linePath(points);
    expect(d.startsWith("M")).toBe(true);
    expect(d.match(/M/g)).toHaveLength(1);
    expect(d.match(/L/g)).toHaveLength(2);
  });

  it("closes the area down to the baseline", () => {
    const d = areaPath(points);
    expect(d.endsWith("Z")).toBe(true);
    expect(d).toContain(`${VIEW_H}`);
  });

  it("returns an empty string for no points rather than a broken path", () => {
    // "M" alone or "MNaN NaN" would render as a console error per frame.
    expect(linePath([])).toBe("");
    expect(areaPath([])).toBe("");
  });
});

describe("bandPath", () => {
  it("goes out along the ceiling and back along the floor", () => {
    const scale = { min: 0, max: 100 };
    const lo = seriesPoints([10, 10, 10], scale);
    const hi = seriesPoints([90, 90, 90], scale);
    const d = bandPath(lo, hi);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    // One M, then out (2) and back (3) — the reversed floor includes its first
    // point, which is what closes the shape without a gap.
    expect(d.match(/L/g)).toHaveLength(5);
  });
});

describe("barRects", () => {
  const scale = { min: 0, max: 100 };

  it("lays bars out edge to edge across the width", () => {
    const bars = barRects([50, 50], scale);
    expect(bars).toHaveLength(2);
    expect(bars[0].cx).toBeCloseTo(VIEW_W / 4, 5);
    expect(bars[1].cx).toBeCloseTo((VIEW_W * 3) / 4, 5);
  });

  it("scales height with value and sits on the baseline", () => {
    const bars = barRects([100, 25], scale);
    expect(bars[0].height).toBeGreaterThan(bars[1].height);
    expect(bars[0].y + bars[0].height).toBeCloseTo(VIEW_H, 5);
  });

  it("gives a real zero a visible hairline", () => {
    // Otherwise an empty stage renders as nothing at all, which reads as missing
    // data rather than as a genuine zero.
    expect(barRects([0, 40], scale)[0].height).toBeGreaterThan(0);
  });

  it("keeps gaps proportional so bars survive a narrow phone", () => {
    const two = barRects([1, 1], scale);
    const twenty = barRects(Array(20).fill(1), scale);
    const ratio = (b: { width: number }[], n: number) => b[0].width / (VIEW_W / n);
    expect(ratio(two, 2)).toBeCloseTo(ratio(twenty, 20), 5);
  });

  it("returns nothing for an empty series", () => {
    expect(barRects([], scale)).toEqual([]);
  });
});

describe("ringSegments", () => {
  const C = 100;

  it("splits the circumference in proportion", () => {
    const segs = ringSegments([1, 1, 2], C);
    expect(segs.map((s) => s.value)).toEqual([0.25, 0.25, 0.5]);
    expect(segs[0].dashArray).toBe("25 75");
  });

  it("stacks each segment after the previous one", () => {
    const segs = ringSegments([1, 1], C);
    expect(segs[0].dashOffset).toBe(-0);
    expect(segs[1].dashOffset).toBe(-50);
  });

  it("survives an all-zero series without dividing by zero", () => {
    // A donut of "no deals yet" is a real state, and NaN in a dasharray blanks
    // the element silently.
    const segs = ringSegments([0, 0], C);
    expect(segs.every((s) => s.value === 0)).toBe(true);
    expect(segs[0].dashArray).not.toContain("NaN");
  });

  it("ignores negative values rather than drawing backwards", () => {
    const segs = ringSegments([-5, 5], C);
    expect(segs[0].value).toBe(0);
    expect(segs[1].value).toBe(1);
  });
});

describe("funnelGeometry", () => {
  it("measures widths against the widest step, not the first", () => {
    // A funnel that grows in the middle — a recycled or re-entered stage — would
    // otherwise produce a width over 1 and clip outside the track.
    const steps = funnelGeometry([
      { label: "A", value: 10 },
      { label: "B", value: 25 },
      { label: "C", value: 5 },
    ]);
    expect(Math.max(...steps.map((s) => s.widthPct))).toBe(1);
    expect(steps.every((s) => s.widthPct <= 1)).toBe(true);
  });

  it("reports the drop into each step, and none for the first", () => {
    const steps = funnelGeometry([
      { label: "A", value: 100 },
      { label: "B", value: 60 },
    ]);
    expect(steps[0].dropPct).toBeNull();
    expect(steps[1].dropPct).toBeCloseTo(0.4, 5);
  });

  it("reports survival against the first step", () => {
    const steps = funnelGeometry([
      { label: "A", value: 200 },
      { label: "B", value: 50 },
    ]);
    expect(steps[1].ofFirst).toBeCloseTo(0.25, 5);
  });

  it("handles an empty funnel and a zero-valued first step", () => {
    expect(funnelGeometry([])).toEqual([]);
    const steps = funnelGeometry([
      { label: "A", value: 0 },
      { label: "B", value: 0 },
    ]);
    expect(steps[0].widthPct).toBe(0);
    expect(steps[1].ofFirst).toBe(0);
    expect(steps[1].dropPct).toBe(0);
  });
});

describe("radarPoints", () => {
  it("starts at twelve o'clock", () => {
    const [first] = radarPoints([100], { min: 0, max: 100 }, 10);
    expect(first.x).toBeCloseTo(0, 5);
    expect(first.y).toBeCloseTo(-10, 5);
  });

  it("clamps a value outside the scale to the outer ring", () => {
    const [p] = radarPoints([500], { min: 0, max: 100 }, 10);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(10, 5);
  });

  it("formats points for a polygon", () => {
    expect(polygonPoints([{ x: 1, y: 2 }, { x: 3.14159, y: 4 }])).toBe("1,2 3.14,4");
  });
});
