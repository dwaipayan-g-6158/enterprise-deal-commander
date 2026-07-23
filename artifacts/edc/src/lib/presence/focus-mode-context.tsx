import { createContext, useContext, useState, type ReactNode } from "react";
import { defaultStore } from "@/lib/storage";
import { isFocusModeEnabled, setFocusMode } from "./focus-mode";

interface FocusModeContextValue {
  enabled: boolean;
  toggle: () => void;
}

const FocusModeContext = createContext<FocusModeContextValue | undefined>(undefined);

// Mounted once at the app root (see App.tsx) so every consumer — the sidebar
// toggle, CelebrationWatcher, the DailyBar insight segment, the sidebar
// quote, PersonalityLine — shares one live value instead of each reading
// localStorage independently (which wouldn't react to a same-tab toggle).
export function FocusModeProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(() => isFocusModeEnabled(defaultStore));

  function toggle() {
    setEnabled((prev) => {
      const next = !prev;
      setFocusMode(defaultStore, next);
      return next;
    });
  }

  return (
    <FocusModeContext.Provider value={{ enabled, toggle }}>{children}</FocusModeContext.Provider>
  );
}

export function useFocusMode(): FocusModeContextValue {
  const ctx = useContext(FocusModeContext);
  if (!ctx) throw new Error("useFocusMode must be used within a FocusModeProvider");
  return ctx;
}
