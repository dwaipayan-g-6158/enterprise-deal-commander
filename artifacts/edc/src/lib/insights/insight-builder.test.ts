import { describe, it, expect } from "vitest";
import { buildInsights, type InsightBuilderInputs } from "./insight-builder";

const NOW = new Date("2026-07-22T12:00:00Z");

describe("buildInsights — comparison (WoW pipeline)", () => {
  it("produces no comparison insight when baseline is null", () => {
    const inputs: InsightBuilderInputs = {
      vitalSigns: { weightedPipeline: 1_000_000, baseline: null },
    };
    const insights = buildInsights(inputs, NOW);
    expect(insights.some((i) => i.kind === "comparison")).toBe(false);
  });

  it("produces no comparison insight when vitalSigns is missing entirely", () => {
    const insights = buildInsights({}, NOW);
    expect(insights.some((i) => i.kind === "comparison")).toBe(false);
  });

  it("produces a comparison insight when baseline is present and pipeline rose", () => {
    const inputs: InsightBuilderInputs = {
      vitalSigns: {
        weightedPipeline: 1_200_000,
        baseline: { totalTCV: 1_000_000, activeDeals: 10, redAlerts: 1 },
      },
    };
    const insights = buildInsights(inputs, NOW);
    const comparison = insights.find((i) => i.kind === "comparison");
    expect(comparison).toBeDefined();
    expect(comparison?.id).toBe("comparison-wow-pipeline");
    expect(comparison?.text).toMatch(/up/i);
  });

  it("produces a comparison insight when baseline is present and pipeline fell", () => {
    const inputs: InsightBuilderInputs = {
      vitalSigns: {
        weightedPipeline: 800_000,
        baseline: { totalTCV: 1_000_000, activeDeals: 10, redAlerts: 1 },
      },
    };
    const insights = buildInsights(inputs, NOW);
    const comparison = insights.find((i) => i.kind === "comparison");
    expect(comparison).toBeDefined();
    expect(comparison?.text).toMatch(/down/i);
  });

  it("describes a flat week without fabricating an up/down direction", () => {
    const inputs: InsightBuilderInputs = {
      vitalSigns: {
        weightedPipeline: 1_000_000,
        baseline: { totalTCV: 1_000_000, activeDeals: 10, redAlerts: 1 },
      },
    };
    const insights = buildInsights(inputs, NOW);
    const comparison = insights.find((i) => i.kind === "comparison");
    expect(comparison).toBeDefined();
    expect(comparison?.text).not.toMatch(/up|down/i);
  });

  it("never sets navigateTo on a comparison insight", () => {
    const inputs: InsightBuilderInputs = {
      vitalSigns: {
        weightedPipeline: 1_200_000,
        baseline: { totalTCV: 1_000_000, activeDeals: 10, redAlerts: 1 },
      },
    };
    const insights = buildInsights(inputs, NOW);
    const comparison = insights.find((i) => i.kind === "comparison");
    expect(comparison?.navigateTo).toBeUndefined();
  });
});

describe("buildInsights — anomaly (stale deals)", () => {
  it("produces no anomaly insight when staleDeals is empty", () => {
    const inputs: InsightBuilderInputs = { summary: { staleDeals: [] } };
    const insights = buildInsights(inputs, NOW);
    expect(insights.some((i) => i.kind === "anomaly")).toBe(false);
  });

  it("produces no anomaly insight when summary is missing entirely", () => {
    const insights = buildInsights({}, NOW);
    expect(insights.some((i) => i.kind === "anomaly")).toBe(false);
  });

  it("produces an anomaly insight that deep-links to the first stale deal", () => {
    const inputs: InsightBuilderInputs = {
      summary: {
        staleDeals: [
          { dealId: "deal-1", dealName: "Acme Corp", daysInStage: 40 },
          { dealId: "deal-2", dealName: "Globex", daysInStage: 32 },
        ],
      },
    };
    const insights = buildInsights(inputs, NOW);
    const anomaly = insights.find((i) => i.kind === "anomaly");
    expect(anomaly).toBeDefined();
    expect(anomaly?.id).toBe("anomaly-stale-deals");
    expect(anomaly?.navigateTo).toBe("/deals/deal-1");
    expect(anomaly?.text).toMatch(/2/);
  });

  it("singularizes the anomaly wording for exactly one stale deal", () => {
    const inputs: InsightBuilderInputs = {
      summary: {
        staleDeals: [{ dealId: "deal-1", dealName: "Acme Corp", daysInStage: 40 }],
      },
    };
    const insights = buildInsights(inputs, NOW);
    const anomaly = insights.find((i) => i.kind === "anomaly");
    expect(anomaly?.text).toContain("Acme Corp");
    expect(anomaly?.navigateTo).toBe("/deals/deal-1");
  });
});

