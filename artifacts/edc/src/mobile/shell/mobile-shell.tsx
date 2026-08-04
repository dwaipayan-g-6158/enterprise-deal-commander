import {
  createContext,
  useContext,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { TabBar } from "@/mobile/shell/tab-bar";
import { useAppResumeRefetch } from "@/mobile/hooks/use-app-resume-refetch";
import { CommanderProvider } from "@/mobile/commander/commander-context";
import { CommanderButton } from "@/mobile/commander/commander-button";
import { CommanderSheet } from "@/mobile/commander/commander-sheet";
import "@/mobile/mobile.css";

const ScrollContainerContext = createContext<RefObject<HTMLElement | null> | null>(null);

/**
 * The shell's scrolling element. Screens scroll inside this, not the document,
 * so the tab bar and sticky headers stay put — anything that needs to react to
 * scroll (the Commander capsule, pull-to-refresh, collapsing headers) has to
 * listen here rather than on window.
 */
export function useShellScrollRef(): RefObject<HTMLElement | null> {
  const ref = useContext(ScrollContainerContext);
  if (!ref) throw new Error("useShellScrollRef must be used within a MobileShell");
  return ref;
}

/**
 * Chrome shared by every mobile screen: a full-height frame, one scroll
 * container, and the bottom tab bar.
 *
 * 100dvh rather than 100vh so the frame tracks Safari's collapsing address bar
 * instead of hanging the tab bar below the fold.
 */
export function MobileShell({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLElement | null>(null);
  useAppResumeRefetch();

  return (
    <ScrollContainerContext.Provider value={scrollRef}>
      <CommanderProvider>
        <div className="m-shell relative flex h-[100dvh] flex-col overflow-hidden">
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
          <TabBar />
          <CommanderSheet />
        </div>
      </CommanderProvider>
    </ScrollContainerContext.Provider>
  );
}
