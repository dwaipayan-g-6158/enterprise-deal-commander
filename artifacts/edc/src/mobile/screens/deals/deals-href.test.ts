import { describe, expect, it } from "vitest";
import { decodeRosterUrl } from "../../../components/roster/model/roster-url";
import { computeDerivedRows } from "../../../components/roster/model/derive-rows";
import {
  DEFAULT_FILTERS,
  DEFAULT_STALE_STAGE_DAYS,
  type RosterRow,
} from "../../../components/roster/model/roster-types";
import { countActiveFilters, DEALS_LINKS, dealsHref } from "./deals-href";

/** What the Deals screen will actually make of a link. */
function decode(href: string) {
  const [path, query = ""] = href.split("?");
  return { path, ...decodeRosterUrl(query) };
}

describe("dealsHref", () => {
  it("returns the bare path when nothing is filtered", () => {
    expect(dealsHref()).toBe("/deals");
  });

  it("round-trips through the decoder the Deals screen uses", () => {
    // The point of building links through the codec: whatever this writes, the
    // screen can read. A hand-written `?health=RED` would look right and arrive
    // as an unfiltered list, because the decoder's key is `h`.
    const decoded = decode(dealsHref({ health: ["RED"] }));
    expect(decoded.path).toBe("/deals");
    expect(decoded.view.filters.health).toEqual(["RED"]);
  });

  it("carries sort and group through", () => {
    const decoded = decode(
      dealsHref({ velocity: ["STALLED"] }, { sort: [{ key: "score", dir: "asc" }], group: "salesStage" }),
    );
    expect(decoded.view.sort).toEqual([{ key: "score", dir: "asc" }]);
    expect(decoded.view.group).toBe("salesStage");
    expect(decoded.view.filters.velocity).toEqual(["STALLED"]);
  });

  it("leaves untouched filters at their defaults", () => {
    const decoded = decode(dealsHref({ health: ["RED"] }));
    expect(decoded.view.filters.state).toBe("active");
    expect(decoded.view.filters.closure).toBe("open");
    expect(decoded.view.filters.search).toBe("");
    expect(decoded.view.filters.stage).toEqual([]);
  });

  describe("the Command Center's four links", () => {
    it("red opens exactly the red deals", () => {
      const { view } = decode(DEALS_LINKS.red());
      expect(view.filters.health).toEqual(["RED"]);
      expect(view.filters.velocity).toEqual([]);
    });

    it("stalled filters on days-in-stage, not the velocity buckets", () => {
      // It used to send `velocity: ["STALLED", "SLOW"]`. Those buckets are
      // relative to a deal's stage peers, so a deal with no peers has a null
      // benchmark, buckets to NO_DATE and is excluded — while the dashboard
      // figure counts it. The tile read "2" and opened a list reading "0".
      const { view } = decode(DEALS_LINKS.stalled());
      expect(view.filters.velocity).toEqual([]);
      expect(view.filters.staleMinDays).toBe(DEFAULT_STALE_STAGE_DAYS);
      expect(view.sort).toEqual([{ key: "velocity", dir: "desc" }]);
    });

    it("stalled carries the threshold the count was taken with", () => {
      // The live `stale_stage_days` wins over the default, so retuning it in
      // Settings keeps the list and the figure describing the same set.
      const { view } = decode(DEALS_LINKS.stalled(45));
      expect(view.filters.staleMinDays).toBe(45);
    });

    it("closing soon sorts by the date it filters on", () => {
      const { view } = decode(DEALS_LINKS.closingSoon());
      expect(view.filters.closePreset).toBe("30d");
      expect(view.sort).toEqual([{ key: "expectedCloseDate", dir: "asc" }]);
    });

    it("all is the unfiltered pipeline", () => {
      expect(DEALS_LINKS.all()).toBe("/deals");
    });

    it("every link decodes to a view the roster can render", () => {
      for (const [name, build] of Object.entries(DEALS_LINKS)) {
        const { path, view } = decode(build());
        expect(path, name).toBe("/deals");
        // A link that lands on the roster's own default view would be a link
        // that appears to filter and does not — except `all`, which says so.
        const filtered =
          view.filters.health.length > 0 ||
          view.filters.velocity.length > 0 ||
          view.filters.staleMinDays != null ||
          view.filters.closePreset !== "any";
        expect(filtered, name).toBe(name !== "all");
      }
    });
  });
});

