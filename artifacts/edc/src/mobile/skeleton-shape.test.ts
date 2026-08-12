import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { SRC, walkFiles } from "./module-graph";
import { MOBILE_TABS, activeTabId } from "./nav/mobile-nav";
import { MOBILE_ROUTES } from "./nav/routes";
import {
  MOBILE_SKELETON_TABS,
  mobileSkeletonPlan,
  type MobileSkeletonShape,
} from "./shell/skeleton-shape";

/**
 * `shell/skeleton-shape.ts` duplicates a handful of route prefixes and the tab
 * order on purpose — it feeds the EAGER first-paint skeleton, so importing
 * `nav/routes.ts` (which pulls in the desktop cockpit's `COCKPIT_GROUPS`) or
 * `nav/mobile-nav.ts` (which pulls in lucide icons) would drag desktop code into
 * the main bundle every user downloads.
 *
 * This file is where that duplication is paid for. Tests are not in the bundle,
 * so here both sides can be imported and compared. Same arrangement
 * `nav/routes.test.ts` uses against `mobile-app.tsx`.
 */

/**
 * The shape each route's first paint should take.
 *
 * Enumerated rather than derived, so changing one is a deliberate edit to a line
 * that says what it is doing. Every entry in MOBILE_ROUTES must appear, and the
 * test below fails if the two lists ever disagree in either direction.
 */
const EXPECTED_SHAPE: Record<string, MobileSkeletonShape> = {
  "/": "command",

  "/deals": "list",
  "/deals/:id": "brief",
  "/deals/:id/:panel": "panel",

  "/analytics": "charts",
  "/analytics/flow": "charts",
  "/portfolio": "charts",
  "/portfolio/alerts": "charts",
  "/autopsy": "charts",
  "/autopsy/:sub": "panel",

  "/memory": "memory",
  "/memory/ask": "panel",
  "/memory/health": "charts",
  "/memory/revival": "charts",
  "/memory/competitors": "charts",
  "/memory/pricing": "charts",
  "/memory/compare": "charts",
  "/memory/:id": "panel",
  "/memory/:id/:panel": "panel",

  "/account": "panel",
  "/settings": "panel",
  "/settings/:screen": "panel",
};

/**
 * The six paths that own a tab, and therefore the only ones whose nav bar
 * reserves a second line. Everything else in the table is pushed.
 */
const TAB_ROOTS = ["/", "/deals", "/analytics", "/portfolio", "/autopsy", "/memory"];

/**
 * A pattern's params filled in with values that are not themselves literals in
 * the table — `/memory/:id` must not resolve as `/memory/compare`.
 */
function concretePath(pattern: string): string {
  return pattern
    .split("/")
    .map((seg) => (seg.startsWith(":") ? `x${seg.slice(1)}` : seg))
    .join("/");
}

describe("the tab order the skeleton draws", () => {
  it("matches MOBILE_TABS exactly, in order", () => {
    // Not just the same set: the skeleton tints the Nth stand-in, so a reorder
    // would light the wrong one for as long as the skeleton is up.
    expect([...MOBILE_SKELETON_TABS]).toEqual(MOBILE_TABS.map((tab) => tab.id));
  });
});

describe("every route resolves to a first-paint plan", () => {
  it("covers exactly the routes MOBILE_ROUTES declares", () => {
    const declared = MOBILE_ROUTES.map((route) => route.pattern).sort();
    expect(Object.keys(EXPECTED_SHAPE).sort()).toEqual(declared);
  });

  it.each(MOBILE_ROUTES.map((route) => route.pattern))("%s gets its expected shape", (pattern) => {
    const plan = mobileSkeletonPlan(concretePath(pattern));
    expect(plan.shape).toBe(EXPECTED_SHAPE[pattern]);
  });

  it.each(MOBILE_ROUTES.map((route) => route.pattern))(
    "%s lights the same tab the live bar would",
    (pattern) => {
      const path = concretePath(pattern);
      // The skeleton and MTabBar must agree, or the lit tab moves on handover.
      expect(mobileSkeletonPlan(path).tab).toBe(activeTabId(path));
    },
  );

  it.each(MOBILE_ROUTES.map((route) => route.pattern))(
    "%s agrees with MOBILE_ROUTES about whether a tab owns it",
    (pattern) => {
      const plan = mobileSkeletonPlan(concretePath(pattern));
      const route = MOBILE_ROUTES.find((r) => r.pattern === pattern);
      // `/account` and `/settings/*` deliberately light nothing — they are
      // reached from the avatar, not the bar.
      expect(plan.tab).toBe(route?.tab);
    },
  );
});

describe("the nav bar's reserved second line", () => {
  it.each(MOBILE_ROUTES.map((route) => route.pattern))(
    "%s reserves a subtitle only if it is a tab root",
    (pattern) => {
      const plan = mobileSkeletonPlan(concretePath(pattern));
      expect(plan.reserveSubtitle).toBe(TAB_ROOTS.includes(pattern));
    },
  );

  it("is reserved by exactly the screens that pass reserveSubtitle", () => {
    /**
     * The other half of the guard, and the one that catches real drift: if
     * someone adds `reserveSubtitle` to a fifth screen, the resolver above still
     * says false for it and the bar grows 20px on handover — the exact shift that
     * prop was added to prevent. Four files, six paths, because lens-screen.tsx
     * serves all three Intelligence lenses.
     */
    const expected = [
      "screens/command/command-screen.tsx",
      "screens/deals/deals-screen.tsx",
      "screens/intelligence/lens-screen.tsx",
      "screens/memory/memory-screen.tsx",
    ];

    const found = walkFiles(join(SRC, "mobile", "screens"))
      .filter((file) => file.endsWith(".tsx") && !file.includes(".test."))
      .filter((file) => stripComments(readFileSync(file, "utf8")).includes("reserveSubtitle"))
      .map((file) => relative(join(SRC, "mobile"), file).split("\\").join("/"))
      .sort();

    expect(found).toEqual(expected.sort());
  });

  it("reserves for all three Intelligence lenses, since one screen serves them", () => {
    for (const lens of ["/analytics", "/portfolio", "/autopsy"]) {
      expect(mobileSkeletonPlan(lens).reserveSubtitle, lens).toBe(true);
    }
  });
});

