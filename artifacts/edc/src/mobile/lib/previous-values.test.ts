import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetPreviousValues,
  previousValue,
  rampFrom,
  rememberValue,
} from "./previous-values";

beforeEach(_resetPreviousValues);

describe("rememberValue / previousValue", () => {
  it("recalls what a key last showed", () => {
    rememberValue("pipeline", 3_100_000);
    expect(previousValue("pipeline")).toBe(3_100_000);
  });

  it("distinguishes an unseen key from one that showed zero", () => {
    // null vs 0 is the whole distinction rampFrom rests on: a figure that has
    // genuinely been zero should animate from zero to its new value, not be
    // treated as never seen.
    expect(previousValue("unseen")).toBeNull();
    rememberValue("empty", 0);
    expect(previousValue("empty")).toBe(0);
  });

  it("refuses to store a non-finite value", () => {
    // NaN never compares equal to itself, so storing one would make rampFrom
    // report a change on every render for the rest of the session.
    rememberValue("broken", Number.NaN);
    rememberValue("infinite", Number.POSITIVE_INFINITY);
    expect(previousValue("broken")).toBeNull();
    expect(previousValue("infinite")).toBeNull();
  });
});

describe("rampFrom", () => {
  it("ramps from zero the first time a figure appears", () => {
    expect(rampFrom("pipeline", 3_100_000)).toBe(0);
  });

  it("ramps from zero when there is no key to remember it by", () => {
    // The un-keyed path is a plain entrance, which is what a per-record figure
    // on a detail screen wants.
    expect(rampFrom(undefined, 42)).toBe(0);
  });

  it("does not ramp when the figure has not moved", () => {
    // Screens remount on every navigation. Replaying the entrance each time is
    // charming once and tiresome by the fourth tab switch.
    rememberValue("pipeline", 3_100_000);
    expect(rampFrom("pipeline", 3_100_000)).toBeNull();
  });

  it("ramps from where the figure was when it has moved", () => {
    rememberValue("pipeline", 3_100_000);
    expect(rampFrom("pipeline", 3_400_000)).toBe(3_100_000);
  });

  it("ramps downward from the old value when the figure fell", () => {
    // The direction of the ramp is the sign of the change — that is the
    // information the old ramp-from-zero threw away.
    rememberValue("pipeline", 3_400_000);
    expect(rampFrom("pipeline", 3_100_000)).toBe(3_400_000);
  });

  it("treats a return to zero as a change, not as an absence", () => {
    rememberValue("alerts", 3);
    expect(rampFrom("alerts", 0)).toBe(3);
  });

  it("keeps figures independent of one another", () => {
    rememberValue("a", 10);
    expect(rampFrom("b", 10)).toBe(0);
  });
});
