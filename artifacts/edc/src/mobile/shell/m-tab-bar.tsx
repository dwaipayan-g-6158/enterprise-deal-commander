import { useRef } from "react";
import { markProgrammaticScroll } from "@/mobile/lib/scroll-memory";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { MOBILE_TABS, activeTabId } from "@/mobile/nav/mobile-nav";
import { haptic } from "@/mobile/lib/haptics";
import { useShellScrollRef } from "@/mobile/shell/m-shell";

/** How long the scroll-to-top keeps scrolling after the tap. */
const SMOOTH_TO_TOP_MS = 800;

/**
 * Bottom navigation. Four destinations in the thumb arc — there is no hamburger
 * anywhere in this shell, and no fifth tab, because a fifth shrinks all five.
 *
 * Absolutely positioned rather than a flex sibling so content scrolls beneath
 * the glass instead of stopping at a hard edge; the scroll container carries
 * `pb-tabbar` for clearance.
 *
 * The active state is an iOS tint — colour plus stroke weight — with no pill
 * behind it. A pill and a tint say the same thing twice, and the pill is the
 * more dated half.
 */
export function MTabBar() {
  const [path] = useLocation();
  const scrollRef = useShellScrollRef();
  const active = activeTabId(path);

  /**
   * Which tab the bar showed last.
   *
   * A ref, not module scope. It had to live in module scope while the shell
   * remounted on every navigation — component state could not tell a tab switch
   * apart from a drill-down, so the icons bounced every time someone opened a
   * deal. MShell now mounts once, so ordinary instance state is both correct and
   * survives a fast refresh.
   */
  const previous = useRef<string | undefined>(active);
  const switched = previous.current !== undefined && previous.current !== active;
  previous.current = active;

  return (
    <nav
      // m-vt-tabbar keeps the bar out of the route transition's root snapshot,
      // so it holds still while the screen slides behind it.
      className="m-glass m-glass-bottom m-vt-tabbar absolute inset-x-0 bottom-0 z-40 border-t border-border pb-safe pl-safe pr-safe"
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
                // The label is always on the control, even when the visible text
                // is hidden at the largest Dynamic Type sizes.
                aria-label={tab.label}
                aria-current={isActive ? "page" : undefined}
                onClick={(event) => {
                  if (!isActive) {
                    haptic();
                    return;
                  }
                  // Re-tapping the current tab scrolls its screen to the top, the
                  // iOS convention. Navigating again would push a duplicate
                  // history entry and make back feel broken.
                  event.preventDefault();
                  markProgrammaticScroll(SMOOTH_TO_TOP_MS);
                  scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={cn(
                  "m-tap m-press flex h-16 w-full flex-col items-center justify-center gap-1",
                  isActive ? "text-primary" : "m-muted",
                )}
              >
                <span
                  className={cn(
                    "m-tabbar-icon flex items-center justify-center",
                    isActive && switched && "m-tab-pop",
                  )}
                  style={{ width: "1.375rem", height: "1.375rem" }}
                >
                  <Icon
                    className="h-full w-full"
                    strokeWidth={isActive ? 2.4 : 1.9}
                    aria-hidden="true"
                  />
                </span>
                {/* .m-micro is the rung whose absence made this label hand-roll
                    text-[0.6875rem] with an inline fontWeight and letterSpacing —
                    the concrete evidence that six type styles was one short. */}
                <span className="m-tabbar-label m-micro">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
