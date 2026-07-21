import { describe, it, expect } from "vitest";
import {
  computeDealRisk,
  buildRiskCells,
  diversificationIndex,
  correlatedExposureTcv,
  significantCodes,
  recurringActiveCodes,
  pickHighestCorrelationCluster,
  type MetricsRecord,
  type GroupCorrelation,
  type PortfolioMetricsConfig,
  DEFAULT_PORTFOLIO_CONFIG,
} from "./portfolio-metrics";

function rec(over: Partial<MetricsRecord> = {}): MetricsRecord {
  return {
    dealId: "d1",
    dealName: "Deal 1",
    accountName: "Acme",
    salesStage: "Negotiation",
    accountManager: "Alice",
    technicalLead: "Tarek",
    daysInStage: 10,
    tcv: 100_000,
    healthStatus: "GREEN",
    maxActiveAlertWeight: 0,
    activeAlertCodes: [],
    alertCodes: [],
    hasActiveRedAlert: false,
    products: ["AD360"],
    stalled: false,
    ...over,
  };
}

describe("computeDealRisk", () => {
  it("maps a clean GREEN deal with no alerts to the low band", () => {
    expect(computeDealRisk({ healthStatus: "GREEN", maxActiveAlertWeight: 0 })).toBe(10);
  });

  it("adds a capped bump for the strongest active alert", () => {
    // RED base 75 + min(25, 90*0.25=22.5) => 97.5 -> 98
    expect(
      computeDealRisk({ healthStatus: "RED", maxActiveAlertWeight: 90 }),
    ).toBe(98);
  });

  it("caps the alert bump at 25 regardless of weight", () => {
    // YELLOW base 45 + min(25, 100*0.25=25) = 70
    expect(
      computeDealRisk({ healthStatus: "YELLOW", maxActiveAlertWeight: 100 }),
    ).toBe(70);
  });

  it("never exceeds 100", () => {
    expect(
      computeDealRisk({ healthStatus: "RED", maxActiveAlertWeight: 1000 }),
    ).toBeLessThanOrEqual(100);
  });
});

describe("buildRiskCells", () => {
  it("groups deals by (person, product) and averages risk", () => {
    const records = [
      rec({ dealId: "a", accountManager: "Alice", products: ["AD360"], healthStatus: "GREEN", maxActiveAlertWeight: 0 }),
      rec({ dealId: "b", accountManager: "Alice", products: ["AD360"], healthStatus: "RED", maxActiveAlertWeight: 80 }),
    ];
    const cells = buildRiskCells(records, "accountManager");
    expect(cells).toHaveLength(1);
    const cell = cells[0];
    expect(cell.person).toBe("Alice");
    expect(cell.product).toBe("AD360");
    expect(cell.dealCount).toBe(2);
    expect(cell.tcv).toBe(200_000);
    // mean of 10 and (75 + 20 = 95) = 52.5 -> 53
    expect(cell.riskScore).toBe(53);
    expect(cell.lowConfidence).toBe(true); // 2 < 3
    expect(cell.deals.map((d) => d.id).sort()).toEqual(["a", "b"]);
  });

  it("expands a deal across each of its products", () => {
    const records = [rec({ products: ["AD360", "Log360"] })];
    const cells = buildRiskCells(records, "accountManager");
    expect(cells.map((c) => c.product).sort()).toEqual(["AD360", "Log360"]);
  });

  it("clears lowConfidence at 3+ deals and surfaces top alert codes", () => {
    const records = [
      rec({ dealId: "a", activeAlertCodes: ["STALLED_VALIDATION"] }),
      rec({ dealId: "b", activeAlertCodes: ["STALLED_VALIDATION"] }),
      rec({ dealId: "c", activeAlertCodes: ["DISCOUNT_SPIRAL"] }),
    ];
    const cell = buildRiskCells(records, "accountManager")[0];
    expect(cell.lowConfidence).toBe(false);
    expect(cell.topAlertCodes[0]).toBe("STALLED_VALIDATION");
  });

  it("buckets a missing person under Unassigned", () => {
    const cell = buildRiskCells([rec({ accountManager: "" })], "accountManager")[0];
    expect(cell.person).toBe("Unassigned");
  });

  it("preserves person and product names that contain spaces and dots", () => {
    const records = [
      rec({ dealId: "a", accountManager: "J. Chen", products: ["DataSync Pro"] }),
      rec({ dealId: "b", accountManager: "J. Chen", products: ["DataSync Pro"] }),
    ];
    const cells = buildRiskCells(records, "accountManager");
    expect(cells).toHaveLength(1);
    expect(cells[0].person).toBe("J. Chen");
    expect(cells[0].product).toBe("DataSync Pro");
    expect(cells[0].dealCount).toBe(2);
  });
});

