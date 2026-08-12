/**
 * Which first-paint skeleton a path deserves.
 *
 * ## Why this file has NO imports, and must keep none
 *
 * Its only consumer is `m-shell-skeleton.tsx`, which is deliberately EAGER — it is
 * App.tsx's Suspense fallback while the lazy mobile chunk downloads, so it has to
 * exist before that chunk does. Anything this module imports is therefore pulled
 * into the main bundle that every desktop user downloads.
 *
 * The obvious reuse is `mobile/nav/routes.ts` and `mobile/nav/mobile-nav.ts`, and
 * both are traps:
 *
 *   - `nav/routes.ts` imports `COCKPIT_GROUPS` from `components/cockpit/cockpit-tabs`,
 *     which would drag the desktop cockpit into the mobile-and-desktop main bundle.
 *   - `nav/mobile-nav.ts` imports four lucide icons for `MOBILE_TABS`.
 *
 * Either import quietly reverses the shell split that App.tsx's lazy() calls exist
 * to create. So the handful of prefixes below are duplicated on purpose, and
 * `skeleton-shape.test.ts` reads BOTH this file and the nav modules to assert they
 * never drift — the same cross-file guard `nav/routes.test.ts` already runs against
 * `mobile-app.tsx`. Tests can import freely; they are not in the bundle.
 *
 * ## Two axes, not one
 *
 * A screen's first paint is really two independent decisions, and collapsing them
 * into one "shape" enum is what makes route-aware skeletons go wrong:
 *
 *   - **The body** — is it a hero and a grid, repeated rows, or a stack of big
 *     blocks? That is `shape`, and there are six because that is how many distinct
 *     body geometries the twenty screens actually reduce to.
 *   - **The nav bar** — a brand mark with a reserved subtitle line, or a back
 *     chevron? That is `pushed` / `reserveSubtitle`, and it varies independently.
 *     `/memory/health` has a chart-shaped body AND a back chevron; no single enum
 *     value describes it.
 */

/** The six body geometries. Each is lifted from the screen that already draws it. */
export type MobileSkeletonShape =
  /** Hero block then a 2x2 grid. The Command screen, and the fallback. */
  | "command"
  /** Repeated 132px cards — `deals-screen.tsx`'s exact resolved card height. */
  | "list"
  /** A search pill then repeated 112px rows — `memory-screen.tsx`'s `h-28`. */
  | "memory"
  /** Cards holding 160px wells — the `h-40` `MChartFrame` reserves. */
  | "charts"
  /** The deal brief's hero then cards — `brief-hero.tsx`. */
  | "brief"
  /** A 96px block then lined cards — `PanelBody` in `panel-screen.tsx`. */
  | "panel";

/** Mirrors `MOBILE_TABS[].id` in `mobile/nav/mobile-nav.ts`. */
export type MobileSkeletonTab = "command" | "deals" | "intelligence" | "memory";

/**
 * The tab ids in bar order, so the skeleton can draw four stand-ins and tint the
 * right one without importing `MOBILE_TABS` (which carries lucide icons).
 * `skeleton-shape.test.ts` asserts this equals `MOBILE_TABS.map(t => t.id)`, so
 * adding or reordering a tab fails there rather than silently lighting the wrong
 * stand-in for one frame.
 */
export const MOBILE_SKELETON_TABS: readonly MobileSkeletonTab[] = [
  "command",
  "deals",
  "intelligence",
  "memory",
];

export interface MobileSkeletonPlan {
  shape: MobileSkeletonShape;
  /**
   * The tab to light, or undefined where none owns the path. `/account` and
   * `/settings/*` are reached from the avatar rather than the bar and light
   * nothing — matching `activeTabId`, which returns undefined for both.
   */
  tab?: MobileSkeletonTab;
  /**
   * Pushed screens show a back chevron where tab roots show the brand mark,
   * because `MNavBar` ignores its `leading` slot entirely once `backHref` is set.
   * Rendering the mark on a pushed screen's skeleton would show it for one frame
   * and then drop it on handover.
   */
  pushed: boolean;
  /**
   * Reserve the nav bar's second line. Only the tab roots do, because only they
   * carry a subtitle derived from data ("18 deals monitored") that lands after
   * the bar has already painted. Getting this wrong on either side re-introduces
   * the 20px nav-bar shift `reserveSubtitle` was added to prevent — a dead line
   * on a screen that never gets a subtitle is the mirror-image bug.
   *
   * Currently true for exactly the six non-pushed roots, but kept as its own
   * field rather than derived from `!pushed`: the two answer different questions
   * and a screen could reasonably need one without the other.
   */
  reserveSubtitle: boolean;
  /**
   * The control row inside the nav bar, below the title — and WHICH control,
   * because the two are different heights and getting it wrong shifts the screen.
   *
   * MEASURED against the running app at 390px, title row 64px in both cases:
   *
   *   - `"pills"` — `SegmentChips` on Deals, Memory and Portfolio Alerts. A scroll
   *     strip of individual pills, each a 48px tap target, plus `pb-3`: **60px**.
   *   - `"segmented"` — `MSegmented` on all three Intelligence lenses via
   *     `lens-screen.tsx`. One grouped control, 44px including its border and
   *     `p-1`, plus `pb-3`: **56px**.
   *
   * A single average-height row was the first attempt here and it was wrong in
   * both directions — 16px short on Deals and Memory, 12px on the lenses. That is
   * a bigger shift than the one `reserveSubtitle` exists to prevent, arriving in
   * the same place and for the same reason.
   */
  chipRow: "pills" | "segmented" | null;
  /**
   * A search field docked ABOVE the tab bar rather than sitting in the scroll
   * flow, which is how Deals and Memory mount theirs (`PullToRefresh`'s `dock`
   * prop) so the keyboard opens under the thumb. The shell's `pb-tabbar` already
   * clears it, so it costs the body no padding.
   */
  dockedSearch: boolean;
}

