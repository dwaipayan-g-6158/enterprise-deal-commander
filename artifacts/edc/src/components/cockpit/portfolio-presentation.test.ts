import { describe, it, expect } from "vitest";
import {
  liftPresentation,
  riskBand,
  diversificationBand,
  attachBand,
  splitCorrelations,
  MAX_CORRELATION_BADGES,
} from "./portfolio-presentation";
import { RISK_LEVEL_CLASS } from "../../lib/semantic-colors";

describe("liftPresentation", () => {
  it("renders an under-represented ratio with no sign — the literal historical bug", () => {
    const result = liftPresentation(0.5);
    expect(result.text).toBe("0.5×");
    expect(result.direction).toBe("below");
    // The bug: `lift > 0 ? '+' : ''` printed "+0.5x" for a ratio below baseline.
    expect(result.text).not.toContain("+");
  });

  it("classifies exactly 1 as 'at' baseline", () => {
    const result = liftPresentation(1);
    expect(result.direction).toBe("at");
    expect(result.text).toBe("1×");
  });

  it("classifies > 1 as 'above' baseline", () => {
    const result = liftPresentation(1.8);
    expect(result.direction).toBe("above");
    expect(result.text).toBe("1.8×");
  });

  it("trims trailing zeros via formatNum (2 -> '2×', not '2.00×')", () => {
    expect(liftPresentation(2).text).toBe("2×");
  });

  it("classifies on the ROUNDED displayed value, not the raw value (1.004 -> '1×' AND 'at')", () => {
    const result = liftPresentation(1.004);
    expect(result.text).toBe("1×");
    expect(result.direction).toBe("at");
  });

  it("classifies on the ROUNDED displayed value, not the raw value (0.996 -> '1×' AND 'at')", () => {
    const result = liftPresentation(0.996);
    expect(result.text).toBe("1×");
    expect(result.direction).toBe("at");
  });

  it("classifies 0 as 'below'", () => {
    expect(liftPresentation(0).direction).toBe("below");
  });

  it.each([NaN, -3, undefined, "x" as never])(
    "coerces invalid input %p to a safe 0× below-baseline result, never throws",
    (input) => {
      const result = liftPresentation(input);
      expect(result.text).toBe("0×");
      expect(result.direction).toBe("below");
    },
  );

  it("every label mentions 'baseline', and the 'at' wording differs from above/below", () => {
    const at = liftPresentation(1);
    const above = liftPresentation(1.8);
    const below = liftPresentation(0.5);
    expect(at.label).toMatch(/baseline/);
    expect(above.label).toMatch(/baseline/);
    expect(below.label).toMatch(/baseline/);
    expect(at.label).not.toBe(above.label);
    expect(at.label).not.toBe(below.label);
  });

  it.each([0.5, 1, 1.8])(
    "pins the × (U+00D7) glyph for %p — never lets it drift back to ASCII x",
    (input) => {
      expect(liftPresentation(input).text.endsWith("×")).toBe(true);
    },
  );
});

describe("riskBand", () => {
  it.each([
    [0, "LOW"],
    [25, "LOW"],
    [26, "MODERATE"],
    [50, "MODERATE"],
    [51, "ELEVATED"],
    [75, "ELEVATED"],
    [76, "HIGH"],
    [100, "HIGH"],
  ] as const)("score %d maps to the %s cell class from the real RISK_LEVEL_CLASS constant", (score, level) => {
    expect(riskBand(score).cell).toBe(RISK_LEVEL_CLASS[level].cell);
  });

  it("labels the extremes", () => {
    expect(riskBand(0).label).toBe("Low");
    expect(riskBand(100).label).toBe("High");
  });

  it("legend-sync guard: cell classes match the hand-written HeatLegend color tokens at each boundary", () => {
    expect(riskBand(25).cell).toMatch(/sky-/);
    expect(riskBand(50).cell).toMatch(/amber-/);
    expect(riskBand(75).cell).toMatch(/orange-/);
    expect(riskBand(100).cell).toMatch(/red-/);
  });
});

