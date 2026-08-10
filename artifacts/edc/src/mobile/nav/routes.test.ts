import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COCKPIT_GROUPS } from "../../components/cockpit/cockpit-tabs";
import { MOBILE_TABS, activeTabId } from "./mobile-nav";
import {
  DEAL_PANELS,
  LOSS_SUBS,
  MEMORY_LENSES,
  MEMORY_PANELS,
  MOBILE_ROUTES,
  PANEL_GROUP_LABEL,
  PANEL_GROUP_ORDER,
  matchesPattern,
  panelHref,
  routeFor,
  segmentsOf,
} from "./routes";

const SRC = join(import.meta.dirname, "..", "..");

/**
 * The three panels that exist on a phone and nowhere else. Enumerated rather
 * than counted, so a fourth cannot appear by simply nulling out `cockpitSub`.
 *
 * Each earns its place: `stage` hosts the advance write and its guardrail
 * branch, which desktop does by dragging a card between board columns — a
 * gesture with no phone equivalent. `economics` and `trajectory` are read-only
 * lifts of content the desktop cockpit shows inline on other tabs, given their
 * own screens because a phone cannot show them alongside anything else.
 */
const MOBILE_ONLY_PANELS = ["stage", "economics", "trajectory"];

describe("deal panels", () => {
  it("covers every cockpit sub-tab exactly once", () => {
    const cockpitSubs = COCKPIT_GROUPS.flatMap((g) => g.subs.map((s) => s.id));
    const claimed = DEAL_PANELS.map((p) => p.cockpitSub).filter((s): s is string => s != null);

    // Both directions. Missing means a phone reader cannot reach something a
    // desktop reader can; extra means a panel points at a sub-tab that has been
    // renamed or removed and its content is now unreachable from anywhere.
    expect([...claimed].sort()).toEqual([...cockpitSubs].sort());
    expect(new Set(claimed).size).toBe(claimed.length);
  });

  it("names its mobile-only panels", () => {
    const mobileOnly = DEAL_PANELS.filter((p) => p.cockpitSub == null).map((p) => p.id);
    expect(mobileOnly.sort()).toEqual([...MOBILE_ONLY_PANELS].sort());
  });

  it("ships sixteen panels with unique, URL-safe ids", () => {
    expect(DEAL_PANELS).toHaveLength(16);
    const ids = DEAL_PANELS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z-]*[a-z]$/);
  });

  it("gives every panel a title and a group the Brief can list it under", () => {
    for (const panel of DEAL_PANELS) {
      expect(panel.title.trim().length).toBeGreaterThan(0);
      if (panel.group === "stage") continue;
      expect(PANEL_GROUP_ORDER).toContain(panel.group);
      expect(PANEL_GROUP_LABEL[panel.group]).toBeTruthy();
    }
  });

  it("draws its group ids and order from the cockpit", () => {
    // PANEL_GROUP_ORDER is the Brief's drill-in list. If it drifted from the
    // cockpit's own grouping, the same deal would be organised two different
    // ways on the two shells — which is the exact complaint this rebuild
    // started from.
    expect(PANEL_GROUP_ORDER).toEqual(COCKPIT_GROUPS.map((g) => g.id));
  });

  it("builds panel hrefs that the route table actually claims", () => {
    for (const panel of DEAL_PANELS) {
      const href = panelHref("deal-123", panel.id);
      expect(href).toBe(`/deals/deal-123/${panel.id}`);
      expect(routeFor(href)?.pattern).toBe("/deals/:id/:panel");
    }
  });
});

describe("loss sub-screens", () => {
  it("keeps the desktop tab ids, so a shared link means the same thing", () => {
    // Slice 0 added `/autopsy/:panel` → `/autopsy` as a desktop redirect. These
    // ids are also the desktop tab values, so a link shared from a phone lands
    // on the right subject rather than a generic page.
    expect(LOSS_SUBS.map((s) => s.id)).toEqual([
      "early-warning",
      "archetypes",
      "product-gaps",
    ]);
  });

  it("gives every sub a title and a blurb", () => {
    for (const sub of LOSS_SUBS) {
      expect(sub.title.trim().length).toBeGreaterThan(0);
      // The blurb is what the lens root shows instead of the screen's content.
      // A row with no blurb is a row nobody can decide whether to tap.
      expect(sub.blurb.trim().length).toBeGreaterThan(0);
      expect(sub.id).toMatch(/^[a-z][a-z-]*[a-z]$/);
    }
  });

  it("routes every sub through the one autopsy pattern", () => {
    for (const sub of LOSS_SUBS) {
      expect(routeFor(`/autopsy/${sub.id}`)?.pattern).toBe("/autopsy/:sub");
    }
  });
});