describe("the chrome rows that are easy to forget", () => {
  it("picks the control row the live nav bar actually has", () => {
    /**
     * The two are NOT interchangeable, and this was a measured bug rather than a
     * theoretical one. Title row is 64px in both cases; on top of that:
     *   pills     — SegmentChips, 48px tap targets + pb-3 = 60px  (header 125)
     *   segmented — MSegmented,   44px control      + pb-3 = 56px  (header 121)
     * A single averaged row shipped first and was 16px short on Deals and Memory,
     * 12px on the lenses.
     */
    for (const path of ["/deals", "/memory"]) {
      expect(mobileSkeletonPlan(path).chipRow, path).toBe("pills");
    }
    for (const path of ["/analytics", "/portfolio", "/autopsy"]) {
      expect(mobileSkeletonPlan(path).chipRow, path).toBe("segmented");
    }
    // Command has no children row, and pushed screens have none either.
    for (const path of ["/", "/deals/abc", "/memory/abc", "/analytics/flow", "/autopsy/x"]) {
      expect(mobileSkeletonPlan(path).chipRow, path).toBeNull();
    }
  });

  it("gives /portfolio/alerts no chip row, because its control is in the body", () => {
    // It DOES render MSegmented — but inside the scroll flow (`px-4 pt-3`), not in
    // MNavBar's children slot. Searching for the component name says it has a chip
    // row; measuring the running app says its header is the plain 65px. Trust the
    // measurement. Getting this wrong put 60px of phantom header on the screen.
    expect(mobileSkeletonPlan("/portfolio/alerts").chipRow).toBeNull();
    expect(mobileSkeletonPlan("/portfolio/alerts").pushed).toBe(true);
  });

  it("draws each control row at the height it was measured at", () => {
    // The heights live in the JSX, so assert them there: `h-12` for a pill strip
    // and `h-11` for a grouped control, both inside a `pb-3` row. If either moves
    // without the other, the header hands over at the wrong height again.
    const skeleton = readFileSync(join(SRC, "mobile", "shell", "m-shell-skeleton.tsx"), "utf8");
    const pills = skeleton.slice(skeleton.indexOf('chipRow === "pills"'));
    const segmented = skeleton.slice(skeleton.indexOf('chipRow === "segmented"'));
    expect(pills.slice(0, 700)).toMatch(/h-12[^"]*rounded-full/);
    expect(pills.slice(0, 700)).toContain("pb-3");
    expect(segmented.slice(0, 400)).toMatch(/h-11[^"]*rounded-full/);
    expect(segmented.slice(0, 400)).toContain("pb-3");
  });

  it("docks a search field only on the two screens that have one", () => {
    expect(mobileSkeletonPlan("/deals").dockedSearch).toBe(true);
    expect(mobileSkeletonPlan("/memory").dockedSearch).toBe(true);
    for (const path of ["/", "/analytics", "/portfolio", "/autopsy", "/deals/abc"]) {
      expect(mobileSkeletonPlan(path).dockedSearch, path).toBe(false);
    }
  });
});

describe("paths that are not bare patterns", () => {
  it("ignores a query string", () => {
    // The Deals screen pushes a real history entry per filter change, so
    // `/deals?h=RED` is a genuine location. Without the strip it would fall
    // through to the fallback shape mid-filter.
    expect(mobileSkeletonPlan("/deals?h=RED").shape).toBe("list");
    expect(mobileSkeletonPlan("/deals?h=RED").tab).toBe("deals");
  });

  it("ignores a hash", () => {
    expect(mobileSkeletonPlan("/memory#top").shape).toBe("memory");
  });

  it("treats a trailing slash as the same route", () => {
    expect(mobileSkeletonPlan("/deals/").shape).toBe("list");
  });

  it("falls back without lighting a tab or reserving a line", () => {
    // An unrecognised path is most likely a 404, which not-found.tsx renders with
    // no subtitle and no back chevron. Lighting Command would say the reader is
    // somewhere they are not; reserving a line would leave 20px of dead bar.
    const plan = mobileSkeletonPlan("/nope/nowhere");
    expect(plan.shape).toBe("command");
    expect(plan.tab).toBeUndefined();
    expect(plan.reserveSubtitle).toBe(false);
    expect(activeTabId("/nope/nowhere")).toBeUndefined();
  });
});

describe("the resolver stays importable from the eager bundle", () => {
  it("has no imports at all", () => {
    /**
     * The whole reason this file's duplication exists. `m-shell-skeleton.tsx` is
     * App.tsx's Suspense fallback, so it and everything it reaches are eager; a
     * single import here of `nav/routes.ts` or `nav/mobile-nav.ts` would put the
     * desktop cockpit or lucide into the bundle a phone downloads before the
     * mobile chunk exists.
     */
    const source = stripComments(
      readFileSync(join(SRC, "mobile", "shell", "skeleton-shape.ts"), "utf8"),
    );
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/^\s*export\s+.*\sfrom\s/m);
  });
});

/** Comments discuss these names constantly; only real code counts. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
