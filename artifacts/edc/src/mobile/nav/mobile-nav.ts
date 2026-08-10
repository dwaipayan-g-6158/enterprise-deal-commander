import { BookMarked, Briefcase, LayoutDashboard, TrendingUp, type LucideIcon } from "lucide-react";

/**
 * The mobile tab model.
 *
 * Pure data and pure functions, no JSX, so it is collected by a vitest config
 * running `environment: "node"` — activeTabId has real branching and shipped for
 * four phases with no test at all.
 */

export interface MobileTab {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Route prefixes that light this tab. A deal panel three levels deep keeps
   * Deals lit, so the bar always answers "where am I".
   */
  prefixes: string[];
}

/**
 * Four tabs for seven desktop areas.
 *
 * A sidebar has seven free slots; a thumb does not. Analytics, Portfolio and
 * Autopsy are all portfolio-level analysis — one activity wearing three hats —
 * so they collapse into Intelligence, which reaches them through a segmented
 * control at its root. Settings and Users move behind the header avatar, where
 * iOS puts account and where user management belongs anyway.
 *
 * INTELLIGENCE KEEPS THE REAL DESKTOP URLS. There is deliberately no
 * `/intelligence` route: inventing one would break the deep-link parity the
 * whole two-shell design rests on, and it would also confuse the transition
 * direction, since `/intelligence` → `/intelligence/portfolio` looks like a push
 * when the user meant a lateral lens switch. The tab owns three prefixes instead.
 */
export const MOBILE_TABS: MobileTab[] = [
  { id: "command", label: "Command", href: "/", icon: LayoutDashboard, prefixes: ["/"] },
  { id: "deals", label: "Deals", href: "/deals", icon: Briefcase, prefixes: ["/deals"] },
  {
    id: "intelligence",
    label: "Intelligence",
    href: "/analytics",
    icon: TrendingUp,
    prefixes: ["/analytics", "/portfolio", "/autopsy"],
  },
  { id: "memory", label: "Memory", href: "/memory", icon: BookMarked, prefixes: ["/memory"] },
];

/** True when `path` is at or below `prefix`. "/" matches only itself. */
function covers(prefix: string, path: string): boolean {
  if (prefix === "/") return path === "/";
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * The tab that owns `path`, or undefined where no tab does — `/account` and
 * `/settings/*` deliberately light nothing, because they are reached from the
 * avatar rather than from the bar, and lighting a tab there would tell the
 * reader they are somewhere they are not.
 */
export function activeTabId(path: string): string | undefined {
  // Longest prefix wins, so "/deals" doesn't lose to "/" — which every path
  // starts with.
  let best: { tab: MobileTab; length: number } | undefined;
  for (const tab of MOBILE_TABS) {
    for (const prefix of tab.prefixes) {
      if (!covers(prefix, path)) continue;
      if (!best || prefix.length > best.length) best = { tab, length: prefix.length };
    }
  }
  return best?.tab.id;
}

/**
 * Every path that counts as a top-level destination rather than a step into
 * one: the four tab roots plus Intelligence's other two lenses.
 *
 * Movement between any two of these is LATERAL. That is a design statement, not
 * an inference — peer destinations have no hierarchy between them, and animating
 * a push implies one. It is why this is a lookup rather than something derived
 * from path depth or history order.
 */
export const LATERAL_ROOTS: readonly string[] = MOBILE_TABS.flatMap((t) => t.prefixes);

export function isLateralRoot(path: string): boolean {
  return LATERAL_ROOTS.includes(pathnameOf(path));
}

/**
 * The path part of a navigation target, without its query or hash.
 *
 * wouter hands `aroundNav` whatever was passed to `navigate()`, which for a
 * filtered list is `/deals?h=RED` — so every path comparison downstream has to
 * strip first. It did not, which made `isLateralRoot("/deals?h=RED")` false and
 * would have animated a filter change as a push.
 */
export function pathnameOf(to: string): string {
  const cut = to.search(/[?#]/);
  return cut === -1 ? to : to.slice(0, cut);
}

/**
 * Whether moving from one location to the other is lateral — no change of depth,
 * so the screens cross-fade rather than pushing.
 *
 * Two cases, and both are design statements rather than inferences:
 *
 *  - **Peer destinations.** The four tab roots and Intelligence's three lenses
 *    have no hierarchy between them, whatever order they were visited in.
 *  - **The same path with a different query.** Filtering, sorting or searching a
 *    list re-cuts the list; it does not go anywhere. This is what lets the Deals
 *    screen push a real history entry for every filter change — so the back
 *    gesture undoes it and the URL stays shareable — without the move animating
 *    as a step deeper into a stack.
 */
export function isLateralMove(fromPath: string, toPath: string): boolean {
  const from = pathnameOf(fromPath);
  const to = pathnameOf(toPath);
  if (from === to) return true;
  return isLateralRoot(from) && isLateralRoot(to);
}

/** The lenses behind the Intelligence tab, in the order the segmented control shows them. */
export const INTELLIGENCE_LENSES = [
  { id: "pipeline", label: "Pipeline", href: "/analytics" },
  { id: "portfolio", label: "Portfolio", href: "/portfolio" },
  { id: "losses", label: "Losses", href: "/autopsy" },
] as const;

export function activeLensId(path: string): string | undefined {
  return INTELLIGENCE_LENSES.find((l) => covers(l.href, path))?.id;
}
