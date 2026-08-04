import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { MOBILE_TABS, activeTabId } from "@/mobile/lib/mobile-nav";

/**
 * Which tab the bar was showing last time it rendered.
 *
 * Module scope rather than component state because MobileShell — and with it
 * this bar — remounts on every navigation, so component state cannot tell a
 * tab switch apart from a drill-down. Without the distinction the icons would
 * bounce every time someone opened a deal.
 */
let previousTabId: string | undefined;

/**
 * Bottom navigation. Sits in the thumb arc where the primary destinations
 * belong — there is no hamburger anywhere in the mobile shell.
 *
 * Absolutely positioned rather than a flex sibling so content scrolls beneath
 * the frosted glass instead of stopping at a hard edge. The scroll container
 * carries `pb-tabbar` for clearance.
 *
 * The active pill needs no animation of its own: the bar carries a
 * view-transition name, so a route change cross-fades it in place and the
 * pill travels with that.
 */
export function TabBar() {
  const [path] = useLocation();
  const active = activeTabId(path);

  // Read once per mount and held for the life of it, so the class cannot be
  // pulled off the icon halfway through its animation.
  const [switched] = useState(() => {
    const changed = previousTabId !== undefined && previousTabId !== active;
    previousTabId = active;
    return changed;
  });

  return (
    <nav
      // m-vt-tabbar keeps the bar out of the route transition's root
      // snapshot, so it stays put while the screen slides behind it.
      className="m-glass m-glass-bottom m-vt-tabbar absolute inset-x-0 bottom-0 z-40 border-t border-[var(--m-keyline)] pb-safe"
      aria-label="Primary"
    >
      <ul className="flex items-stretch">
        {MOBILE_TABS.map((tab) => {
          const isActive = tab.id === active;
          const Icon = tab.icon;
          return (
            <li key={tab.id} className="flex-1">
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "m-tap m-press flex h-16 w-full flex-col items-center justify-center gap-1",
                  isActive ? "text-[var(--m-primary)]" : "m-muted",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200",
                    isActive && "bg-[var(--m-primary-container)]",
                    isActive && switched && "m-tab-pop",
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 1.9} aria-hidden="true" />
                </span>
                <span
                  className="text-[0.6875rem] leading-none"
                  style={{ fontWeight: isActive ? 600 : 500, letterSpacing: "-0.01em" }}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
