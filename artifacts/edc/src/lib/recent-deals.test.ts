import { describe, it, expect } from "vitest";
import { readRecentDeals, recordDealVisit } from "./recent-deals";
import type { KeyValueStore } from "@/lib/storage";

function fakeStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = { ...initial };
  return {
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe("recordDealVisit", () => {
  it("adds a new deal to the front", () => {
    const store = fakeStore();
    recordDealVisit(
      store,
      { dealId: "d1", dealName: "Acme", stageName: "Validation" },
      new Date("2026-07-21T10:00:00Z"),
    );
    expect(readRecentDeals(store)).toEqual([
      {
        dealId: "d1",
        dealName: "Acme",
        stageName: "Validation",
        visitedAt: "2026-07-21T10:00:00.000Z",
      },
    ]);
  });

  it("moves a re-visited deal to the front instead of duplicating it", () => {
    const store = fakeStore();
    recordDealVisit(
      store,
      { dealId: "d1", dealName: "Acme", stageName: "Validation" },
      new Date("2026-07-21T10:00:00Z"),
    );
    recordDealVisit(
      store,
      { dealId: "d2", dealName: "NovaTech", stageName: "Commercial" },
      new Date("2026-07-21T11:00:00Z"),
    );
    recordDealVisit(
      store,
      { dealId: "d1", dealName: "Acme", stageName: "Procurement" },
      new Date("2026-07-21T12:00:00Z"),
    );
    const result = readRecentDeals(store);
    expect(result).toHaveLength(2);
    expect(result[0].dealId).toBe("d1");
    expect(result[0].stageName).toBe("Procurement");
    expect(result[1].dealId).toBe("d2");
  });

  it("caps the list at 5 entries, most recent first", () => {
    const store = fakeStore();
    for (let i = 0; i < 7; i++) {
      recordDealVisit(
        store,
        { dealId: `d${i}`, dealName: `Deal ${i}`, stageName: "Discovery" },
        new Date(2026, 6, 21, i),
      );
    }
    const result = readRecentDeals(store);
    expect(result).toHaveLength(5);
    expect(result[0].dealId).toBe("d6");
  });

  it("returns an empty array for corrupted JSON", () => {
    const store = fakeStore({ "edc.recentDeals": "{not json" });
    expect(readRecentDeals(store)).toEqual([]);
  });
});