describe("diversificationIndex", () => {
  it("returns 1 for an empty portfolio", () => {
    expect(diversificationIndex([])).toBe(1);
  });

  it("approaches 0 when all risk sits in one cell", () => {
    const cells = buildRiskCells(
      [rec({ healthStatus: "RED", maxActiveAlertWeight: 80 })],
      "accountManager",
    );
    expect(diversificationIndex(cells)).toBeCloseTo(0, 5);
  });

  it("is higher when risk is spread evenly across cells", () => {
    const even = buildRiskCells(
      [
        rec({ dealId: "a", accountManager: "Alice", products: ["AD360"], healthStatus: "RED", maxActiveAlertWeight: 80 }),
        rec({ dealId: "b", accountManager: "Bob", products: ["Log360"], healthStatus: "RED", maxActiveAlertWeight: 80 }),
      ],
      "accountManager",
    );
    // two equal-weight clusters => D = 1 - (0.5^2 + 0.5^2) = 0.5
    expect(diversificationIndex(even)).toBeCloseTo(0.5, 5);
  });
});

describe("significantCodes + correlatedExposureTcv", () => {
  const groups: GroupCorrelation[] = [
    {
      name: "Alice",
      dealCount: 5,
      alertCorrelations: [{ code: "STALLED_VALIDATION", share: 0.8, lift: 2.0 }],
    },
    {
      name: "Bob",
      dealCount: 2, // below minDeals
      alertCorrelations: [{ code: "DISCOUNT_SPIRAL", share: 0.9, lift: 3.0 }],
    },
  ];

  it("flags only codes meeting lift/share/dealCount thresholds", () => {
    const codes = significantCodes(groups);
    expect([...codes]).toEqual(["STALLED_VALIDATION"]);
  });

  it("sums tcv of deals carrying a significant active code", () => {
    const codes = significantCodes(groups);
    const records = [
      rec({ dealId: "a", tcv: 100_000, activeAlertCodes: ["STALLED_VALIDATION"] }),
      rec({ dealId: "b", tcv: 50_000, activeAlertCodes: ["DISCOUNT_SPIRAL"] }),
      rec({ dealId: "c", tcv: 25_000, activeAlertCodes: [] }),
    ];
    expect(correlatedExposureTcv(records, codes)).toBe(100_000);
  });

  it("returns 0 when the code set is empty", () => {
    const records = [rec({ tcv: 100_000, activeAlertCodes: ["STALLED_VALIDATION"] })];
    expect(correlatedExposureTcv(records, new Set())).toBe(0);
  });
});

describe("recurringActiveCodes", () => {
  it("flags a code carried as an active alert by >= clusterMinDeals deals, even with a single manager/product", () => {
    // All deals share one account manager and product, so no group axis can
    // ever produce lift >= 1.5 here (share ~= globalShare) — this is exactly
    // the single-operator case significantCodes cannot surface.
    const records = [
      rec({ dealId: "a", accountManager: "Alice", products: ["AD360"], activeAlertCodes: ["STALLED_VALIDATION"] }),
      rec({ dealId: "b", accountManager: "Alice", products: ["AD360"], activeAlertCodes: ["STALLED_VALIDATION"] }),
      rec({ dealId: "c", accountManager: "Alice", products: ["AD360"], activeAlertCodes: ["STALLED_VALIDATION"] }),
    ];
    expect([...recurringActiveCodes(records)]).toEqual(["STALLED_VALIDATION"]);
  });

  it("excludes codes that recur fewer than clusterMinDeals times", () => {
    const records = [
      rec({ dealId: "a", activeAlertCodes: ["DISCOUNT_SPIRAL"] }),
      rec({ dealId: "b", activeAlertCodes: ["DISCOUNT_SPIRAL"] }),
    ];
    expect(recurringActiveCodes(records).size).toBe(0);
  });

  it("ignores codes that are only managed (dispositioned), not active", () => {
    // Same code recurs 3x, but only via alertCodes (active+managed) — never
    // as an active alert — so it must not count as a recurring active code.
    const records = [
      rec({ dealId: "a", activeAlertCodes: [], alertCodes: ["STALLED_VALIDATION"] }),
      rec({ dealId: "b", activeAlertCodes: [], alertCodes: ["STALLED_VALIDATION"] }),
      rec({ dealId: "c", activeAlertCodes: [], alertCodes: ["STALLED_VALIDATION"] }),
    ];
    expect(recurringActiveCodes(records).size).toBe(0);
  });

  it("feeds correlatedExposureTcv with a non-zero sum for a recurring active code", () => {
    const records = [
      rec({ dealId: "a", tcv: 100_000, activeAlertCodes: ["STALLED_VALIDATION"] }),
      rec({ dealId: "b", tcv: 50_000, activeAlertCodes: ["STALLED_VALIDATION"] }),
      rec({ dealId: "c", tcv: 25_000, activeAlertCodes: ["STALLED_VALIDATION"] }),
      rec({ dealId: "d", tcv: 10_000, activeAlertCodes: [] }),
    ];
    const codes = recurringActiveCodes(records);
    expect(correlatedExposureTcv(records, codes)).toBe(175_000);
  });
});

