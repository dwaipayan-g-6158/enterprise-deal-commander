import { describe, expect, it } from "vitest";
import { DEAL_PANELS } from "../../nav/routes";
import { buildBriefActions, panelForActionSource, type BriefActionInput } from "./brief-actions";

function action(overrides: Partial<BriefActionInput> = {}): BriefActionInput {
  return { source: "PATTERN", priority: "HIGH", action: "Do the thing", ...overrides };
}

describe("panelForActionSource", () => {
  it("sends each source to the screen where the work happens", () => {
    expect(panelForActionSource("STAGE_GUARDRAIL")).toBe("stage");
    expect(panelForActionSource("PATTERN")).toBe("alerts");
    expect(panelForActionSource("DIMENSION")).toBe("score");
  });

  it("lands an unknown source somewhere real", () => {
    // The contract lists three sources today. A fourth arriving from the server
    // must not produce a row that navigates nowhere.
    const panelIds = new Set(DEAL_PANELS.map((p) => p.id));
    expect(panelIds.has(panelForActionSource("SOMETHING_NEW"))).toBe(true);
  });

  it("only ever names panels that exist", () => {
    const panelIds = new Set(DEAL_PANELS.map((p) => p.id));
    for (const source of ["STAGE_GUARDRAIL", "PATTERN", "DIMENSION"]) {
      expect(panelIds.has(panelForActionSource(source)), source).toBe(true);
    }
  });
});

describe("buildBriefActions", () => {
  it("ranks by priority", () => {
    const rows = buildBriefActions([
      action({ priority: "LOW", action: "low" }),
      action({ priority: "BLOCKER", action: "blocker" }),
      action({ priority: "MEDIUM", action: "medium" }),
    ]);
    expect(rows.map((r) => r.action)).toEqual(["blocker", "medium", "low"]);
  });

  it("keeps the engine's order within one priority", () => {
    const rows = buildBriefActions([
      action({ priority: "HIGH", action: "first", patternCode: "A" }),
      action({ priority: "HIGH", action: "second", patternCode: "B" }),
      action({ priority: "HIGH", action: "third", patternCode: "C" }),
    ]);
    expect(rows.map((r) => r.action)).toEqual(["first", "second", "third"]);
  });

  it("shows three, because the full list is one tap away", () => {
    const rows = buildBriefActions(
      Array.from({ length: 9 }, (_, i) => action({ patternCode: `P${i}` })),
    );
    expect(rows).toHaveLength(3);
  });

  it("marks the one priority with a server-side consequence", () => {
    const [blocker, critical] = buildBriefActions([
      action({ priority: "BLOCKER" }),
      action({ priority: "CRITICAL" }),
    ]);
    expect(blocker.blocking).toBe(true);
    expect(critical.blocking).toBe(false);
  });

  it("gives two actions with identical text distinct ids", () => {
    // Two dimensions can recommend the same sentence. Keying a list on the text
    // would collapse them into one row and drop real work.
    const rows = buildBriefActions([
      action({ source: "DIMENSION", dimension: "Commercial", action: "Same words" }),
      action({ source: "DIMENSION", dimension: "Technical", action: "Same words" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).not.toBe(rows[1].id);
  });

  it("survives a missing or malformed payload", () => {
    expect(buildBriefActions(undefined)).toEqual([]);
    expect(buildBriefActions([])).toEqual([]);
    // recommendedActions is part of an open payload; a non-array must not throw
    // on a screen whose whole job is to be readable in the field.
    expect(buildBriefActions(null as unknown as BriefActionInput[])).toEqual([]);
  });

  it("sorts an unknown priority to the bottom rather than the top", () => {
    const rows = buildBriefActions([
      action({ priority: "WHATEVER", action: "unknown", patternCode: "A" }),
      action({ priority: "LOW", action: "low", patternCode: "B" }),
    ]);
    expect(rows.map((r) => r.action)).toEqual(["low", "unknown"]);
  });
});