describe("memory lenses", () => {
  it("each resolves to its own literal route, not to a memory record", () => {
    // The failure this prevents: `/memory/ask` matching `/memory/:id` and asking
    // the API for a deal-memory record whose id is the string "ask". The 404 that
    // comes back reads as missing data rather than as a routing mistake, which is
    // why the ordering assertion above exists at all.
    for (const lens of MEMORY_LENSES) {
      expect(routeFor(`/memory/${lens.id}`)?.pattern, lens.id).toBe(`/memory/${lens.id}`);
    }
  });

  it("never collides with a memory panel segment", () => {
    // `/memory/:id/:panel` and `/memory/<lens>` are different depths, so they
    // cannot collide — but a lens id that duplicated a panel id would make the
    // root's row and a record's row read as the same destination.
    const lensIds = new Set(MEMORY_LENSES.map((l) => l.id));
    for (const panel of MEMORY_PANELS) {
      expect(lensIds.has(panel.id), panel.id).toBe(false);
    }
  });

  it("gives every lens and panel a title, and every lens a blurb", () => {
    for (const lens of MEMORY_LENSES) {
      expect(lens.title.trim().length).toBeGreaterThan(0);
      expect(lens.blurb.trim().length).toBeGreaterThan(0);
      expect(lens.id).toMatch(/^[a-z][a-z-]*[a-z]$/);
    }
    for (const panel of MEMORY_PANELS) {
      expect(panel.title.trim().length).toBeGreaterThan(0);
      expect(panel.id).toMatch(/^[a-z][a-z-]*[a-z]$/);
    }
  });

  it("routes every record panel through the one memory pattern", () => {
    for (const panel of MEMORY_PANELS) {
      expect(routeFor(`/memory/mem-1/${panel.id}`)?.pattern).toBe("/memory/:id/:panel");
    }
  });

  it("keeps `compare` out of the lens list", () => {
    // Compare is reached by selecting records, not from the lens menu — a row
    // that opens an empty comparison is a row that only ever disappoints.
    expect(MEMORY_LENSES.some((l) => l.id === "compare")).toBe(false);
    expect(routeFor("/memory/compare")?.pattern).toBe("/memory/compare");
  });
});

describe("matchesPattern", () => {
  it("matches segment-wise and requires equal length", () => {
    expect(matchesPattern("/deals/:id", "/deals/abc")).toBe(true);
    // The one that matters: a param does not swallow a deeper path, which is
    // what lets /deals/:id and /deals/:id/:panel coexist in either order.
    expect(matchesPattern("/deals/:id", "/deals/abc/alerts")).toBe(false);
    expect(matchesPattern("/deals/:id/:panel", "/deals/abc/alerts")).toBe(true);
    expect(matchesPattern("/deals", "/deals/abc")).toBe(false);
  });

  it("treats / as matching only itself", () => {
    expect(matchesPattern("/", "/")).toBe(true);
    expect(matchesPattern("/", "/deals")).toBe(false);
    expect(segmentsOf("/")).toEqual([]);
  });

  it("never matches an empty segment against a param", () => {
    expect(matchesPattern("/deals/:id", "/deals/")).toBe(false);
  });
});

