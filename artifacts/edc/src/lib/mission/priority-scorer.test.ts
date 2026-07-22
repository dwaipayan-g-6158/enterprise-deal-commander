import { describe, it, expect } from "vitest";
import { buildMission, type NextActionsData } from "./priority-scorer";

function now(): Date {
  return new Date(2026, 6, 22, 9, 0, 0); // 2026-07-22 09:00 local
}

function emptyData(): NextActionsData {
  return { overdue: [], dueThisWeek: [], playbookSteps: [], upcomingCloses: [] };
}

describe("buildMission", () => {
  it("returns [] for empty input", () => {
    expect(buildMission(emptyData(), {}, now())).toEqual([]);
  });

  it("returns [] for null/undefined data", () => {
    expect(buildMission(null, {}, now())).toEqual([]);
    expect(buildMission(undefined, {}, now())).toEqual([]);
  });

  it("orders categories overdue < due < playbook < close", () => {
    const data: NextActionsData = {
      overdue: [
        { id: "o1", dealId: "d1", dealName: "Alpha", action: "Sign redline", dueDate: "2026-07-20T00:00:00Z" },
      ],
      dueThisWeek: [
        { id: "w1", dealId: "d2", dealName: "Beta", action: "Send MSA", dueDate: "2026-07-24T00:00:00Z" },
      ],
      playbookSteps: [
        { dealId: "d3", dealName: "Gamma", playbookName: "Validation", action: "Run POC", stepOrder: 1, totalSteps: 4 },
      ],
      upcomingCloses: [{ id: "d4", dealName: "Delta", daysToClose: 5 }],
    };
    const result = buildMission(data, {}, now());
    expect(result.map((i) => i.category)).toEqual(["overdue", "due", "playbook", "close"]);
  });

  it("breaks ties within a category by deal TCV, higher value first", () => {
    const data: NextActionsData = {
      overdue: [
        { id: "o1", dealId: "small", dealName: "Small Deal", action: "Act A", dueDate: "2026-07-20T00:00:00Z" },
        { id: "o2", dealId: "big", dealName: "Big Deal", action: "Act B", dueDate: "2026-07-20T00:00:00Z" },
      ],
      dueThisWeek: [],
      playbookSteps: [],
      upcomingCloses: [],
    };
    const valueByDealId = { small: 100_000, big: 5_000_000 };
    const result = buildMission(data, valueByDealId, now());
    expect(result.map((i) => i.dealId)).toEqual(["big", "small"]);
  });

  it("breaks remaining ties by due-date recency, earlier due date first", () => {
    const data: NextActionsData = {
      overdue: [
        { id: "o1", dealId: "d1", dealName: "Later", action: "Act A", dueDate: "2026-07-19T00:00:00Z" },
        { id: "o2", dealId: "d2", dealName: "Earlier", action: "Act B", dueDate: "2026-07-15T00:00:00Z" },
      ],
      dueThisWeek: [],
      playbookSteps: [],
      upcomingCloses: [],
    };
    // Same TCV for both deals so the category/TCV dimensions tie out.
    const valueByDealId = { d1: 1_000_000, d2: 1_000_000 };
    const result = buildMission(data, valueByDealId, now());
    expect(result.map((i) => i.dealId)).toEqual(["d2", "d1"]);
  });

  it("breaks ties by days-to-close recency for upcoming closes, sooner first", () => {
    const data: NextActionsData = {
      overdue: [],
      dueThisWeek: [],
      playbookSteps: [],
      upcomingCloses: [
        { id: "far", dealName: "Far Close", daysToClose: 30 },
        { id: "near", dealName: "Near Close", daysToClose: 3 },
      ],
    };
    const result = buildMission(data, { far: 1_000_000, near: 1_000_000 }, now());
    expect(result.map((i) => i.dealId)).toEqual(["near", "far"]);
  });

  it("caps output at the given limit, keeping the highest-priority items", () => {
    const overdue = Array.from({ length: 7 }, (_, i) => ({
      id: `o${i}`,
      dealId: `d${i}`,
      dealName: `Deal ${i}`,
      action: "Do the thing",
      dueDate: "2026-07-20T00:00:00Z",
    }));
    const valueByDealId = Object.fromEntries(overdue.map((o, i) => [o.dealId, 7 - i]));
    const data: NextActionsData = { overdue, dueThisWeek: [], playbookSteps: [], upcomingCloses: [] };
    const result = buildMission(data, valueByDealId, now(), 5);
    expect(result).toHaveLength(5);
    expect(result.map((i) => i.dealId)).toEqual(["d0", "d1", "d2", "d3", "d4"]);
  });

  it("defaults the limit to 5", () => {
    const overdue = Array.from({ length: 8 }, (_, i) => ({
      id: `o${i}`,
      dealId: `d${i}`,
      dealName: `Deal ${i}`,
      action: "Do the thing",
      dueDate: "2026-07-20T00:00:00Z",
    }));
    const data: NextActionsData = { overdue, dueThisWeek: [], playbookSteps: [], upcomingCloses: [] };
    expect(buildMission(data, {}, now())).toHaveLength(5);
  });

  it("derives dealId for upcoming closes from the bucket's id field and deep-links to it", () => {
    const data: NextActionsData = {
      overdue: [],
      dueThisWeek: [],
      playbookSteps: [],
      upcomingCloses: [{ id: "deal-42", dealName: "Zed Corp", daysToClose: 10 }],
    };
    const [item] = buildMission(data, {}, now());
    expect(item.dealId).toBe("deal-42");
    expect(item.navigateTo).toBe("/deals/deal-42");
  });

  it("treats missing TCV lookups as zero without throwing", () => {
    const data: NextActionsData = {
      overdue: [{ id: "o1", dealId: "unknown", dealName: "Ghost", action: "Act", dueDate: "2026-07-20T00:00:00Z" }],
      dueThisWeek: [],
      playbookSteps: [],
      upcomingCloses: [],
    };
    expect(() => buildMission(data, {}, now())).not.toThrow();
  });
});
