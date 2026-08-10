import { describe, expect, it } from "vitest";
import { bandFor, clampScale } from "./dynamic-type";

/**
 * The DOM probe itself is untestable here (vitest runs `environment: "node"`,
 * and no headless browser can emulate the iOS text-size setting anyway — which
 * is why Dynamic Type has stayed "unverified on a device" across four phases).
 * The arithmetic around it is what actually decides what a reader sees, so it is
 * extracted and pinned.
 */

describe("clampScale", () => {
  it("returns the measured ratio against iOS's 17px default", () => {
    expect(clampScale(17)).toBe(1);
    expect(clampScale(20)).toBeCloseTo(20 / 17, 5);
  });

  it("bails to 1 when the probe reports the sentinel", () => {
    // The guard that matters most. Without it, every non-Apple browser — where
    // `font: -apple-system-body` is dropped entirely and the 1px sentinel
    // survives — measured 16/17 and quietly shrank the whole interface by 6%.
    expect(clampScale(1)).toBe(1);
    expect(clampScale(3)).toBe(1);
    expect(clampScale(Number.NaN)).toBe(1);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("clamps at both ends", () => {
    expect(clampScale(8)).toBe(0.92);
    expect(clampScale(100)).toBe(1.5);
  });
});

describe("bandFor", () => {
  it("names the three layout regimes", () => {
    expect(bandFor(1)).toBe("default");
    expect(bandFor(1.14)).toBe("default");
    expect(bandFor(1.15)).toBe("large");
    expect(bandFor(1.29)).toBe("large");
    expect(bandFor(1.3)).toBe("xlarge");
    expect(bandFor(1.5)).toBe("xlarge");
  });

  it("puts the shrink-down case in the default band", () => {
    expect(bandFor(0.92)).toBe("default");
  });

  it("reaches xlarge within the clamp, or the tab bar could never adapt", () => {
    // The band exists so the tab bar can drop its labels instead of the whole
    // app capping its growth. If the ceiling ever fell below the xlarge
    // threshold again, that rule would become unreachable and the adaptation
    // would silently stop being possible.
    expect(bandFor(clampScale(1000))).toBe("xlarge");
  });
});
