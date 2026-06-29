import { describe, it, expect } from "vitest";
import { Ban, ShieldAlert, AlertTriangle, Info } from "lucide-react";
import { priorityPresentation, dimensionBarSegments, abbreviateDimension, radarData } from "./risk-presentation";
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

describe("abbreviateDimension", () => {
  it("returns known short labels for canonical dimension names", () => {
    expect(abbreviateDimension("Commercial Alignment")).toBe("Commercial");
    expect(abbreviateDimension("Technical Readiness")).toBe("Technical");
    expect(abbreviateDimension("Stakeholder Coverage")).toBe("Stakeholder");
    expect(abbreviateDimension("Temporal Pressure")).toBe("Temporal");
    expect(abbreviateDimension("Financial Structure")).toBe("Financial");
    expect(abbreviateDimension("Competitive Exposure")).toBe("Competitive");
    expect(abbreviateDimension("Engagement Vitality")).toBe("Engagement");
  });

  it("returns the raw name for an unknown dimension", () => {
    expect(abbreviateDimension("Unknown Dimension")).toBe("Unknown Dimension");
    expect(abbreviateDimension("")).toBe("");
  });
});

describe("radarData", () => {
  it("maps dimensions to RadarPoint shape with abbreviated axis labels", () => {
    const dims = [
      { name: "Commercial Alignment", score: 70 },
      { name: "Technical Readiness", score: 45 },
    ];
    const result = radarData(dims);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ axis: "Commercial", full: "Commercial Alignment", score: 70 });
    expect(result[1]).toEqual({ axis: "Technical", full: "Technical Readiness", score: 45 });
  });

  it("clamps scores to [0, 100]", () => {
    const dims = [
      { name: "A", score: -10 },
      { name: "B", score: 150 },
    ];
    const result = radarData(dims);
    expect(result[0].score).toBe(0);
    expect(result[1].score).toBe(100);
  });

  it("returns an empty array for empty input", () => {
    expect(radarData([])).toEqual([]);
  });
});
