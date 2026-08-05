import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/** Where the capsule can send you on the current screen. */
export interface JumpTarget {
  /** Element id to scroll to, without the leading hash. */
  anchorId: string;
  label: string;
  /** Optional trailing value — a count, a score, a percentage. */
  detail?: string;
}

interface CommanderValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  /**
   * Sections the current screen offers. Screens register these so the capsule
   * can offer "jump to Risk" without knowing anything about deal detail.
   */
  jumpTargets: JumpTarget[];
  setJumpTargets: (targets: JumpTarget[]) => void;
}

const CommanderContext = createContext<CommanderValue | undefined>(undefined);

export function useCommander(): CommanderValue {
  const ctx = useContext(CommanderContext);
  if (!ctx) throw new Error("useCommander must be used within a CommanderProvider");
  return ctx;
}

export function CommanderProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [jumpTargets, setJumpTargets] = useState<JumpTarget[]>([]);

  const value = useMemo(
    () => ({ open, setOpen, jumpTargets, setJumpTargets }),
    [open, jumpTargets],
  );

  return <CommanderContext.Provider value={value}>{children}</CommanderContext.Provider>;
}
