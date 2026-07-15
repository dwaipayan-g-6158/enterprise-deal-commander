import { describe, it, expect } from "vitest";
import type { PipelineStage } from "@workspace/api-client-react";
import { buildBoard, isAtRisk, moveIntent, extractGuardrail, terminalOutcome, toBoardStage } from "./board";
import type { RosterRow } from "./roster-types";

let seq = 0;
function row(p: Partial<RosterRow> = {}): RosterRow {
  seq += 1;
  return {
    id: p.id ?? `d${seq}`,
    dealName: p.dealName ?? `Deal ${seq}`,
    accountName: p.accountName ?? `Acct ${seq}`,
    accountManager: p.accountManager ?? "Dana",
    technicalLead: p.technicalLead ?? "Lee",
    salesStageId: p.salesStageId ?? 1,
    salesStage: p.salesStage ?? "Discovery",
    productRevenue: 0,
    servicesRevenue: 0,
    dealCurrency: "USD",
    calculatedTCV: p.calculatedTCV ?? 100,
    normalizedTCV: p.normalizedTCV ?? p.calculatedTCV ?? 100,
    healthStatus: p.healthStatus ?? "GREEN",
    score: p.score ?? null,
    gatesPct: p.gatesPct ?? 0,
    daysInStage: p.daysInStage ?? null,
    benchmarkDays: p.benchmarkDays ?? null,
    deltaDays: p.deltaDays ?? null,
    riskScore: p.riskScore ?? null,
    riskLevel: p.riskLevel ?? null,
    velocity: p.velocity ?? "NORMAL",
    competitorId: p.competitorId ?? null,
    expectedCloseDate: p.expectedCloseDate ?? null,
    ...p,
  } as RosterRow;
}

const STAGES: PipelineStage[] = [
  { id: 3, stageName: "Commercial", sortOrder: 3 },
  { id: 1, stageName: "Discovery", sortOrder: 1 },
  { id: 2, stageName: "Validation", sortOrder: 2 },
  { id: 5, stageName: "Closed-Won", sortOrder: 5 },
  { id: 6, stageName: "Closed-Lost", sortOrder: 6 },
  { id: 4, stageName: "Procurement", sortOrder: 4 },
];

describe("terminalOutcome", () => {
  it("detects won/lost across naming variants and returns null otherwise", () => {
    expect(terminalOutcome("Closed-Won")).toBe("won");
    expect(terminalOutcome("closed won")).toBe("won");
    expect(terminalOutcome("Closed-Lost")).toBe("lost");
    expect(terminalOutcome("closedlost")).toBe("lost");
    expect(terminalOutcome("Discovery")).toBeNull();
    expect(terminalOutcome(null)).toBeNull();
    expect(terminalOutcome(undefined)).toBeNull();
  });
});

describe("toBoardStage", () => {
  it("carries terminal detection", () => {
    expect(toBoardStage({ id: 5, stageName: "Closed-Won", sortOrder: 5 }).terminal).toBe("won");
    expect(toBoardStage({ id: 1, stageName: "Discovery", sortOrder: 1 }).terminal).toBeNull();
  });
});

describe("isAtRisk", () => {
  it("is true for HIGH riskLevel", () => {
    expect(isAtRisk(row({ riskLevel: "HIGH" }))).toBe(true);
  });
  it("is false for non-HIGH risk levels", () => {
    expect(isAtRisk(row({ riskLevel: "ELEVATED" }))).toBe(false);
    expect(isAtRisk(row({ riskLevel: "MODERATE" }))).toBe(false);
    expect(isAtRisk(row({ riskLevel: "LOW" }))).toBe(false);
  });
  it("falls back to RED health only when riskLevel is null", () => {
    expect(isAtRisk(row({ riskLevel: null, healthStatus: "RED" }))).toBe(true);
    expect(isAtRisk(row({ riskLevel: null, healthStatus: "YELLOW" }))).toBe(false);
    expect(isAtRisk(row({ riskLevel: null, healthStatus: "GREEN" }))).toBe(false);
    // An explicit non-HIGH riskLevel wins over RED health.
    expect(isAtRisk(row({ riskLevel: "LOW", healthStatus: "RED" }))).toBe(false);
  });
});

