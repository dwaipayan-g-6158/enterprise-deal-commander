import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { MOBILE_TABS, activeTabId } from "@/mobile/lib/mobile-nav";

/**
 * Bottom navigation. Sits in the thumb arc where the primary destinations
 * belong — there is no hamburger anywhere in the mobile shell.
 *
 * Absolutely positioned rather than a flex sibling so content scrolls beneath
 * the frosted glass instead of stopping at a hard edge. The scroll container
 * carries `pb-tabbar` for clearance.
 */
export function TabBar() {
  const [path] = useLocation();
  const active = activeTabId(path);

  return (
    <nav
      // m-vt-tabbar keeps the bar out of the route transition's root
      // snapshot, so it stays put while the screen slides behind it.
      className="m-glass m-vt-tabbar absolute inset-x-0 bottom-0 z-40 border-t border-[var(--m-keyline)] pb-safe"
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
