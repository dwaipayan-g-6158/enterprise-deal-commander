import { describe, expect, it } from "vitest";
import { isArmed, MAX_PULL_PX, pullDistance, pullProgress, TRIGGER_PX } from "./pull-physics";

describe("pullDistance", () => {
  it("tracks the finger exactly at the start of the gesture", () => {
    // The derivative at the origin is 1. A rubber band that begins by lagging
    // reads as dropped input rather than as resistance.
    expect(pullDistance(1)).toBeCloseTo(0.996, 2);
    expect(pullDistance(4) / 4).toBeGreaterThan(0.96);
  });

  it("gets progressively harder", () => {
    const firstTwenty = pullDistance(20) - pullDistance(0);
    const secondTwenty = pullDistance(40) - pullDistance(20);
    const thirdTwenty = pullDistance(60) - pullDistance(40);
    expect(secondTwenty).toBeLessThan(firstTwenty);
    expect(thirdTwenty).toBeLessThan(secondTwenty);
  });

  it("approaches the asymptote without reaching it, however far the finger goes", () => {
    // This is the whole difference from the previous linear-with-a-cap curve.
    // A cap has a hard edge: resistance is constant and then the content simply
    // stops dead against a wall. Nothing physical behaves that way.
    expect(pullDistance(400)).toBeLessThan(MAX_PULL_PX);
    expect(pullDistance(4000)).toBeLessThan(MAX_PULL_PX);
    expect(pullDistance(400)).toBeGreaterThan(MAX_PULL_PX * 0.95);
    // Strictly increasing even far past the trigger, so the surface never
    // feels detached from the finger.
    expect(pullDistance(4000)).toBeGreaterThan(pullDistance(400));
  });

  it("is inert against an upward drag", () => {
    expect(pullDistance(0)).toBe(0);
    expect(pullDistance(-50)).toBe(0);
  });

  it("keeps the trigger comfortably reachable", () => {
    // If the asymptote sat below the trigger the gesture could never arm — a
    // failure that is invisible in code and total on a device.
    expect(TRIGGER_PX).toBeLessThan(MAX_PULL_PX);
    expect(isArmed(pullDistance(120))).toBe(true);
    // And roughly a thumb's length of travel should do it.
    expect(isArmed(pullDistance(110))).toBe(true);
  });
});

describe("pullProgress", () => {
  it("reports the fraction of the arming gesture, clamped", () => {
    expect(pullProgress(0)).toBe(0);
    expect(pullProgress(TRIGGER_PX / 2)).toBeCloseTo(0.5, 5);
    expect(pullProgress(TRIGGER_PX)).toBe(1);
    expect(pullProgress(TRIGGER_PX * 3)).toBe(1);
  });
});