describe("buildBoard", () => {
  it("returns one column per stage, ordered by sortOrder, including empty ones", () => {
    const cols = buildBoard([], STAGES);
    expect(cols.map((c) => c.stage.name)).toEqual([
      "Discovery", "Validation", "Commercial", "Procurement", "Closed-Won", "Closed-Lost",
    ]);
    expect(cols.every((c) => c.dealCount === 0 && c.totalTCV === 0)).toBe(true);
  });

  it("groups rows by salesStageId and splits at-risk / on-track", () => {
    const rows = [
      row({ id: "a", salesStageId: 1, riskLevel: "HIGH", normalizedTCV: 100 }),
      row({ id: "b", salesStageId: 1, riskLevel: "LOW", normalizedTCV: 200 }),
      row({ id: "c", salesStageId: 2, riskLevel: null, healthStatus: "RED", normalizedTCV: 50 }),
    ];
    const cols = buildBoard(rows, STAGES);
    const discovery = cols.find((c) => c.stage.id === 1)!;
    expect(discovery.atRisk.map((r) => r.id)).toEqual(["a"]);
    expect(discovery.onTrack.map((r) => r.id)).toEqual(["b"]);
    expect(discovery.dealCount).toBe(2);
    expect(discovery.totalTCV).toBe(300);

    const validation = cols.find((c) => c.stage.id === 2)!;
    expect(validation.atRisk.map((r) => r.id)).toEqual(["c"]);
    expect(validation.dealCount).toBe(1);
  });

  it("preserves incoming order within a section", () => {
    const rows = [
      row({ id: "x1", salesStageId: 1, riskLevel: "LOW" }),
      row({ id: "x2", salesStageId: 1, riskLevel: "LOW" }),
      row({ id: "x3", salesStageId: 1, riskLevel: "LOW" }),
    ];
    const col = buildBoard(rows, STAGES).find((c) => c.stage.id === 1)!;
    expect(col.onTrack.map((r) => r.id)).toEqual(["x1", "x2", "x3"]);
  });

  it("sums normalizedTCV, not calculatedTCV", () => {
    const rows = [
      row({ salesStageId: 1, calculatedTCV: 999, normalizedTCV: 100 }),
      row({ salesStageId: 1, calculatedTCV: 999, normalizedTCV: 250 }),
    ];
    const col = buildBoard(rows, STAGES).find((c) => c.stage.id === 1)!;
    expect(col.totalTCV).toBe(350);
  });

  it("drops rows whose salesStageId is not in the lookup", () => {
    const rows = [row({ salesStageId: 1 }), row({ salesStageId: 99 })];
    const cols = buildBoard(rows, STAGES);
    expect(cols.reduce((n, c) => n + c.dealCount, 0)).toBe(1);
  });
});

describe("moveIntent", () => {
  it("classifies same / forward / backward by sortOrder", () => {
    expect(moveIntent(2, 2)).toBe("same");
    expect(moveIntent(1, 3)).toBe("forward");
    expect(moveIntent(4, 2)).toBe("backward");
  });
});

describe("extractGuardrail", () => {
  it("recognizes a 409 STAGE_GUARDRAIL ApiError", () => {
    const err = { status: 409, data: { error: { code: "STAGE_GUARDRAIL", message: "Blocked", patternCodes: ["P1", "P2"] } } };
    expect(extractGuardrail(err)).toEqual({ message: "Blocked", patternCodes: ["P1", "P2"] });
  });
  it("recognizes a 409 carrying patternCodes even without the explicit code", () => {
    const err = { status: 409, data: { error: { patternCodes: ["P9"] } } };
    expect(extractGuardrail(err)?.patternCodes).toEqual(["P9"]);
  });
  it("returns null for non-409 / non-guardrail / malformed errors", () => {
    expect(extractGuardrail({ status: 409, data: { error: { code: "CONFLICT" } } })).toBeNull();
    expect(extractGuardrail({ status: 500, data: { error: { code: "STAGE_GUARDRAIL" } } })).toBeNull();
    expect(extractGuardrail(new Error("boom"))).toBeNull();
    expect(extractGuardrail(null)).toBeNull();
    expect(extractGuardrail(undefined)).toBeNull();
  });
});
