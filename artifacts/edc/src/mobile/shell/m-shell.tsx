import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { MTabBar } from "@/mobile/shell/m-tab-bar";
import { applyTypeScale } from "@/mobile/lib/dynamic-type";
import { forgetScrollMemory, installScrollMemory } from "@/mobile/lib/scroll-memory";
import { useAppResumeRefetch } from "@/mobile/hooks/use-app-resume-refetch";
import { CommanderProvider } from "@/mobile/commander/commander-context";
import { CommanderButton } from "@/mobile/commander/commander-button";
import { CommanderSheet } from "@/mobile/commander/commander-sheet";

const ScrollContainerContext = createContext<RefObject<HTMLElement | null> | null>(null);

/**
 * The shell's scrolling element. Screens scroll inside this, not the document,
 * so the tab bar and sticky headers stay put — anything reacting to scroll (the
 * Commander capsule, pull-to-refresh, the large-title collapse) listens here
 * rather than on window.
 */
export function useShellScrollRef(): RefObject<HTMLElement | null> {
  const ref = useContext(ScrollContainerContext);
  if (!ref) throw new Error("useShellScrollRef must be used within an MShell");
  return ref;
}

/**
 * Chrome shared by every mobile screen: a full-height frame, one scroll
 * container, the tab bar and the Commander.
 *
 * ## This component mounts ONCE, and that is the point
 *
 * It used to render inside each `<Route>`. Different Route elements are
 * different component instances, so React unmounted and remounted the whole
 * shell on every navigation — tab-bar.tsx documents the symptom and works
 * around it by keeping its previous-tab state in module scope.
 *
 * Three things in this slice are impossible under that remount:
 *   - scroll restoration, because the container is a new element each time;
 *   - the large-title collapse, whose ResizeObserver would be torn down and
 *     rebuilt mid-transition;
 *   - stable chrome during a view transition, since a remounted element cannot
 *     hold a view-transition-name across the snapshot.
 *
 * So the Switch renders BELOW this, not around it. See mobile-app.tsx.
 *
 * 100dvh rather than 100vh so the frame tracks Safari's collapsing address bar
 * instead of hanging the tab bar below the fold.
 */
export function MShell({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  useAppResumeRefetch();

  // Dynamic Type. Re-measured on pageshow as well as at mount: iOS text size is
  // changed in Settings, which means leaving the app and coming back, and a
  // bfcache restore fires pageshow without re-running effects.
  useEffect(() => {
    applyTypeScale();
    const remeasure = () => applyTypeScale();
    window.addEventListener("pageshow", remeasure);
    return () => window.removeEventListener("pageshow", remeasure);
  }, []);

  useEffect(() => {
    installScrollMemory(scrollRef.current);
    return forgetScrollMemory;
  }, []);

  /**
   * Publishes whether the screen can actually scroll.
   *
   * This is what resolves the large-title collapse's polarity problem, which
   * neither pure-CSS answer could. Hidden-by-default loses the compact title on
   * a short screen, under reduced motion, and on any engine without
   * `animation-timeline`. Visible-by-default shows the title TWICE on a short
   * screen — once in the bar, once in the flow. Neither is acceptable, and the
   * difference between them is not a style question, it is whether the screen
   * scrolls at all. So measure it.
   *
   * Both the container and its content are observed: a ResizeObserver on the
   * container alone never fires when content grows inside a fixed-height box,
   * which is exactly the case here.
   */
  useEffect(() => {
    const el = scrollRef.current;
    const frame = frameRef.current;
    if (!el || !frame || typeof ResizeObserver === "undefined") return;

    const measure = () => {
      const scrollable = el.scrollHeight > el.clientHeight + 8;
      frame.dataset.mScrollable = String(scrollable);
    };

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, [children]);

  return (
    <ScrollContainerContext.Provider value={scrollRef}>
      <CommanderProvider>
        <div
          ref={frameRef}
          className="m-shell relative flex h-[100dvh] flex-col overflow-hidden"
          // vaul scales this back when a sheet presents, giving the iOS card
          // stack. It works here because the frame is already a fixed-height,
          // non-scrolling box, which is what vaul's wrapper has to be.
          data-vaul-drawer-wrapper=""
        >
          <main
            ref={scrollRef}
            // overscroll-contain stops a rubber-band at the end of a list from
            // scrolling the page behind it (and, in the installed PWA, from
            // triggering the OS pull-to-dismiss).
            className="flex-1 overflow-y-auto overscroll-y-contain pb-tabbar"
          >
            {children}
          </main>
          <CommanderButton />
          <MTabBar />
          <CommanderSheet />
        </div>
      </CommanderProvider>
    </ScrollContainerContext.Provider>
  );
}
