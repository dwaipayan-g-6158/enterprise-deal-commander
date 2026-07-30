import { describe, it, expect } from "vitest";
import { shouldSkipSnapshot, snapshotFingerprint } from "./snapshot-service";

describe("shouldSkipSnapshot", () => {
  it("skips deal.deleted and deal.archived", () => {
    expect(shouldSkipSnapshot("deal.deleted")).toBe(true);
    expect(shouldSkipSnapshot("deal.archived")).toBe(true);
  });

  it("does not skip other event types", () => {
    expect(shouldSkipSnapshot("deal.updated")).toBe(false);
    expect(shouldSkipSnapshot("deal.restored")).toBe(false);
    expect(shouldSkipSnapshot("deal.created")).toBe(false);
    expect(shouldSkipSnapshot("health.changed")).toBe(false);
  });
});

function snap(over: Record<string, unknown> = {}, payloadOver: Record<string, unknown> = {}) {
  return {
    healthStatus: "YELLOW",
    salesStageId: 2,
    calculatedTcv: "3816400",
    normalizedTcv: "3816400",
    payload: {
      deal: {
        dealName: "Project Cobalt",
        accountName: "Umbrella Holdings",
        salesStage: "Discovery",
        accountManager: "Sarah Chen",
        technicalLead: "Marcus Webb",
        pricingModel: "Multi-Year Committed",
        dealCurrency: "USD",
        expectedCloseDate: "2026-07-13",
        productRevenue: 1200000,
        servicesRevenue: 216400,
        contractTermYears: 3,
        winProbabilityPct: 80,
        committed: true,
      },
      gates: [
        { gateCode: "G1_CRITERIA_LOCKED", isCompleted: true },
        { gateCode: "G3_PERFORMANCE_PASSED", isCompleted: false },
      ],
      governance: { healthStatus: "YELLOW", alerts: [{ code: "LOW_ATTACH_ELEPHANT", severity: "YELLOW" }] },
      playbook: { adherencePct: 40, progressPct: 25, criticalGaps: 1, overdueCount: 4 },
      meddpicc: { overallPct: 55, stagePct: 60, ragStatus: "AMBER" },
      ...payloadOver,
    },
    ...over,
  };
}

describe("snapshotFingerprint", () => {
  it("is stable for identical content", () => {
    expect(snapshotFingerprint(snap())).toBe(snapshotFingerprint(snap()));
  });

  it("ignores when/why/who the snapshot was taken", () => {
    // These are the fields that differ between two hourly captures of an
    // untouched deal — they must not affect the fingerprint.
    const a = { ...snap(), reason: "periodic", triggerEvent: null, createdBy: "system", snapshotAt: "2026-07-30T01:00:00Z" };
    const b = { ...snap(), reason: "event:deal.updated", triggerEvent: "deal.updated", createdBy: "Sarah Chen", snapshotAt: "2026-07-30T02:00:00Z" };
    expect(snapshotFingerprint(a)).toBe(snapshotFingerprint(b));
  });

  it("ignores the deal's own createdAt/updatedAt", () => {
    const withStamps = snap({}, {
      deal: { ...snap().payload.deal, updatedAt: "2026-07-30T02:00:00Z", createdAt: "2026-07-01T00:00:00Z" },
    });
    expect(snapshotFingerprint(withStamps)).toBe(snapshotFingerprint(snap()));
  });

  it("treats a numeric column round-trip as unchanged", () => {
    // Postgres numeric returns "3816400.00"; the freshly computed value is 3816400.
    expect(snapshotFingerprint(snap({ calculatedTcv: "3816400.00" }))).toBe(
      snapshotFingerprint(snap({ calculatedTcv: 3816400 })),
    );
  });

  it("changes when health changes", () => {
    expect(snapshotFingerprint(snap({ healthStatus: "RED" }))).not.toBe(
      snapshotFingerprint(snap()),
    );
  });

  it("changes when the stage changes", () => {
    expect(snapshotFingerprint(snap({ salesStageId: 3 }))).not.toBe(
      snapshotFingerprint(snap()),
    );
  });

  it("changes when TCV changes", () => {
    expect(snapshotFingerprint(snap({ calculatedTcv: "3780000" }))).not.toBe(
      snapshotFingerprint(snap()),
    );
  });

  it("changes when a gate is toggled, though the summary columns do not move", () => {
    const toggled = snap({}, {
      gates: [
        { gateCode: "G1_CRITERIA_LOCKED", isCompleted: true },
        { gateCode: "G3_PERFORMANCE_PASSED", isCompleted: true },
      ],
    });
    expect(snapshotFingerprint(toggled)).not.toBe(snapshotFingerprint(snap()));
  });

  it("changes when an alert appears while health stays the same", () => {
    // The case that makes comparing only health/stage/TCV wrong: a second
    // YELLOW pattern fires and health is already YELLOW.
    const extraAlert = snap({}, {
      governance: {
        healthStatus: "YELLOW",
        alerts: [
          { code: "LOW_ATTACH_ELEPHANT", severity: "YELLOW" },
          { code: "CLOSE_DATE_PRESSURE", severity: "YELLOW" },
        ],
      },
    });
    expect(snapshotFingerprint(extraAlert)).not.toBe(snapshotFingerprint(snap()));
  });

  it("is order-insensitive for gates and alerts", () => {
    const reordered = snap({}, {
      gates: [
        { gateCode: "G3_PERFORMANCE_PASSED", isCompleted: false },
        { gateCode: "G1_CRITERIA_LOCKED", isCompleted: true },
      ],
    });
    expect(snapshotFingerprint(reordered)).toBe(snapshotFingerprint(snap()));
  });

  it("changes when playbook signals move", () => {
    const moved = snap({}, {
      playbook: { adherencePct: 40, progressPct: 50, criticalGaps: 1, overdueCount: 4 },
    });
    expect(snapshotFingerprint(moved)).not.toBe(snapshotFingerprint(snap()));
  });

  it("changes when MEDDPICC moves", () => {
    const moved = snap({}, {
      meddpicc: { overallPct: 70, stagePct: 60, ragStatus: "AMBER" },
    });
    expect(snapshotFingerprint(moved)).not.toBe(snapshotFingerprint(snap()));
  });

  it("distinguishes a missing playbook/meddpicc from a present one", () => {
    expect(snapshotFingerprint(snap({}, { meddpicc: null }))).not.toBe(
      snapshotFingerprint(snap()),
    );
  });

  it("changes when deal economics move", () => {
    const moved = snap({}, {
      deal: { ...snap().payload.deal, productRevenue: 1500000 },
    });
    expect(snapshotFingerprint(moved)).not.toBe(snapshotFingerprint(snap()));
  });

  it("does not throw on an empty or malformed payload", () => {
    expect(() => snapshotFingerprint({})).not.toThrow();
    expect(() => snapshotFingerprint({ payload: null })).not.toThrow();
    expect(() => snapshotFingerprint({ payload: { gates: "nope", governance: 7 } })).not.toThrow();
    // Two equally-empty inputs still agree.
    expect(snapshotFingerprint({})).toBe(snapshotFingerprint({ payload: {} }));
  });
});