describe("buildInsights — pattern (memory insights)", () => {
  it("produces no pattern insights when memoryInsights is missing or empty", () => {
    expect(buildInsights({}, NOW).some((i) => i.kind === "pattern")).toBe(false);
    expect(
      buildInsights({ memoryInsights: { insights: [], archivedCount: 5 } }, NOW).some(
        (i) => i.kind === "pattern",
      ),
    ).toBe(false);
  });

  it("maps memory insights 1:1 to pattern insights, deep-linking to the first matched deal", () => {
    const inputs: InsightBuilderInputs = {
      memoryInsights: {
        archivedCount: 6,
        insights: [
          {
            text: "Deals with a slow Gate 2 tend to stall.",
            matchedDeals: [
              { id: "deal-a", dealName: "Acme" },
              { id: "deal-b", dealName: "Beta" },
            ],
          },
          {
            text: "Discount-heavy deals close slower.",
            matchedDeals: [],
          },
        ],
      },
    };
    const insights = buildInsights(inputs, NOW);
    const patterns = insights.filter((i) => i.kind === "pattern");
    expect(patterns).toHaveLength(2);
    expect(patterns[0].text).toBe("Deals with a slow Gate 2 tend to stall.");
    expect(patterns[0].navigateTo).toBe("/deals/deal-a");
    expect(patterns[1].text).toBe("Discount-heavy deals close slower.");
    expect(patterns[1].navigateTo).toBeUndefined();
  });

  it("gives pattern insights stable, distinct ids", () => {
    const inputs: InsightBuilderInputs = {
      memoryInsights: {
        archivedCount: 6,
        insights: [
          { text: "First pattern.", matchedDeals: [] },
          { text: "Second pattern.", matchedDeals: [] },
        ],
      },
    };
    const ids = buildInsights(inputs, NOW)
      .filter((i) => i.kind === "pattern")
      .map((i) => i.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("buildInsights — overall", () => {
  it("returns an empty array when no source has qualifying data", () => {
    expect(buildInsights({}, NOW)).toEqual([]);
    expect(
      buildInsights(
        {
          vitalSigns: { weightedPipeline: 500, baseline: null },
          summary: { staleDeals: [] },
          memoryInsights: { insights: [], archivedCount: 0 },
        },
        NOW,
      ),
    ).toEqual([]);
  });

  it("produces stable ids across repeated calls with the same inputs", () => {
    const inputs: InsightBuilderInputs = {
      vitalSigns: {
        weightedPipeline: 1_200_000,
        baseline: { totalTCV: 1_000_000, activeDeals: 10, redAlerts: 1 },
      },
      summary: {
        staleDeals: [{ dealId: "deal-1", dealName: "Acme Corp", daysInStage: 40 }],
      },
      memoryInsights: {
        archivedCount: 6,
        insights: [{ text: "First pattern.", matchedDeals: [] }],
      },
    };
    const idsA = buildInsights(inputs, NOW).map((i) => i.id);
    const idsB = buildInsights(inputs, NOW).map((i) => i.id);
    expect(idsA).toEqual(idsB);
  });

  it("combines all kinds when every source qualifies", () => {
    const inputs: InsightBuilderInputs = {
      vitalSigns: {
        weightedPipeline: 1_200_000,
        baseline: { totalTCV: 1_000_000, activeDeals: 10, redAlerts: 1 },
      },
      summary: {
        staleDeals: [{ dealId: "deal-1", dealName: "Acme Corp", daysInStage: 40 }],
      },
      memoryInsights: {
        archivedCount: 6,
        insights: [{ text: "First pattern.", matchedDeals: [] }],
      },
    };
    const kinds = buildInsights(inputs, NOW).map((i) => i.kind).sort();
    expect(kinds).toEqual(["anomaly", "comparison", "pattern"]);
  });
});
