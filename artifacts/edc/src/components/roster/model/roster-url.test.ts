import { describe, it, expect } from "vitest";
import { DEFAULT_FILTERS, DEFAULT_SORT, type RosterView } from "./roster-types";
import { decodeRosterUrl, encodeRosterUrl, encodeSort, decodeSort, isDefaultView } from "./roster-url";
import { COLUMNS } from "./roster-columns";

const defaultView: RosterView = { filters: DEFAULT_FILTERS, sort: DEFAULT_SORT, group: "none" };

describe("encode/decode round-trip", () => {
  it("encodes nothing for the default view", () => {
    expect(encodeRosterUrl(defaultView)).toBe("");
    expect(isDefaultView(defaultView)).toBe(true);
  });

  it("round-trips a rich view", () => {
    const view: RosterView = {
      filters: {
        ...DEFAULT_FILTERS,
        search: "atlas",
        state: "archived",
        stage: ["Negotiation", "Closing"],
        health: ["RED", "YELLOW"],
        velocity: ["STALLED"],
        tcvMin: 1000,
        scoreMax: 80,
        closePreset: "30d",
        accountManager: ["Dana"],
        hasCompetitors: true,
        committed: false,
      },
      sort: [
        { key: "calculatedTCV", dir: "desc" },
        { key: "score", dir: "asc" },
      ],
      group: "salesStage",
    };
    const qs = encodeRosterUrl(view, "red-alerts");
    const decoded = decodeRosterUrl(qs);
    expect(decoded.viewId).toBe("red-alerts");
    expect(decoded.view).toEqual(view);
  });

  it("omits defaults from the query string", () => {
    const qs = encodeRosterUrl({ ...defaultView, filters: { ...DEFAULT_FILTERS, search: "x" } });
    expect(qs).toBe("q=x");
  });

  it("drops the default sort but keeps a non-default one", () => {
    expect(encodeRosterUrl(defaultView).includes("so=")).toBe(false);
    const qs = encodeRosterUrl({ ...defaultView, sort: [{ key: "score", dir: "asc" }] });
    expect(qs).toContain("so=score");
  });

  it("ignores unknown enum values when decoding", () => {
    const decoded = decodeRosterUrl("st=bogus&h=PURPLE,RED&g=nope");
    expect(decoded.view.filters.state).toBe("active");
    expect(decoded.view.filters.health).toEqual(["RED"]);
    expect(decoded.view.group).toBe("none");
  });

  it("tolerates a leading ?", () => {
    expect(decodeRosterUrl("?q=hi").view.filters.search).toBe("hi");
  });

  it("ignores the removed `blk` (hasBlockers) param — dead filter surface, no UI, never applied", () => {
    const decoded = decodeRosterUrl("blk=1");
    expect(decoded.view.filters).not.toHaveProperty("hasBlockers");
    expect(decoded.view).toEqual(defaultView);
  });
});

describe("closure codec", () => {
  it("omits the default (open) from the query string", () => {
    expect(encodeRosterUrl(defaultView).includes("cl=")).toBe(false);
  });

  it("round-trips closed and all", () => {
    const closed = encodeRosterUrl({ ...defaultView, filters: { ...DEFAULT_FILTERS, closure: "closed" } });
    expect(closed).toBe("cl=closed");
    expect(decodeRosterUrl(closed).view.filters.closure).toBe("closed");

    const all = encodeRosterUrl({ ...defaultView, filters: { ...DEFAULT_FILTERS, closure: "all" } });
    expect(all).toBe("cl=all");
    expect(decodeRosterUrl(all).view.filters.closure).toBe("all");
  });

  it("falls back to open for a missing or invalid cl param", () => {
    expect(decodeRosterUrl("").view.filters.closure).toBe("open");
    expect(decodeRosterUrl("cl=bogus").view.filters.closure).toBe("open");
  });
});

describe("sort codec", () => {
  it("uses a - prefix for desc", () => {
    expect(encodeSort([{ key: "calculatedTCV", dir: "desc" }])).toBe("-calculatedTCV");
    expect(encodeSort([{ key: "score", dir: "asc" }])).toBe("score");
  });

  it("decodes multi-key sort and skips unknown keys", () => {
    expect(decodeSort("-calculatedTCV,score,bogus")).toEqual([
      { key: "calculatedTCV", dir: "desc" },
      { key: "score", dir: "asc" },
    ]);
  });

  it("round-trips the riskLevel sort key", () => {
    expect(encodeSort([{ key: "riskLevel", dir: "desc" }])).toBe("-riskLevel");
    expect(decodeSort("-riskLevel")).toEqual([{ key: "riskLevel", dir: "desc" }]);
  });

  it("covers every sortable column in COLUMNS (regression: lastActivity was missing)", () => {
    // The bug this guards against: COLUMNS.lastActivity was `sortable: true`
    // and offered by the column customizer, but the internal SORT_KEYS
    // allowlist omitted it. Since the URL is the source of truth, sorting by
    // Last Activity wrote `so=lastActivity`, decodeSort silently dropped the
    // unrecognized key, and the roster fell back to the default TCV sort
    // while the URL still claimed Last Activity was the active sort. Round-
    // tripping every sortable id here means a future sortable column can't
    // omit itself from the allowlist without this test failing.
    const sortableIds = Object.values(COLUMNS)
      .filter((c) => c.sortable)
      .map((c) => c.id);
    expect(sortableIds.length).toBeGreaterThan(0);
    for (const id of sortableIds) {
      const spec = { key: id, dir: "asc" as const };
      expect(decodeSort(encodeSort([spec]))).toEqual([spec]);
    }
  });
});
