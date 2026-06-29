import { describe, it, expect } from "vitest";
import { deriveVelocityBucket, VELOCITY_RANK } from "./velocity";

const base = { benchmarkDays: 10, daysInStage: 10, velocityStatus: "NORMAL" as const };

describe("deriveVelocityBucket", () => {
  it("returns NO_DATE when there is no benchmark", () => {
    expect(deriveVelocityBucket(undefined)).toBe("NO_DATE");
    expect(deriveVelocityBucket({ ...base, benchmarkDays: 0 })).toBe("NO_DATE");
  });

  it("maps backend NORMAL/FAST/SLOW through", () => {
    expect(deriveVelocityBucket({ ...base, velocityStatus: "NORMAL" })).toBe("NORMAL");
    expect(deriveVelocityBucket({ ...base, daysInStage: 3, velocityStatus: "FAST" })).toBe("FAST");
    expect(deriveVelocityBucket({ ...base, daysInStage: 16, velocityStatus: "SLOW" })).toBe("SLOW");
  });

  it("escalates to STALLED past benchmark*2 regardless of backend flag", () => {
    // 21 > 10*2 -> STALLED even though backend would say SLOW
    expect(deriveVelocityBucket({ ...base, daysInStage: 21, velocityStatus: "SLOW" })).toBe("STALLED");
  });

  it("does not stall at exactly benchmark*2 (strict >)", () => {
    expect(deriveVelocityBucket({ ...base, daysInStage: 20, velocityStatus: "SLOW" })).toBe("SLOW");
  });

  it("ranks STALLED as the most severe and NO_DATE as least", () => {
    expect(VELOCITY_RANK.STALLED).toBeGreaterThan(VELOCITY_RANK.SLOW);
    expect(VELOCITY_RANK.SLOW).toBeGreaterThan(VELOCITY_RANK.NORMAL);
    expect(VELOCITY_RANK.NO_DATE).toBe(0);
  });
});
