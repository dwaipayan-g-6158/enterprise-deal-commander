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
  return LATERAL_ROOTS.includes(path);
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
