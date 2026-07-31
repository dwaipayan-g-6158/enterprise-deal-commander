import { describe, it, expect } from "vitest";
import {
  computeDealRisk,
  buildRiskCells,
  diversificationIndex,
  correlatedExposureTcv,
  significantCodes,
  recurringActiveCodes,
  pickHighestCorrelationCluster,
  normalizePerson,
  UNASSIGNED,
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

describe("normalizePerson", () => {
  it("returns the name as-is if already clean", () => {
    expect(normalizePerson("Alice")).toBe("Alice");
  });

  it("trims trailing whitespace", () => {
    expect(normalizePerson("Alice ")).toBe("Alice");
  });

  it("trims leading whitespace", () => {
    expect(normalizePerson(" Alice")).toBe("Alice");
  });

  it("trims both leading and trailing whitespace", () => {
    expect(normalizePerson("  Alice  ")).toBe("Alice");
  });

  it("folds a whitespace-only string to UNASSIGNED", () => {
    expect(normalizePerson("   ")).toBe(UNASSIGNED);
  });

  it("folds an empty string to UNASSIGNED", () => {
    expect(normalizePerson("")).toBe(UNASSIGNED);
  });

  it("folds null to UNASSIGNED", () => {
    expect(normalizePerson(null)).toBe(UNASSIGNED);
  });

  it("folds undefined to UNASSIGNED", () => {
    expect(normalizePerson(undefined)).toBe(UNASSIGNED);
  });

  it("does NOT case-fold — alice and Alice stay distinct", () => {
    expect(normalizePerson("alice")).toBe("alice");
    expect(normalizePerson("Alice")).toBe("Alice");
    expect(normalizePerson("alice")).not.toBe(normalizePerson("Alice"));
  });

  it("is idempotent", () => {
    const value = "  Alice  ";
    const once = normalizePerson(value);
    const twice = normalizePerson(once);
    expect(twice).toBe(once);
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

  it("merges trailing/leading whitespace variants into one cell", () => {
    const records = [
      rec({ dealId: "a", accountManager: "Alice ", products: ["AD360"] }),
      rec({ dealId: "b", accountManager: "Alice", products: ["AD360"] }),
    ];
    const cells = buildRiskCells(records, "accountManager");
    expect(cells).toHaveLength(1);
    const cell = cells[0];
    expect(cell.person).toBe("Alice");
    expect(cell.dealCount).toBe(2);
    expect(cell.deals.map((d) => d.id).sort()).toEqual(["a", "b"]);
  });
});

describe("diversificationIndex", () => {
  it("returns 1 for an empty portfolio", () => {
    // hits the `total <= 0` early return (n <= 1 would also return 1 here,
    // but there are zero cells so n === 0 never reaches that branch).
    expect(diversificationIndex([])).toBe(1);
  });

  it("returns 1 for a single cell — nothing to be concentrated against", () => {
    const cells = buildRiskCells(
      [rec({ healthStatus: "RED", maxActiveAlertWeight: 80 })],
      "accountManager",
    );
    expect(diversificationIndex(cells)).toBe(1);
  });

  it("scores a perfectly even 2-cell portfolio 1.0 (raw HHI capped it at 0.5)", () => {
    const even = buildRiskCells(
      [
        rec({ dealId: "a", accountManager: "Alice", products: ["AD360"], healthStatus: "RED", maxActiveAlertWeight: 80 }),
        rec({ dealId: "b", accountManager: "Bob", products: ["Log360"], healthStatus: "RED", maxActiveAlertWeight: 80 }),
      ],
      "accountManager",
    );
    // D_raw = 1 - (0.5^2 + 0.5^2) = 0.5, normalized: 0.5 * 2/(2-1) = 1.0.
    // This is the exact regression the normalization fixes: the un-normalized
    // formula capped an evenly-spread 2-cell portfolio at 0.5, which read as
    // "concentrated" under the frontend's threshold even though nothing was.
    expect(diversificationIndex(even)).toBeCloseTo(1, 5);
  });

  it("drops toward 0 when one of several cells holds nearly all risk", () => {
    const cells = buildRiskCells(
      [
        ...Array.from({ length: 6 }, (_, i) =>
          rec({
            dealId: `a${i}`,
            accountManager: "Alice",
            products: ["AD360"],
            healthStatus: "RED",
            maxActiveAlertWeight: 80,
          }),
        ),
        rec({ dealId: "b", accountManager: "Bob", products: ["AD360"], healthStatus: "GREEN", maxActiveAlertWeight: 0 }),
        rec({ dealId: "c", accountManager: "Carol", products: ["AD360"], healthStatus: "GREEN", maxActiveAlertWeight: 0 }),
        rec({ dealId: "d", accountManager: "Dave", products: ["AD360"], healthStatus: "GREEN", maxActiveAlertWeight: 0 }),
      ],
      "accountManager",
    );
    // Alice: riskScore 95 (RED base 75 + min(25, 80*0.25=20)), dealCount 6 => weight 570
    // Bob/Carol/Dave: riskScore 10 (GREEN base, no alert), dealCount 1 each => weight 10 each
    // total = 570 + 10 + 10 + 10 = 600
    // shares: Alice 570/600 = 0.95, others 10/600 = 1/60 each
    // hhi = 0.95^2 + 3*(1/60)^2 = 0.9025 + 0.000833... = 0.903333...
    // D_raw = 1 - 0.903333... = 0.096667...
    // n=4 => normalize by 4/(4-1) = 4/3: D = 0.096667 * 4/3 = 0.128889 (29/225)
    expect(diversificationIndex(cells)).toBeCloseTo(0.128889, 5);
  });

  it("reaches 1.0 for a perfectly even 3-cell portfolio", () => {
    const even3 = buildRiskCells(
      [
        rec({ dealId: "a", accountManager: "Alice", products: ["AD360"], healthStatus: "RED", maxActiveAlertWeight: 80 }),
        rec({ dealId: "b", accountManager: "Bob", products: ["AD360"], healthStatus: "RED", maxActiveAlertWeight: 80 }),
        rec({ dealId: "c", accountManager: "Carol", products: ["AD360"], healthStatus: "RED", maxActiveAlertWeight: 80 }),
      ],
      "accountManager",
    );
    // three equal-weight cells => shares 1/3 each
    // hhi = 3*(1/3)^2 = 1/3, D_raw = 1 - 1/3 = 2/3
    // n=3 => normalize by 3/(3-1) = 3/2: D = 2/3 * 3/2 = 1
    // Guards the specific 0.667-vs-0.66-adjacent false-red the raw formula produced.
    expect(diversificationIndex(even3)).toBeCloseTo(1, 5);
  });

  it("is monotonically decreasing in concentration at a fixed cell count", () => {
    // At n=2, with both cells sharing the same per-deal riskScore, weight
    // ratio == dealCount ratio, so D reduces to 4*p*(1-p) for share p.
    function splitCells(countA: number, countB: number) {
      const records = [
        ...Array.from({ length: countA }, (_, i) =>
          rec({ dealId: `a${i}`, accountManager: "Alice", products: ["AD360"], healthStatus: "RED", maxActiveAlertWeight: 80 }),
        ),
        ...Array.from({ length: countB }, (_, i) =>
          rec({ dealId: `b${i}`, accountManager: "Bob", products: ["AD360"], healthStatus: "RED", maxActiveAlertWeight: 80 }),
        ),
      ];
      return buildRiskCells(records, "accountManager");
    }

    const fiftyFifty = splitCells(1, 1); // p=0.5 => D = 4*0.5*0.5 = 1.0
    const ninetyTen = splitCells(9, 1); // p=0.9 => D = 4*0.9*0.1 = 0.36
    const ninetyNineOne = splitCells(99, 1); // p=0.99 => D = 4*0.99*0.01 = 0.0396

    expect(diversificationIndex(fiftyFifty)).toBeCloseTo(1, 5);
    expect(diversificationIndex(ninetyTen)).toBeCloseTo(0.36, 5);
    expect(diversificationIndex(ninetyNineOne)).toBeCloseTo(0.0396, 5);

    expect(diversificationIndex(fiftyFifty)).toBeGreaterThan(diversificationIndex(ninetyTen));
    expect(diversificationIndex(ninetyTen)).toBeGreaterThan(diversificationIndex(ninetyNineOne));
  });

  it("stays within [0, 1]", () => {
    // Extreme 999:1 dealCount split with equal per-deal riskScore => p=0.999
    const records = [
      ...Array.from({ length: 999 }, (_, i) =>
        rec({ dealId: `a${i}`, accountManager: "Alice", products: ["AD360"], healthStatus: "RED", maxActiveAlertWeight: 80 }),
      ),
      rec({ dealId: "b", accountManager: "Bob", products: ["AD360"], healthStatus: "RED", maxActiveAlertWeight: 80 }),
    ];
    const cells = buildRiskCells(records, "accountManager");
    // D = 4*p*(1-p) = 4*0.999*0.001 = 0.003996
    const d = diversificationIndex(cells);
    expect(d).toBeCloseTo(0.003996, 5);
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThanOrEqual(1);
  });

  it("treats a zero-weight sibling cell as a real bucket, not noise", () => {
    // Custom config so a GREEN deal has a genuine riskScore (and thus weight) of 0,
    // rather than the DEFAULT_PORTFOLIO_CONFIG healthBase.GREEN = 10.
    const zeroGreenConfig: PortfolioMetricsConfig = {
      ...DEFAULT_PORTFOLIO_CONFIG,
      healthBase: { ...DEFAULT_PORTFOLIO_CONFIG.healthBase, GREEN: 0 },
    };
    const cells = buildRiskCells(
      [
        rec({ dealId: "a", accountManager: "Alice", products: ["AD360"], healthStatus: "RED", maxActiveAlertWeight: 80 }),
        rec({ dealId: "b", accountManager: "Bob", products: ["AD360"], healthStatus: "GREEN", maxActiveAlertWeight: 0 }),
      ],
      "accountManager",
      zeroGreenConfig,
    );
    // Alice: riskScore 95 (RED base 75 + min(25, 80*0.25=20)), dealCount 1 => weight 95
    // Bob: riskScore 0 (GREEN base overridden to 0, no alert bump), dealCount 1 => weight 0
    // total = 95, shares: Alice 95/95 = 1, Bob 0/95 = 0
    // hhi = 1^2 + 0^2 = 1, D_raw = 1 - 1 = 0
    // n=2 (Bob's zero-weight cell still counts!) => normalize by 2/(2-1) = 2: D = 0 * 2 = 0
    //
    // If zero-weight cells were filtered out of n before this computation, n
    // would collapse to 1 (just Alice) and hit the n<=1 branch, reporting 1.0
    // ("perfectly diversified") for a portfolio where one cell holds 100% of
    // the risk — exactly wrong. Using cells.length keeps Bob's empty bucket
    // in the denominator, so the result correctly reads as concentrated (0).
    expect(diversificationIndex(cells)).toBeCloseTo(0, 5);
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
