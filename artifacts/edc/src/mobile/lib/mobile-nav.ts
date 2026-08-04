import {
  LayoutDashboard,
  Briefcase,
  TrendingUp,
  BookMarked,
  type LucideIcon,
} from "lucide-react";

export interface MobileTab {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Route prefixes that light this tab. A deal detail page keeps Deals lit,
   * so the tab bar always answers "where am I" even three levels deep.
   */
  prefixes: string[];
}

/**
 * The four mobile surfaces. Icons match the desktop sidebar so the two
 * experiences stay recognizably the same product.
 *
 * Portfolio, Autopsy and Settings are deliberately absent: they are dense
 * table and admin surfaces that belong on a desktop. Their routes still
 * resolve (see mobile-app.tsx) so a link shared from a laptop doesn't
 * dead-end, they just aren't reachable from the tab bar.
 */
export const MOBILE_TABS: MobileTab[] = [
  { id: "command", label: "Command", href: "/", icon: LayoutDashboard, prefixes: ["/"] },
  { id: "deals", label: "Deals", href: "/deals", icon: Briefcase, prefixes: ["/deals"] },
  { id: "analytics", label: "Analytics", href: "/analytics", icon: TrendingUp, prefixes: ["/analytics"] },
  { id: "memory", label: "Memory", href: "/memory", icon: BookMarked, prefixes: ["/memory"] },
];

/** The tab that owns `path`, or undefined on a route no tab covers. */
export function activeTabId(path: string): string | undefined {
  // Longest prefix wins, so "/deals" doesn't lose to "/" — which every path
  // starts with.
  let best: MobileTab | undefined;
  for (const tab of MOBILE_TABS) {
    for (const prefix of tab.prefixes) {
      const hit = prefix === "/" ? path === "/" : path === prefix || path.startsWith(`${prefix}/`);
      if (hit && (!best || prefix.length > Math.max(...best.prefixes.map((p) => p.length)))) {
        best = tab;
      }
    }
  }
  return best?.id;
}
