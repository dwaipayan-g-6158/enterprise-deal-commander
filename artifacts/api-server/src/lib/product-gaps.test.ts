import { describe, it, expect } from "vitest";
import { clusterProductGaps, type GapMemory, type GapBlocker, type CatalogEntry } from "./product-gaps";

const CATALOG: CatalogEntry[] = [
  { id: "p1", productName: "ADAudit Plus", code: "ADAUDIT_PLUS" },
  { id: "p2", productName: "Log360", code: "LOG360" },
];

describe("clusterProductGaps", () => {
  it("clusters autopsy gaps case-insensitively and sums lost TCV per distinct deal", () => {
    const mems: GapMemory[] = [
      { dealId: "d1", dealName: "Deal 1", finalTcv: 100, productGaps: ["SSO support", "sso support"] },
      { dealId: "d2", dealName: "Deal 2", finalTcv: 250, productGaps: ["SSO Support"] },
    ];
    const clusters = clusterProductGaps(mems, [], CATALOG);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].dealCount).toBe(2);
    expect(clusters[0].lostTcv).toBe(350); // d1 counted once despite duplicate gap
    expect(clusters[0].openBlockerCount).toBe(0);
  });

  it("folds a matching unresolved blocker into an existing cluster", () => {
    const mems: GapMemory[] = [{ dealId: "d1", dealName: "Deal 1", finalTcv: 100, productGaps: ["Log360 scale"] }];
    const blockers: GapBlocker[] = [
      { dealId: "d2", dealName: "Deal 2", description: "Log360 scale ceiling at 5k EPS", tcv: 400 },
      { dealId: "d3", dealName: "Deal 3", description: "unrelated legal delay", tcv: 999 },
    ];
    const clusters = clusterProductGaps(mems, blockers, CATALOG);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].openBlockerCount).toBe(1); // only the matching blocker
    expect(clusters[0].dealCount).toBe(2); // d1 (autopsy) + d2 (blocker)
    expect(clusters[0].productName).toBe("Log360"); // fuzzy-mapped by name containment
  });

  it("maps to a catalog product by name containment, null when no match", () => {
    const mems: GapMemory[] = [
      { dealId: "d1", dealName: "D1", finalTcv: 0, productGaps: ["ADAudit Plus reporting"] },
      { dealId: "d2", dealName: "D2", finalTcv: 0, productGaps: ["mobile app"] },
    ];
    const clusters = clusterProductGaps(mems, [], CATALOG);
    const byLabel = Object.fromEntries(clusters.map((c) => [c.label, c.productId]));
    expect(byLabel["ADAudit Plus reporting"]).toBe("p1");
    expect(byLabel["mobile app"]).toBeNull();
  });

  it("sorts clusters by lost TCV desc", () => {
    const mems: GapMemory[] = [
      { dealId: "d1", dealName: "D1", finalTcv: 50, productGaps: ["small gap"] },
      { dealId: "d2", dealName: "D2", finalTcv: 900, productGaps: ["big gap"] },
    ];
    expect(clusterProductGaps(mems, [], CATALOG).map((c) => c.label)).toEqual(["big gap", "small gap"]);
  });

  it("returns empty when there are no autopsy gaps (blockers alone don't cluster)", () => {
    const blockers: GapBlocker[] = [{ dealId: "d1", dealName: "D1", description: "some blocker", tcv: 100 }];
    expect(clusterProductGaps([], blockers, CATALOG)).toEqual([]);
  });
});
