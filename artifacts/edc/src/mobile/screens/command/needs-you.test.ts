import { describe, expect, it } from "vitest";
import type { MissionItem } from "../../../lib/mission/priority-scorer";
import { DEAL_PANELS } from "../../nav/routes";
import { buildNeedsYou, PANEL_FOR_KIND, type NeedAlertInput } from "./needs-you";

function alert(dealId: string, code = "STALLED_TECHNICAL_VALIDATION"): NeedAlertInput {
  return {
    dealId,
    dealName: `Deal ${dealId}`,
    tcv: 1000,
    alert: { code, message: `${code}: the technical track has not moved in 21 days` },
  };
}

function mission(
  dealId: string,
  category: MissionItem["category"],
  label = `Deal ${dealId}: do the thing`,
): MissionItem {
  return {
    id: `${category}-${dealId}`,
    dealId,
    dealName: `Deal ${dealId}`,
    label,
    meta: "due today",
    category,
    navigateTo: `/deals/${dealId}`,
  };
}

describe("PANEL_FOR_KIND", () => {
  it("only names panels that exist", () => {
    // The whole value of this module is that a row lands on the screen that
    // resolves it. A typo here produces a row that navigates into the shell's
    // 404 — which looks like a broken app, not a broken mapping.
    const panelIds = new Set(DEAL_PANELS.map((p) => p.id));
    for (const panel of Object.values(PANEL_FOR_KIND)) {
      expect(panelIds.has(panel), panel).toBe(true);
    }
  });
});

describe("buildNeedsYou", () => {
  it("routes each kind to the panel that fixes it, not to the deal", () => {
    const rows = buildNeedsYou(
      [alert("a")],
      [mission("b", "overdue"), mission("c", "playbook")],
      { limit: 5 },
    );
    expect(rows.map((r) => r.href)).toEqual([
      "/deals/a/alerts",
      "/deals/b/decisions",
      "/deals/c/playbook",
    ]);
    // …and specifically NOT the mission item's own navigateTo, which is the
    // deal root and is what the desktop widgets use.
    expect(rows.every((r) => r.href !== `/deals/${r.dealId}`)).toBe(true);
  });

  it("sends a near close to the stage screen", () => {
    const [row] = buildNeedsYou([], [mission("d", "close")]);
    expect(row.kind).toBe("close");
    expect(row.href).toBe("/deals/d/stage");
  });

  it("puts alerts above everything the mission ranked", () => {
    const rows = buildNeedsYou(
      [alert("z")],
      [mission("a", "overdue"), mission("b", "due")],
      { limit: 3 },
    );
    expect(rows[0].kind).toBe("alert");
    expect(rows[0].tone).toBe("critical");
  });

  it("preserves the mission's own order below the alerts", () => {
    const rows = buildNeedsYou(
      [],
      [mission("a", "overdue"), mission("b", "playbook"), mission("c", "close")],
      { limit: 3 },
    );
    expect(rows.map((r) => r.dealId)).toEqual(["a", "b", "c"]);
  });

  it("shows three rows by default", () => {
    const rows = buildNeedsYou(
      [alert("a"), alert("b"), alert("c"), alert("d")],
      [mission("e", "overdue")],
    );
    expect(rows).toHaveLength(3);
  });

  it("never offers the same destination twice", () => {
    // Two mission items on one deal's playbook resolve to one screen. Two rows
    // that do exactly the same thing waste a third of a three-row list.
    const rows = buildNeedsYou(
      [],
      [
        mission("a", "playbook", "Deal a: step 1"),
        mission("a", "playbook", "Deal a: step 2"),
        mission("b", "overdue"),
      ],
      { limit: 3 },
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.href)).toEqual(["/deals/a/playbook", "/deals/b/decisions"]);
  });

  it("stops one deal from taking the whole list", () => {
    const rows = buildNeedsYou(
      [alert("hot")],
      [mission("hot", "overdue"), mission("hot", "playbook"), mission("cold", "due")],
      { limit: 3 },
    );
    expect(rows.filter((r) => r.dealId === "hot")).toHaveLength(2);
    expect(rows[2].dealId).toBe("cold");
  });

  it("still fills the list from one deal when there is nothing else", () => {
    const rows = buildNeedsYou(
      [alert("solo")],
      [mission("solo", "overdue"), mission("solo", "playbook")],
      { limit: 3, maxPerDeal: 3 },
    );
    expect(rows).toHaveLength(3);
  });

  it("strips the engine's shouted prefix from the alert body", () => {
    const [row] = buildNeedsYou([alert("a", "MISSING_ECONOMIC_BUYER")], []);
    expect(row.title).toBe("Deal a: Missing Economic Buyer");
    expect(row.meta).toBe("the technical track has not moved in 21 days");
  });

  it("returns an empty list rather than a placeholder row", () => {
    expect(buildNeedsYou([], [])).toEqual([]);
  });

  it("marks overdue work critical and merely-due work caution", () => {
    const rows = buildNeedsYou([], [mission("a", "overdue"), mission("b", "due")], { limit: 3 });
    expect(rows[0].tone).toBe("critical");
    expect(rows[1].tone).toBe("caution");
  });
});
