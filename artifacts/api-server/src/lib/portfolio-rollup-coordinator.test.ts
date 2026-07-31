import { describe, it, expect } from "vitest";
import {
  isRollupStale,
  ROLLUP_MAX_AGE_MS,
  ROLLUP_STALE_GRACE_MS,
} from "./portfolio-rollup-coordinator";
import { MV_REFRESH_INTERVAL_MS } from "./refresh-cadence";

describe("isRollupStale", () => {
  const now = Date.parse("2026-07-31T12:00:00.000Z");

  it("is not stale exactly at maxAgeMs old (boundary is >, not >=)", () => {
    const computedAt = new Date(now - ROLLUP_MAX_AGE_MS);
    expect(isRollupStale(computedAt, now)).toBe(false);
  });

  it("is stale at maxAgeMs + 1ms old", () => {
    const computedAt = new Date(now - ROLLUP_MAX_AGE_MS - 1);
    expect(isRollupStale(computedAt, now)).toBe(true);
  });

  it("is stale when computedAt is null", () => {
    expect(isRollupStale(null, now)).toBe(true);
  });

  it("is stale when computedAt is undefined", () => {
    expect(isRollupStale(undefined, now)).toBe(true);
  });

  it("is stale for an unparseable string", () => {
    expect(isRollupStale("not-a-date", now)).toBe(true);
  });

  it("is not stale for a valid, fresh ISO string", () => {
    const fresh = new Date(now - 60_000).toISOString();
    expect(isRollupStale(fresh, now)).toBe(false);
  });

  it("is not stale for a timestamp in the future (clock skew, not staleness)", () => {
    const future = new Date(now + 60_000);
    expect(isRollupStale(future, now)).toBe(false);
  });

  it("honors an explicit maxAgeMs override", () => {
    const customMaxAge = 5_000;
    const justUnderCustom = new Date(now - customMaxAge);
    const justOverCustom = new Date(now - customMaxAge - 1);
    expect(isRollupStale(justUnderCustom, now, customMaxAge)).toBe(false);
    expect(isRollupStale(justOverCustom, now, customMaxAge)).toBe(true);
    // Same age would NOT be stale against the (much larger) default max age,
    // proving the override — not the default — governs the boundary above.
    expect(isRollupStale(justOverCustom, now)).toBe(false);
  });
});

describe("constant sanity", () => {
  it("ROLLUP_MAX_AGE_MS exceeds the refresh cadence (one cycle fits inside the max age)", () => {
    expect(ROLLUP_MAX_AGE_MS).toBeGreaterThan(MV_REFRESH_INTERVAL_MS);
  });

  it("ROLLUP_STALE_GRACE_MS is positive", () => {
    expect(ROLLUP_STALE_GRACE_MS).toBeGreaterThan(0);
  });
});
