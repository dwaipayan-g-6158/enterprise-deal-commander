// The mobile route table, as data.
//
// Relative imports throughout: this module is node-tested through a vitest
// config with no alias resolution, the same constraint the roster model layer
// works under.
import { COCKPIT_GROUPS } from "../../components/cockpit/cockpit-tabs";

/**
 * One pushed sub-screen of a deal.
 *
 * ## Why this is a table rather than sixteen routes
 *
 * The deal Brief is a menu; a panel is what the menu opens. Both need the same
 * facts — the segment, the nav-bar title, which of the Brief's five groups the
 * row belongs under — and holding them in one place is what stops the menu and
 * the screen it opens from disagreeing about what a panel is called.
 *
 * ## `cockpitSub` is the anti-drift link
 *
 * Desktop's `COCKPIT_GROUPS` is the canonical set of things there are to know
 * about a deal. Every one of its thirteen sub-tabs is claimed here by exactly
 * one panel, asserted in routes.test.ts — so a fourteenth sub-tab added to the
 * cockpit fails the mobile suite until someone decides where it lives on a
 * phone. The alternative, discovering the omission from a user, is how mobile
 * became "a miniature version of the desktop app" in the first place.
 *
 * The three panels with `cockpitSub: null` are mobile-only and enumerated in the
 * test, so a fourth cannot appear unlabelled.
 */
export interface DealPanel {
  /** URL segment — `/deals/:id/<id>`. */
  id: string;
  /** Nav-bar title on the pushed screen. Sentence case, no "Deal" prefix. */
  title: string;
  /** Which drill-in group on the Brief lists it. */
  group: PanelGroup;
  /** The desktop sub-tab this is the counterpart of; null when mobile-only. */
  cockpitSub: string | null;
}

/**
 * `stage` is its own group because it is not in the drill-in list at all — it is
 * the primary action on the Brief, sitting on the stage row. The other five
 * match `COCKPIT_GROUPS` ids exactly.
 */
export type PanelGroup = "stage" | "risk" | "validation" | "intel" | "commercial" | "record";

export const DEAL_PANELS: DealPanel[] = [
  { id: "stage", title: "Stage", group: "stage", cockpitSub: null },

  { id: "alerts", title: "Risk alerts", group: "risk", cockpitSub: "risk" },
  { id: "coaching", title: "Coaching", group: "risk", cockpitSub: "coaching" },
  { id: "blockers", title: "Blockers", group: "risk", cockpitSub: "blockers" },

  { id: "gates", title: "Technical gates", group: "validation", cockpitSub: "technical" },
  { id: "playbook", title: "Playbook", group: "validation", cockpitSub: "playbook" },
  { id: "meddpicc", title: "MEDDPICC", group: "validation", cockpitSub: "meddpicc" },

  { id: "score", title: "Predictive score", group: "intel", cockpitSub: "score" },
  { id: "trajectory", title: "Trajectory", group: "intel", cockpitSub: null },
  { id: "competitive", title: "Competitive", group: "intel", cockpitSub: "competitive" },
  { id: "stakeholders", title: "Stakeholders", group: "intel", cockpitSub: "stakeholders" },

  { id: "economics", title: "Economics", group: "commercial", cockpitSub: null },
  { id: "pricing", title: "Pricing", group: "commercial", cockpitSub: "pricing" },
  { id: "cross-sell", title: "Cross-sell", group: "commercial", cockpitSub: "crosssell" },

  { id: "history", title: "History", group: "record", cockpitSub: "history" },
  { id: "decisions", title: "Decisions", group: "record", cockpitSub: "decisions" },
];

/** Group labels for the Brief's drill-in list, borrowed from the cockpit. */
export const PANEL_GROUP_LABEL: Record<Exclude<PanelGroup, "stage">, string> = {
  risk: "Risk",
  validation: "Validation",
  intel: "Intelligence",
  commercial: "Commercial",
  record: "Record",
};

/** The order the Brief lists the groups in. `stage` is deliberately absent. */
export const PANEL_GROUP_ORDER: Exclude<PanelGroup, "stage">[] = [
  "risk",
  "validation",
  "intel",
  "commercial",
  "record",
];

export function panelById(id: string | undefined): DealPanel | undefined {
  return DEAL_PANELS.find((p) => p.id === id);
}

/** `/deals/:dealId/<panel>`, the one place this string is built. */
export function panelHref(dealId: string, panelId: string): string {
  return `/deals/${dealId}/${panelId}`;
}

export interface MobileRoute {
  /** wouter pattern. `:name` matches exactly one segment. */
  pattern: string;
  /**
   * The tab that stays lit. Deliberately undefined on `/account` and
   * `/settings*`: they are reached from the avatar, and lighting a tab there
   * would tell the reader they are somewhere they are not.
   */
  tab?: string;
}

/**
 * Every route registered inside the shell, in registration order.
 *
 * ## Two rules this table exists to hold
 *
 * **Literals before params.** wouter's `<Switch>` is first-match, exactly like
 * Express — CLAUDE.md documents the same rule for the API. `/memory/ask` after
 * `/memory/:id` would open a deal-memory record whose id is the literal string
 * "ask". Nothing about that failure looks like a routing bug from the outside.
 *
 * **One pattern per concrete path.** Two patterns that can both match means the
 * screen you get depends on registration order, which is a coin flip written in
 * a file nobody reads.
 *
 * Both are asserted in routes.test.ts, against this table AND against
 * mobile-app.tsx — the test reads the component and fails if the two disagree,
 * so this cannot quietly become documentation.
 */
export const MOBILE_ROUTES: MobileRoute[] = [
  { pattern: "/", tab: "command" },

  { pattern: "/deals", tab: "deals" },
  { pattern: "/deals/:id", tab: "deals" },
  { pattern: "/deals/:id/:panel", tab: "deals" },

  { pattern: "/analytics", tab: "intelligence" },
  { pattern: "/portfolio", tab: "intelligence" },
  { pattern: "/autopsy", tab: "intelligence" },

  { pattern: "/memory", tab: "memory" },
  { pattern: "/memory/:id", tab: "memory" },

  { pattern: "/account" },
  { pattern: "/settings" },
];

/** Segments of a pattern or path, with the leading slash dropped. `/` → `[]`. */
export function segmentsOf(patternOrPath: string): string[] {
  return patternOrPath.split("/").filter(Boolean);
}

/**
 * Whether `pattern` matches the concrete `path`.
 *
 * Segment-wise and exact in length — which is the part that matters here, since
 * it is why `/deals/:id` does NOT swallow `/deals/abc/alerts`. A `:param` never
 * matches an empty segment.
 */
export function matchesPattern(pattern: string, path: string): boolean {
  const p = segmentsOf(pattern);
  const s = segmentsOf(path);
  if (p.length !== s.length) return false;
  return p.every((seg, i) => (seg.startsWith(":") ? s[i].length > 0 : seg === s[i]));
}

/** The route that owns `path` under first-match semantics, if any. */
export function routeFor(path: string): MobileRoute | undefined {
  return MOBILE_ROUTES.find((r) => matchesPattern(r.pattern, path));
}