describe("route table", () => {
  it("registers literals before params at the same depth", () => {
    // wouter's <Switch> is first-match, exactly like Express. `/memory/ask`
    // registered after `/memory/:id` opens a memory record whose id is the
    // literal string "ask" — a failure that looks like a data bug, not a
    // routing one. This is the assertion that stops that shipping.
    for (let i = 0; i < MOBILE_ROUTES.length; i++) {
      for (let j = i + 1; j < MOBILE_ROUTES.length; j++) {
        const earlier = segmentsOf(MOBILE_ROUTES[i].pattern);
        const later = segmentsOf(MOBILE_ROUTES[j].pattern);
        if (earlier.length !== later.length) continue;

        const earlierIsParam = earlier.some((s, k) => s.startsWith(":") && !later[k].startsWith(":"));
        const laterIsLiteralHere = later.some((s, k) => !s.startsWith(":") && earlier[k].startsWith(":"));
        const sameLiteralPrefix = earlier.every(
          (s, k) => s.startsWith(":") || later[k].startsWith(":") || s === later[k],
        );

        if (earlierIsParam && laterIsLiteralHere && sameLiteralPrefix) {
          throw new Error(
            `${MOBILE_ROUTES[j].pattern} is registered after ${MOBILE_ROUTES[i].pattern} and can never match`,
          );
        }
      }
    }
  });

  it("resolves every concrete path to its most specific pattern", () => {
    const probes = [
      "/",
      "/deals",
      "/deals/abc",
      "/deals/abc/alerts",
      "/deals/abc/cross-sell",
      "/analytics",
      "/analytics/flow",
      "/portfolio",
      "/portfolio/alerts",
      "/autopsy",
      "/autopsy/archetypes",
      "/memory",
      "/memory/ask",
      "/memory/compare",
      "/memory/mem-1",
      "/memory/mem-1/narrative",
      "/account",
      "/settings",
    ];
    // Overlap is EXPECTED, not forbidden: `/memory/ask` matches both its own
    // literal and `/memory/:id`, and first-match ordering is precisely what
    // resolves that. This asserted "exactly one match" until the memory lenses
    // landed, which was only accidentally true while no literal shared a depth
    // with a param — so it was testing the absence of the situation rather than
    // the rule that handles it.
    //
    // The real invariant: something owns the path, and what owns it is the most
    // specific thing that could.
    for (const path of probes) {
      const matches = MOBILE_ROUTES.filter((r) => matchesPattern(r.pattern, path));
      expect(matches.length, `nothing claims ${path}`).toBeGreaterThan(0);

      const paramCount = (pattern: string) =>
        segmentsOf(pattern).filter((s) => s.startsWith(":")).length;
      const fewestParams = Math.min(...matches.map((m) => paramCount(m.pattern)));
      const owner = routeFor(path);

      expect(owner, path).toBeDefined();
      expect(paramCount(owner!.pattern), `${path} resolved to ${owner!.pattern}`).toBe(
        fewestParams,
      );
    }
  });

  it("declares no duplicate patterns", () => {
    const patterns = MOBILE_ROUTES.map((r) => r.pattern);
    expect(new Set(patterns).size).toBe(patterns.length);
  });

  it("agrees with mobile-nav about which tab owns each route", () => {
    // Two modules answer "which tab is this?" — this table statically, and
    // activeTabId at runtime from the tab prefixes. They are allowed to be two
    // modules; they are not allowed to disagree.
    for (const route of MOBILE_ROUTES) {
      const concrete = route.pattern
        .split("/")
        .map((s) => (s.startsWith(":") ? "sample" : s))
        .join("/");
      expect(activeTabId(concrete), route.pattern).toBe(route.tab);
    }
  });

  it("only names tabs that exist", () => {
    const tabIds = new Set(MOBILE_TABS.map((t) => t.id));
    for (const route of MOBILE_ROUTES) {
      if (route.tab != null) expect(tabIds.has(route.tab), route.tab).toBe(true);
    }
  });

  it("leaves account and settings deliberately tab-less", () => {
    expect(routeFor("/account")?.tab).toBeUndefined();
    expect(routeFor("/settings")?.tab).toBeUndefined();
  });
});

describe("the table and the router agree", () => {
  /**
   * The assertion that keeps this table from decaying into documentation.
   *
   * `mobile-app.tsx` renders two Switches: an outer one for the routes that live
   * OUTSIDE the shell (sign-in, the share card, Catalyst's auth bounce) and an
   * inner one for screens. Only the inner one is this table's business, so the
   * source is sliced at the shell boundary before the paths are read.
   */
  function insideShellPaths(): string[] {
    const source = readFileSync(join(SRC, "mobile", "mobile-app.tsx"), "utf8");
    const start = source.indexOf("<MShell>");
    expect(start, "mobile-app.tsx no longer renders <MShell>").toBeGreaterThan(-1);
    const inner = source.slice(start);
    return [...inner.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]);
  }

  it("registers exactly the routes this table declares, in this order", () => {
    expect(insideShellPaths()).toEqual(MOBILE_ROUTES.map((r) => r.pattern));
  });
});
