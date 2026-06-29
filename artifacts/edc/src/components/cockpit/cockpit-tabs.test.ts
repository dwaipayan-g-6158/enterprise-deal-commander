import { describe, it, expect } from "vitest";
import { COCKPIT_GROUPS, groupForSub, alertCount, managedAlertCount } from "./cockpit-tabs";

describe("cockpit-tabs", () => {
  it("defines exactly 5 primary groups", () => {
    expect(COCKPIT_GROUPS.map((g) => g.id)).toEqual([
      "risk", "validation", "intel", "commercial", "record",
    ]);
  });

  it("covers all 13 panel sub-tabs exactly once", () => {
    const subs = COCKPIT_GROUPS.flatMap((g) => g.subs.map((s) => s.id)).sort();
    expect(subs).toEqual([
      "activity", "blockers", "coaching", "competitive", "crosssell",
      "decisions", "history", "pricing", "playbook", "risk", "score",
      "stakeholders", "technical",
    ].sort());
  });

  it("maps a sub id back to its group", () => {
    expect(groupForSub("score")).toBe("intel");
    expect(groupForSub("risk")).toBe("risk");
    expect(groupForSub("nope")).toBeUndefined();
  });

  it("counts only RED alerts", () => {
    expect(alertCount([{ severity: "RED" }, { severity: "YELLOW" }, { severity: "RED" }])).toBe(2);
    expect(alertCount([])).toBe(0);
    expect(alertCount(undefined)).toBe(0);
  });

  it("managedAlertCount counts alerts with a non-null disposition", () => {
    expect(managedAlertCount([
      { disposition: { state: "snoozed" } },
      { disposition: null },
      { disposition: { state: "accepted" } },
      { disposition: undefined },
    ])).toBe(2);
    expect(managedAlertCount([])).toBe(0);
    expect(managedAlertCount(undefined)).toBe(0);
  });
});