/** Literal second segments under `/memory`, which must not be read as a record id. */
const MEMORY_LENSES = new Set(["health", "revival", "competitors", "pricing"]);

/**
 * Path segments, with query and hash stripped.
 *
 * The strip is not defensive tidying — the Deals screen pushes a real history
 * entry for every filter change, so `/deals?h=RED` is a genuine location. Without
 * this, filtering would fall through to the fallback shape. `pathnameOf` in
 * `mobile-nav.ts` exists for the same reason and was added after exactly that bug.
 */
function segmentsOf(path: string): string[] {
  const cut = path.search(/[?#]/);
  const clean = cut === -1 ? path : path.slice(0, cut);
  return clean.split("/").filter(Boolean);
}

/**
 * A tab root: brand mark in the leading slot, a data-derived subtitle on the way,
 * no back chevron. Spread first, then override the chrome that varies.
 */
const ROOT = {
  pushed: false,
  reserveSubtitle: true,
  chipRow: null,
  dockedSearch: false,
} as const;

/** A pushed screen: back chevron, static title, so nothing to reserve. */
const PUSHED = {
  pushed: true,
  reserveSubtitle: false,
  chipRow: null,
  dockedSearch: false,
} as const;

/**
 * Resolve a location to its first-paint plan.
 *
 * Unknown paths fall back to `command` as a TAB ROOT, not as a pushed screen: a
 * path this function does not recognise is most likely a genuine 404, which
 * `not-found.tsx` renders inside the shell with no back affordance.
 */
export function mobileSkeletonPlan(path: string): MobileSkeletonPlan {
  const segs = segmentsOf(path);
  const [first, second] = segs;

  if (segs.length === 0) return { shape: "command", tab: "command", ...ROOT };

  switch (first) {
    case "deals":
      // Deals and Memory are the two screens carrying BOTH extra chrome rows: a
      // pill strip in the bar and a docked search above the tab bar.
      if (segs.length === 1) {
        return { shape: "list", tab: "deals", ...ROOT, chipRow: "pills", dockedSearch: true };
      }
      // /deals/:id keeps its own shape — the brief's hero is seeded from the card
      // that opened it (mobile/lib/shared-card.ts), so its geometry is the one
      // place a generic block would be most visible.
      if (segs.length === 2) return { shape: "brief", tab: "deals", ...PUSHED };
      return { shape: "panel", tab: "deals", ...PUSHED };

    case "analytics":
      // /analytics/flow is a push off the Pipeline lens, but its body is still
      // chart wells — which is exactly why `shape` and `pushed` are separate.
      return segs.length === 1
        ? { shape: "charts", tab: "intelligence", ...ROOT, chipRow: "segmented" }
        : { shape: "charts", tab: "intelligence", ...PUSHED };

    case "portfolio":
      // /portfolio/alerts has NO chip row, despite rendering MSegmented: it puts
      // that control in the scroll flow (`px-4 pt-3`), not in MNavBar's children.
      // Grepping for the component said otherwise; measuring the running app is
      // what caught it, at 60px of phantom header.
      return segs.length === 1
        ? { shape: "charts", tab: "intelligence", ...ROOT, chipRow: "segmented" }
        : { shape: "charts", tab: "intelligence", ...PUSHED };

    case "autopsy":
      return segs.length === 1
        ? { shape: "charts", tab: "intelligence", ...ROOT, chipRow: "segmented" }
        : { shape: "panel", tab: "intelligence", ...PUSHED };

    case "memory":
      if (segs.length === 1) {
        return { shape: "memory", tab: "memory", ...ROOT, chipRow: "pills", dockedSearch: true };
      }
      // The four lenses and /memory/compare each draw a single large block in a
      // card, near enough to a chart well to share its geometry.
      if (second !== undefined && (MEMORY_LENSES.has(second) || second === "compare")) {
        return { shape: "charts", tab: "memory", ...PUSHED };
      }
      // Everything else under /memory — /memory/ask, /memory/:id and its panels —
      // is a block-and-cards body.
      return { shape: "panel", tab: "memory", ...PUSHED };

    // Reached from the avatar, so no tab lights. Both are pushed, and neither
    // waits on a query, so this skeleton is near-invisible in practice.
    case "account":
    case "settings":
      return { shape: "panel", ...PUSHED };

    default:
      // No tab and nothing reserved, both deliberate. `activeTabId` also returns
      // undefined here, because its "/" prefix matches only "/" — so an
      // unrecognised path lights nothing, and lighting Command would tell the
      // reader they are somewhere they are not. An unknown path is most likely a
      // 404, which `not-found.tsx` renders with no subtitle and no back chevron,
      // so reserving a second line would leave 20px of dead bar.
      return { shape: "command", ...ROOT, reserveSubtitle: false };
  }
}
