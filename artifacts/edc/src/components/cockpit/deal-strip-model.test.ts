import { describe, it, expect } from "vitest";
import { groupDeals, visualOrder, groupForDeal, type StripDeal } from "./deal-strip-model";

function deal(p: Partial<StripDeal> & { id: string }): StripDeal {
  return { salesStage: "Discovery", calculatedTCV: 100, ...p };
}

describe("groupDeals", () => {
  it("classifies by sales stage; non-terminal and missing stages are open", () => {
    const groups = groupDeals([
      deal({ id: "won", salesStage: "Closed-Won" }),
      deal({ id: "wonalt", salesStage: "closed won" }),
      deal({ id: "lost", salesStage: "Closed-Lost" }),
      deal({ id: "lostalt", salesStage: "closedlost" }),
      deal({ id: "disc", salesStage: "Discovery" }),
      deal({ id: "nullstage", salesStage: null }),
      deal({ id: "undefstage", salesStage: undefined }),
    ]);
    expect(groups.won.map((d) => d.id)).toEqual(["won", "wonalt"]);
    expect(groups.lost.map((d) => d.id)).toEqual(["lost", "lostalt"]);
    expect(groups.open.map((d) => d.id).sort()).toEqual(
      ["disc", "nullstage", "undefstage"].sort(),
    );
  });

  it("sorts each bucket by TCV descending, treating null TCV as 0", () => {
    const groups = groupDeals([
      deal({ id: "lo", salesStage: "Discovery", calculatedTCV: 50 }),
      deal({ id: "hi", salesStage: "Discovery", calculatedTCV: 900 }),
      deal({ id: "nul", salesStage: "Discovery", calculatedTCV: null }),
      deal({ id: "mid", salesStage: "Discovery", calculatedTCV: 300 }),
    ]);
    expect(groups.open.map((d) => d.id)).toEqual(["hi", "mid", "lo", "nul"]);
  });

  it("returns three empty arrays for empty input", () => {
    expect(groupDeals([])).toEqual({ open: [], won: [], lost: [] });
  });
});

describe("visualOrder", () => {
  it("returns open deals for the open group", () => {
    const groups = groupDeals([
      deal({ id: "a", salesStage: "Discovery", calculatedTCV: 10 }),
      deal({ id: "b", salesStage: "Validation", calculatedTCV: 20 }),
    ]);
    expect(visualOrder(groups, "open").map((d) => d.id)).toEqual(["b", "a"]);
  });

  it("fans Won (TCV desc) then Lost (TCV desc) for the closed group, never mixing", () => {
    const groups = groupDeals([
      deal({ id: "w1", salesStage: "Closed-Won", calculatedTCV: 100 }),
      deal({ id: "w2", salesStage: "Closed-Won", calculatedTCV: 500 }),
      deal({ id: "l1", salesStage: "Closed-Lost", calculatedTCV: 800 }),
      deal({ id: "l2", salesStage: "Closed-Lost", calculatedTCV: 200 }),
      deal({ id: "open", salesStage: "Discovery" }),
    ]);
    expect(visualOrder(groups, "closed").map((d) => d.id)).toEqual([
      "w2",
      "w1",
      "l1",
      "l2",
    ]);
  });
});

describe("groupForDeal", () => {
  const groups = groupDeals([
    deal({ id: "o", salesStage: "Discovery" }),
    deal({ id: "w", salesStage: "Closed-Won" }),
    deal({ id: "l", salesStage: "Closed-Lost" }),
  ]);

  it("maps ids to their group and returns null for unknown ids", () => {
    expect(groupForDeal(groups, "o")).toBe("open");
    expect(groupForDeal(groups, "w")).toBe("closed");
    expect(groupForDeal(groups, "l")).toBe("closed");
    expect(groupForDeal(groups, "missing")).toBeNull();
  });
});
