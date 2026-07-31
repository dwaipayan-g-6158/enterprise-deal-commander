import { describe, it, expect } from "vitest";
import { computeLossDashboardMetrics, type LossDashboardRow } from "./loss-dashboard";

function row(overrides: Partial<LossDashboardRow> = {}): LossDashboardRow {
  return {
    tcv: 10_000,
    primaryLossCategory: "price",
    autopsyCompletedAt: null,
    qualityScore: null,
    ...overrides,
  };
}

describe("computeLossDashboardMetrics", () => {
  it("returns lossPulse: null when there are zero losses, not a misleading midpoint score", () => {
    const metrics = computeLossDashboardMetrics([], 5);
    expect(metrics.lossPulse).toBeNull();
    expect(metrics.volume.lossCount).toBe(0);
    expect(metrics.volume.lossValue).toBe(0);
  });

  it("sums compositionByCategory values to volume.lossValue", () => {
    const rows = [
      row({ tcv: 10_000, primaryLossCategory: "price" }),
      row({ tcv: 25_000, primaryLossCategory: "product" }),
      row({ tcv: 5_000, primaryLossCategory: null }),
    ];
    const metrics = computeLossDashboardMetrics(rows, 0);
    const compositionSum = metrics.compositionByCategory.reduce((s, c) => s + c.value, 0);
    expect(compositionSum).toBe(metrics.volume.lossValue);
    expect(metrics.compositionByCategory.find((c) => c.category === "uncategorized")?.value).toBe(5_000);
  });

  it("excludes rows with a null qualityScore from avgQualityScore instead of treating them as 0", () => {
    const rows = [
      row({ autopsyCompletedAt: new Date(), qualityScore: 80 }),
      row({ autopsyCompletedAt: new Date(), qualityScore: null }),
    ];
    const metrics = computeLossDashboardMetrics(rows, 0);
    // If the null score were coerced to 0, this would be 40, not 80.
    expect(metrics.lossPulseComponents.avgQualityScore).toBe(80);
  });

  it("does not fold win/loss rate into the Loss Pulse composite", () => {
    // All losses have complete, perfect-quality autopsies (pulse should be
    // 100), but the win rate is terrible (lossRatePct should be high) — the
    // two must not cancel each other out in lossPulse.
    const rows = [
      row({ autopsyCompletedAt: new Date(), qualityScore: 100 }),
      row({ autopsyCompletedAt: new Date(), qualityScore: 100 }),
    ];
    const metrics = computeLossDashboardMetrics(rows, 0);
    expect(metrics.lossPulse).toBe(100);
    expect(metrics.lossPulseComponents.lossRatePct).toBe(100);
  });
});
