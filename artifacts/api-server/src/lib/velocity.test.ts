import { describe, it, expect } from "vitest";
import { computeVelocityRows, type VelocityInput } from "./velocity";

describe("computeVelocityRows", () => {
  it("returns null benchmark (not a self-fulfilling match) when a deal is the only one in its stage", () => {
    const rows: VelocityInput[] = [{ id: "a", stageName: "Commercial", daysInStage: 13 }];
    const [row] = computeVelocityRows(rows);
    expect(row.benchmarkDays).toBeNull();
    expect(row.deltaDays).toBeNull();
    expect(row.velocity).toBe("INSUFFICIENT_DATA");
    expect(row.benchmarkSampleSize).toBe(0);
  });

  it("excludes the deal being scored from its own benchmark — regression guard for a real 'exactly at benchmark' bug", () => {
    // Two deals in the same stage: 10 days and 20 days. Each deal's
    // benchmark must be the OTHER deal's value, not a median over both
    // (which would make each deal read as "exactly at benchmark").
    const rows: VelocityInput[] = [
      { id: "a", stageName: "Validation", daysInStage: 10 },
      { id: "b", stageName: "Validation", daysInStage: 20 },
    ];
    const [a, b] = computeVelocityRows(rows);
    expect(a.benchmarkDays).toBe(20);
    expect(a.deltaDays).toBe(-10);
    expect(b.benchmarkDays).toBe(10);
    expect(b.deltaDays).toBe(10);
  });

  it("excludes exactly one matching occurrence per deal when multiple deals share the same daysInStage", () => {
    // Three deals all at 13 days. Each deal's benchmark must still be
    // computed over the OTHER two (median 13), not accidentally dropping
    // more than one occurrence.
    const rows: VelocityInput[] = [
      { id: "a", stageName: "Discovery", daysInStage: 13 },
      { id: "b", stageName: "Discovery", daysInStage: 13 },
      { id: "c", stageName: "Discovery", daysInStage: 13 },
    ];
    const out = computeVelocityRows(rows);
    expect(out.every((r) => r.benchmarkDays === 13)).toBe(true);
    expect(out.every((r) => r.benchmarkSampleSize === 2)).toBe(true);
  });

  it("classifies SLOW at >1.5x and FAST at <0.5x the leave-one-out benchmark", () => {
    const rows: VelocityInput[] = [
      { id: "slow", stageName: "Procurement", daysInStage: 100 },
      { id: "fast", stageName: "Procurement", daysInStage: 1 },
      { id: "anchor", stageName: "Procurement", daysInStage: 20 },
    ];
    const out = computeVelocityRows(rows);
    // "slow"'s benchmark = median(1, 20) = 1... wait, exercise the actual
    // leave-one-out set instead of assuming — assert against the real
    // computed benchmark rather than a hand-guessed one.
    const slow = out.find((r) => r.id === "slow")!;
    const fast = out.find((r) => r.id === "fast")!;
    expect(slow.velocity).toBe("SLOW");
    expect(fast.velocity).toBe("FAST");
  });

  it("keeps separate stages independent", () => {
    const rows: VelocityInput[] = [
      { id: "a", stageName: "Discovery", daysInStage: 5 },
      { id: "b", stageName: "Commercial", daysInStage: 50 },
    ];
    const out = computeVelocityRows(rows);
    expect(out.find((r) => r.id === "a")!.benchmarkDays).toBeNull();
    expect(out.find((r) => r.id === "b")!.benchmarkDays).toBeNull();
  });
});
