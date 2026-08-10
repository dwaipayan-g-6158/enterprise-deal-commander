import { describe, expect, it } from "vitest";
import { decodeRosterUrl } from "../../../components/roster/model/roster-url";
import { DEFAULT_FILTERS } from "../../../components/roster/model/roster-types";
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

    it("stalled covers both losing-pace buckets", () => {
      const { view } = decode(DEALS_LINKS.stalled());
      expect(view.filters.velocity).toEqual(["STALLED", "SLOW"]);
      expect(view.sort).toEqual([{ key: "velocity", dir: "desc" }]);
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
          view.filters.closePreset !== "any";
        expect(filtered, name).toBe(name !== "all");
      }
    });
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
