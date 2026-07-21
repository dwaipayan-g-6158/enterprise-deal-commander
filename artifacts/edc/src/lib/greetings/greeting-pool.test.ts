import { describe, it, expect } from "vitest";
import pool from "./greeting-pool.json";
import { KNOWN_HOOKS, type GreetingPool } from "./select-greeting";

const typedPool = pool as GreetingPool;
const BANDS = ["morning", "afternoon", "evening", "night"] as const;

describe("greeting-pool", () => {
  it("has all four time bands", () => {
    for (const band of BANDS) {
      expect(typedPool[band]).toBeDefined();
    }
  });

  it("has exactly 40 entries per band", () => {
    for (const band of BANDS) {
      expect(typedPool[band].length).toBe(40);
    }
  });

  it("has at least one hook-free (generic) entry per band", () => {
    for (const band of BANDS) {
      expect(typedPool[band].some((e) => e.hook === null)).toBe(true);
    }
  });

  it("only references known hooks", () => {
    for (const band of BANDS) {
      for (const entry of typedPool[band]) {
        if (entry.hook !== null) {
          expect(KNOWN_HOOKS).toContain(entry.hook);
        }
      }
    }
  });

  it("has globally unique ids", () => {
    const allIds = BANDS.flatMap((band) => typedPool[band].map((e) => e.id));
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});
