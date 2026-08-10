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

/**
 * The pushed sub-screens of the Losses lens.
 *
 * Desktop's Autopsy page carries five tabs. Two of them — the loss dashboard and
 * the competitive matrix — are the answer to "how are we losing", which is what
 * the lens root already says; folding them in is what leaves the root worth
 * opening. The other three are each a different question with a different unit
 * (deals at risk, archetypes, products), and each gets a screen.
 *
 * Segments match the desktop tab ids exactly, so `/autopsy/archetypes` means the
 * same thing on both shells and the redirect Slice 0 added on desktop lands
 * somewhere sensible.
 */
export interface LossSub {
  id: string;
  title: string;
  /** One line on the lens root, saying what the screen answers. */
  blurb: string;
}

export const LOSS_SUBS: LossSub[] = [
  {
    id: "early-warning",
    title: "Early warning",
    blurb: "Live deals matching the patterns that preceded past losses.",
  },
  {
    id: "archetypes",
    title: "Loss archetypes",
    blurb: "How each kind of loss actually played out.",
  },
  {
    id: "product-gaps",
    title: "Product gaps",
    blurb: "Products that show up disproportionately in stalled deals.",
  },
];

export function lossSubById(id: string | undefined): LossSub | undefined {
  return LOSS_SUBS.find((s) => s.id === id);
}

/**
 * The Memory tab's five lenses, each a literal route under `/memory`.
 *
 * These are why the literal-before-param rule in `MOBILE_ROUTES` has teeth.
 * `/memory/ask` registered after `/memory/:id` opens a deal-memory record whose
 * id is the literal string "ask" — a 404 from the API that looks like a data
 * problem rather than a routing one. The ordering assertion in routes.test.ts
 * exists for exactly this table.
 */
export interface MemoryLens {
  id: string;
  title: string;
  blurb: string;
}

export const MEMORY_LENSES: MemoryLens[] = [
  {
    id: "ask",
    title: "Ask the advisor",
    blurb: "Put a question to the archive and get a cited answer.",
  },
  {
    id: "health",
    title: "Archive health",
    blurb: "How complete and how fresh the record actually is.",
  },
  {
    id: "revival",
    title: "Revival candidates",
    blurb: "Lost deals worth another approach, and why.",
  },
  {
    id: "competitors",
    title: "Competitor intel",
    blurb: "Who we meet, how often we win, and how they beat us.",
  },
  {
    id: "pricing",
    title: "Pricing benchmarks",
    blurb: "What deals like this one actually closed at.",
  },
];

export function memoryLensById(id: string | undefined): MemoryLens | undefined {
  return MEMORY_LENSES.find((l) => l.id === id);
}

/** The pushed sub-screens of one archived deal. */
export interface MemoryPanel {
  id: string;
  title: string;
}

export const MEMORY_PANELS: MemoryPanel[] = [
  { id: "narrative", title: "Narrative" },
  { id: "timeline", title: "Timeline" },
  { id: "connections", title: "Connections" },
];

export function memoryPanelById(id: string | undefined): MemoryPanel | undefined {
  return MEMORY_PANELS.find((p) => p.id === id);
}

/**
 * The settings screens a phone can honestly show.
 *
 * ## Five of desktop's ten, and the split is not arbitrary
 *
 * Thresholds, Score Weights, Custom Patterns, Smart Alerts and Webhooks are
 * authoring surfaces — every control on them is a write this shell does not
 * ship, so porting them would produce five screens of inert inputs. The five
 * here are all questions with answers: who is an admin, who is on the team, what
 * are we measured against, what has been earned, and what changed.
 *
 * Change Log is the most phone-shaped of the lot. "Who changed the thresholds
 * and when" is exactly the question that gets asked away from a desk.
 */
export interface SettingsScreen {
  id: string;
  title: string;
  blurb: string;
  /** True when the screen shows other people's identities. */
  sensitive?: boolean;
}

export const SETTINGS_SCREENS: SettingsScreen[] = [
  {
    id: "change-log",
    title: "Change log",
    blurb: "Who changed which setting, and when.",
  },
  {
    id: "users",
    title: "Users",
    blurb: "Who can write, and who is read-only.",
    // Never put this on a screenshot: docs/assets is a public repository.
    sensitive: true,
  },
  {
    id: "team",
    title: "Team",
    blurb: "Account managers and technical leads deals can be assigned to.",
  },
  {
    id: "targets",
    title: "Targets",
    blurb: "The revenue numbers coverage is measured against.",
  },
  {
    id: "achievements",
    title: "Achievements",
    blurb: "What has been earned so far.",
  },
];

export function settingsScreenById(id: string | undefined): SettingsScreen | undefined {
  return SETTINGS_SCREENS.find((s) => s.id === id);
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
  { pattern: "/analytics/flow", tab: "intelligence" },
  { pattern: "/portfolio", tab: "intelligence" },
  { pattern: "/portfolio/alerts", tab: "intelligence" },
  { pattern: "/autopsy", tab: "intelligence" },
  { pattern: "/autopsy/:sub", tab: "intelligence" },

  { pattern: "/memory", tab: "memory" },
  // EVERY literal before the param. See the note on MEMORY_LENSES.
  { pattern: "/memory/ask", tab: "memory" },
  { pattern: "/memory/health", tab: "memory" },
  { pattern: "/memory/revival", tab: "memory" },
  { pattern: "/memory/competitors", tab: "memory" },
  { pattern: "/memory/pricing", tab: "memory" },
  { pattern: "/memory/compare", tab: "memory" },
  { pattern: "/memory/:id", tab: "memory" },
  { pattern: "/memory/:id/:panel", tab: "memory" },

  { pattern: "/account" },
  { pattern: "/settings" },
  { pattern: "/settings/:screen" },
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
