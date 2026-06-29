import { describe, it, expect } from "vitest";
import { Ban, ShieldAlert, AlertTriangle, Info } from "lucide-react";
import { priorityPresentation, dimensionBarSegments } from "./risk-presentation";
import type { RiskActionPriority } from "./risk-model";

describe("priorityPresentation", () => {
  it("maps every priority to the expected icon + color", () => {
    expect(priorityPresentation("BLOCKER")).toEqual({ Icon: Ban, className: "text-destructive" });
    expect(priorityPresentation("CRITICAL")).toEqual({ Icon: ShieldAlert, className: "text-destructive" });
    expect(priorityPresentation("HIGH")).toEqual({ Icon: AlertTriangle, className: "text-orange-500" });
    expect(priorityPresentation("MEDIUM")).toEqual({ Icon: Info, className: "text-amber-500" });
    expect(priorityPresentation("LOW")).toEqual({ Icon: Info, className: "text-muted-foreground" });
  });

  it("has an entry for all 5 priorities", () => {
    const priorities: RiskActionPriority[] = ["BLOCKER", "CRITICAL", "HIGH", "MEDIUM", "LOW"];
    for (const p of priorities) {
      const result = priorityPresentation(p);
      expect(result.Icon).toBeTruthy();
      expect(result.className).toMatch(/^text-/);
    }
  });

  it("falls back to a neutral Info marker for an unknown priority", () => {
    expect(priorityPresentation("UNKNOWN")).toEqual({ Icon: Info, className: "text-muted-foreground" });
    expect(priorityPresentation("")).toEqual({ Icon: Info, className: "text-muted-foreground" });
  });
});

describe("dimensionBarSegments", () => {
  it("uses full score as base, no amp tip, when not amplified", () => {
    expect(dimensionBarSegments({ name: "A", score: 60 })).toEqual({
      basePct: 60,
      ampPct: 0,
      amplified: false,
    });
  });

  it("is not amplified when amplification is 0 or patterns are absent", () => {
    expect(dimensionBarSegments({ name: "A", score: 60, amplification: 0, contributingPatterns: ["X"] }).amplified).toBe(false);
    expect(dimensionBarSegments({ name: "A", score: 60, amplification: 10, contributingPatterns: [] }).amplified).toBe(false);
    expect(dimensionBarSegments({ name: "A", score: 60, amplification: 10 }).amplified).toBe(false);
  });

  it("splits into base + amp tip (score - baseScore) when amplified", () => {
    expect(
      dimensionBarSegments({
        name: "A",
        score: 80,
        baseScore: 50,
        amplification: 30,
        contributingPatterns: ["X"],
      }),
    ).toEqual({ basePct: 50, ampPct: 30, amplified: true });
  });

  it("clamps base + amp widths to [0,100]", () => {
    const over = dimensionBarSegments({
      name: "A",
      score: 150,
      baseScore: -20,
      amplification: 40,
      contributingPatterns: ["X"],
    });
    expect(over.basePct).toBe(0);
    expect(over.ampPct).toBe(100);
    expect(over.basePct).toBeGreaterThanOrEqual(0);
    expect(over.ampPct).toBeLessThanOrEqual(100);
  });

  it("never produces a negative amp tip when baseScore exceeds score", () => {
    const result = dimensionBarSegments({
      name: "A",
      score: 40,
      baseScore: 60,
      amplification: 10,
      contributingPatterns: ["X"],
    });
    expect(result.ampPct).toBe(0);
  });
});