describe("diversificationBand", () => {
  it.each([
    [1, "emerald"],
    [0.85, "emerald"],
    [0.8499, "amber"],
    [0.6, "amber"],
    [0.5999, "rose"],
    [0, "rose"],
  ] as const)("diversificationBand(%p) matches /%s/", (input, color) => {
    expect(diversificationBand(input)).toMatch(new RegExp(color));
  });

  it("the regression this re-threshold exists for: a perfectly-even 2-cell portfolio (D=1) is emerald", () => {
    // Under the OLD thresholds (0.66/0.4), tuned against the un-normalized raw
    // HHI, a 2-cell portfolio's ceiling was 0.5 — it could never reach green
    // at all. The new normalized formula lets an evenly-spread 2-cell
    // portfolio reach exactly 1.0, so it must read emerald.
    expect(diversificationBand(1)).toMatch(/emerald/);
  });

  it("non-finite input coerces to rose, never green", () => {
    // The normalized formula divides by (n-1), which is degenerate for a
    // 1-cell portfolio if the server doesn't special-case it; Infinity >= 0.85
    // would otherwise paint the single most concentrated portfolio possible
    // green, which is backwards for a metric whose job is flagging
    // concentration.
    expect(diversificationBand(NaN)).toMatch(/rose/);
    expect(diversificationBand(Infinity)).toMatch(/rose/);
  });

  it("all three return values are distinct, non-empty strings", () => {
    const values = [diversificationBand(1), diversificationBand(0.7), diversificationBand(0)];
    for (const v of values) expect(v.length).toBeGreaterThan(0);
    expect(new Set(values).size).toBe(3);
  });
});

describe("attachBand", () => {
  it.each([
    [1, "emerald"],
    [0.6, "emerald"],
    [0.59, "amber"],
    [0.3, "amber"],
    [0.29, "orange"],
    [0.001, "orange"],
    [0, "rose"],
  ] as const)("attachBand(%p) matches /%s/", (input, color) => {
    expect(attachBand(input)).toMatch(new RegExp(color));
  });

  it("the 0 vs any-positive boundary is strict (>) unlike the two >= checks above it", () => {
    expect(attachBand(0)).toMatch(/rose/);
    expect(attachBand(0.001)).toMatch(/orange/);
  });

  it("every return value carries a border-, bg-, and hover:bg- token", () => {
    for (const pct of [0, 0.1, 0.4, 0.8]) {
      const cls = attachBand(pct);
      expect(cls).toContain("border-");
      expect(cls).toContain("bg-");
      expect(cls).toContain("hover:bg-");
    }
  });
});

describe("splitCorrelations", () => {
  it("undefined input returns all-empty result", () => {
    expect(splitCorrelations(undefined)).toEqual({ shown: [], hiddenCount: 0, hiddenCodes: [] });
  });

  it("exactly MAX_CORRELATION_BADGES items shows no overflow badge (off-by-one boundary)", () => {
    const list = [{ code: "A" }, { code: "B" }, { code: "C" }];
    expect(list.length).toBe(MAX_CORRELATION_BADGES);
    const result = splitCorrelations(list);
    expect(result.shown).toHaveLength(3);
    expect(result.hiddenCount).toBe(0);
    expect(result.hiddenCodes).toEqual([]);
  });

  it("7 items: shows 3, hides 4 in original order", () => {
    const list = [
      { code: "A" }, { code: "B" }, { code: "C" }, { code: "D" },
      { code: "E" }, { code: "F" }, { code: "G" },
    ];
    const result = splitCorrelations(list);
    expect(result.shown).toHaveLength(3);
    expect(result.hiddenCount).toBe(4);
    expect(result.hiddenCodes).toEqual(["D", "E", "F", "G"]);
  });

  it("honors an explicit max override over the default", () => {
    const list = [
      { code: "A" }, { code: "B" }, { code: "C" }, { code: "D" },
      { code: "E" }, { code: "F" }, { code: "G" },
    ];
    const result = splitCorrelations(list, 5);
    expect(result.shown).toHaveLength(5);
    expect(result.hiddenCount).toBe(2);
    expect(result.hiddenCodes).toEqual(["F", "G"]);
  });

  it("max: 0 hides everything", () => {
    const list = [{ code: "A" }, { code: "B" }];
    const result = splitCorrelations(list, 0);
    expect(result.shown).toEqual([]);
    expect(result.hiddenCount).toBe(2);
    expect(result.hiddenCodes).toEqual(["A", "B"]);
  });

  it("does not mutate its input array", () => {
    const list = [{ code: "A" }, { code: "B" }, { code: "C" }, { code: "D" }];
    const originalLength = list.length;
    splitCorrelations(list, 2);
    expect(list.length).toBe(originalLength);
    expect(list).toEqual([{ code: "A" }, { code: "B" }, { code: "C" }, { code: "D" }]);
  });
});