describe("pickHighestCorrelationCluster", () => {
  it("returns the eligible (group, code) with the highest lift", () => {
    const byManager: GroupCorrelation[] = [
      { name: "Alice", dealCount: 4, alertCorrelations: [{ code: "X", share: 0.6, lift: 1.8 }] },
    ];
    const byProduct: GroupCorrelation[] = [
      { name: "AD360", dealCount: 6, alertCorrelations: [{ code: "Y", share: 0.7, lift: 2.5 }] },
    ];
    const top = pickHighestCorrelationCluster({
      manager: byManager,
      lead: [],
      product: byProduct,
    });
    expect(top).toEqual({ scope: "product", name: "AD360", code: "Y", lift: 2.5, share: 0.7 });
  });

  it("ignores non-concentrated patterns (lift <= 1)", () => {
    const top = pickHighestCorrelationCluster({
      manager: [{ name: "Flat", dealCount: 8, alertCorrelations: [{ code: "X", share: 0.9, lift: 1.0 }] }],
      lead: [],
      product: [],
    });
    expect(top).toBeNull();
  });

  it("ignores groups below the deal-count floor or share floor", () => {
    const top = pickHighestCorrelationCluster({
      manager: [{ name: "Small", dealCount: 2, alertCorrelations: [{ code: "X", share: 0.9, lift: 9 }] }],
      lead: [{ name: "LowShare", dealCount: 9, alertCorrelations: [{ code: "Y", share: 0.2, lift: 9 }] }],
      product: [],
    });
    expect(top).toBeNull();
  });
});

describe("computeDealRisk with a custom config", () => {
  const customConfig: PortfolioMetricsConfig = {
    healthBase: { GREEN: 0, YELLOW: 50, RED: 100 },
    alertBumpCap: 10,
    alertBumpPerWeight: 0.5,
    minConfidenceDeals: 5,
    significantLift: 2.0,
    clusterMinShare: 0.75,
    clusterMinDeals: 5,
  };

  it("uses the custom health-base and bump values instead of the defaults", () => {
    expect(computeDealRisk({ healthStatus: "GREEN", maxActiveAlertWeight: 0 }, customConfig)).toBe(0);
    // RED base 100 + min(10, 90*0.5=45) => 110 -> clamped to 100
    expect(computeDealRisk({ healthStatus: "RED", maxActiveAlertWeight: 90 }, customConfig)).toBe(100);
  });

  it("defaults to DEFAULT_PORTFOLIO_CONFIG when no config is passed (unchanged behavior)", () => {
    expect(computeDealRisk({ healthStatus: "GREEN", maxActiveAlertWeight: 0 })).toBe(10);
    expect(DEFAULT_PORTFOLIO_CONFIG.healthBase.GREEN).toBe(10);
    expect(DEFAULT_PORTFOLIO_CONFIG.alertBumpCap).toBe(25);
  });

  it("buildRiskCells honors a custom minConfidenceDeals", () => {
    const recs = [rec(), rec(), rec()]; // 3 deals
    const cellsDefault = buildRiskCells(recs, "accountManager");
    expect(cellsDefault[0].lowConfidence).toBe(false); // default minConfidenceDeals=3, 3 >= 3
    const cellsCustom = buildRiskCells(recs, "accountManager", customConfig);
    expect(cellsCustom[0].lowConfidence).toBe(true); // custom minConfidenceDeals=5, 3 < 5
  });

  it("significantCodes honors a custom lift/share/deal-count threshold", () => {
    const groups: GroupCorrelation[] = [
      { name: "Alice", dealCount: 4, alertCorrelations: [{ code: "GHOST_PIPELINE", share: 0.6, lift: 1.8 }] },
    ];
    // Default (lift>=1.5, share>=0.5, dealCount>=3): matches.
    expect(significantCodes(groups).has("GHOST_PIPELINE")).toBe(true);
    // Custom requires lift>=2.0: does not match.
    expect(significantCodes(groups, customConfig).has("GHOST_PIPELINE")).toBe(false);
  });
});