describe("the Stalled figure and the list behind it", () => {
  // The exact shape that made this fail in production: a small pipeline holding
  // one open deal per stage. `computeVelocityRows` benchmarks a deal against the
  // MEDIAN OF ITS PEERS, so a deal with no peers gets `benchmarkDays: null` and
  // `velocityStatus: "INSUFFICIENT_DATA"` — which `deriveVelocityBucket` maps to
  // NO_DATE, and NO_DATE is in no velocity filter.
  const ALONE_IN_STAGE = [
    { id: "cobalt", salesStage: "Procurement", daysInStage: 39 },
    { id: "atlas", salesStage: "Commercial", daysInStage: 33 },
    { id: "beacon", salesStage: "Validation", daysInStage: 14 },
  ];

  function rosterRow(p: { id: string; salesStage: string; daysInStage: number }): RosterRow {
    return {
      id: p.id,
      dealName: p.id,
      accountName: "Acct",
      accountManager: "Dana",
      technicalLead: "Lee",
      salesStageId: 1,
      salesStage: p.salesStage,
      productRevenue: 0,
      servicesRevenue: 0,
      dealCurrency: "USD",
      calculatedTCV: 100,
      normalizedTCV: 100,
      healthStatus: "GREEN",
      score: null,
      scoreDelta: null,
      gatesPct: 0,
      daysInStage: p.daysInStage,
      daysSinceLastActivity: null,
      // No peers in stage ⇒ no benchmark ⇒ NO_DATE. This is the whole bug.
      benchmarkDays: null,
      deltaDays: null,
      riskScore: null,
      riskLevel: null,
      velocity: "NO_DATE",
      competitorId: null,
      expectedCloseDate: null,
    } as unknown as RosterRow;
  }

  const rows = ALONE_IN_STAGE.map(rosterRow);
  const NOW = new Date(2026, 5, 27, 12).getTime();

  /** What `computeSummary` counts: absolute days in stage, nothing relative. */
  function serverStaleCount(threshold: number): number {
    return rows.filter((r) => (r.daysInStage ?? 0) > threshold).length;
  }

  it("shows exactly the deals the figure counted", () => {
    const expected = serverStaleCount(DEFAULT_STALE_STAGE_DAYS);
    expect(expected).toBe(2);

    const { view } = decode(DEALS_LINKS.stalled(DEFAULT_STALE_STAGE_DAYS));
    const derived = computeDerivedRows(rows, view, NOW);

    expect(derived.matchedCount).toBe(expected);
    expect(derived.groups.flatMap((g) => g.rows.map((r) => r.id)).sort()).toEqual([
      "atlas",
      "cobalt",
    ]);
  });

  it("agrees with the figure at whatever threshold is configured", () => {
    for (const threshold of [0, 13, 21, 35, 39, 100]) {
      const { view } = decode(DEALS_LINKS.stalled(threshold));
      const derived = computeDerivedRows(rows, view, NOW);
      expect(derived.matchedCount, `threshold ${threshold}`).toBe(serverStaleCount(threshold));
    }
  });

  it("would have matched nothing under the old velocity filter", () => {
    // Kept as the regression's epitaph: every one of these rows is NO_DATE, so
    // the previous link could not have matched a single deal however stale.
    const { view } = decode(dealsHref({ velocity: ["STALLED", "SLOW"] }));
    expect(computeDerivedRows(rows, view, NOW).matchedCount).toBe(0);
  });
});

describe("countActiveFilters", () => {
  it("counts nothing for the default view", () => {
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
  });

  it("counts a dimension once however many values it holds", () => {
    // Three selected stages is one decision about stage, not three filters.
    // A badge reading "3" for one chip group would be a badge that lies.
    expect(countActiveFilters({ ...DEFAULT_FILTERS, stage: ["Discovery"] })).toBe(1);
    expect(
      countActiveFilters({ ...DEFAULT_FILTERS, stage: ["Discovery", "Validation", "Procurement"] }),
    ).toBe(1);
  });

  it("counts each range pair once", () => {
    expect(countActiveFilters({ ...DEFAULT_FILTERS, tcvMin: 1 })).toBe(1);
    expect(countActiveFilters({ ...DEFAULT_FILTERS, tcvMin: 1, tcvMax: 9 })).toBe(1);
    expect(countActiveFilters({ ...DEFAULT_FILTERS, tcvMin: 1, scoreMax: 50 })).toBe(2);
  });

  it("ignores search", () => {
    // The dock shows the search text. Badging it would count something the
    // reader is already looking at.
    expect(countActiveFilters({ ...DEFAULT_FILTERS, search: "acme" })).toBe(0);
  });

  it("counts a false boolean as set", () => {
    // `hasCompetitors: false` means "deals with NO competitor" — a real filter.
    // A truthiness check here would have made it invisible in the badge.
    expect(countActiveFilters({ ...DEFAULT_FILTERS, hasCompetitors: false })).toBe(1);
    expect(countActiveFilters({ ...DEFAULT_FILTERS, committed: false })).toBe(1);
  });

  it("counts a non-default closure and state", () => {
    expect(countActiveFilters({ ...DEFAULT_FILTERS, closure: "closed" })).toBe(1);
    expect(countActiveFilters({ ...DEFAULT_FILTERS, state: "archived" })).toBe(1);
  });

  it("adds dimensions together", () => {
    expect(
      countActiveFilters({
        ...DEFAULT_FILTERS,
        health: ["RED"],
        velocity: ["STALLED"],
        closePreset: "30d",
      }),
    ).toBe(3);
  });
});
