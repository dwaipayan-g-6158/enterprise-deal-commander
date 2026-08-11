import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { UndoEntry } from "@/mobile/write/undo";

interface WriteStatusValue {
  /** True while any mobile write is in flight. */
  hasWritesInFlight: boolean;
  begin: (key: string) => void;
  end: (key: string) => void;
  /**
   * Serialises work per key. The playbook hooks are shared instances whose
   * concurrent calls are not safe, and a phone invites exactly that: a thumb
   * ticking three steps in under a second.
   */
  runSerial: <T>(key: string, task: () => Promise<T>) => Promise<T>;
  undo: UndoEntry | null;
  offerUndo: (entry: UndoEntry) => void;
  clearUndo: () => void;
  /**
   * When a write last SUCCEEDED, for the shell's live strip to confirm.
   *
   * Separate from `end`, which runs in a finally and therefore fires just as
   * readily for a write that failed. A confirmation derived from `end` would
   * announce "Saved" over a rolled-back optimistic patch, which is the one thing
   * this write layer is built not to do.
   */
  savedAt: number | null;
  /** Call on the success path only, beside the haptic. */
  noteSaved: () => void;
}

const WriteStatusContext = createContext<WriteStatusValue | null>(null);

/**
 * In-flight tracking and the single undo slot.
 *
 * ## Why this counts writes itself instead of calling useIsMutating
 *
 * `useIsMutating` is a React Query mutation primitive, and the allowlist test
 * bans every one of them from the whole mobile subtree — including this
 * directory. That ban is not incidental: with `useMutation` unavailable
 * anywhere, the six allowlisted generated hooks become the ONLY door a write can
 * come through, which is what makes the allowlist exhaustive rather than
 * merely long. Counting by hand is the price of that guarantee, and it is small.
 *
 * ## What the counter is for
 *
 * `useAppResumeRefetch` refetches every stale active query when the tab becomes
 * visible again. Backgrounding the app mid-write — which is precisely what
 * happens when someone taps and the phone locks — would land that refetch on top
 * of an optimistic patch and silently revert it. The resume hook bails while
 * this is true.
 */
export function WriteStatusProvider({ children }: { children: ReactNode }) {
  const [inFlight, setInFlight] = useState(0);
  const [undo, setUndo] = useState<UndoEntry | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const chains = useRef(new Map<string, Promise<unknown>>());

  const begin = useCallback((_key: string) => setInFlight((n) => n + 1), []);
  const end = useCallback((_key: string) => setInFlight((n) => Math.max(0, n - 1)), []);
  // performance.now(), matching undo.ts's openedAt — the two windows are read by
  // the same shell and a wall clock that jumps would desynchronise them.
  const noteSaved = useCallback(() => setSavedAt(performance.now()), []);

  const runSerial = useCallback(
    <T,>(key: string, task: () => Promise<T>): Promise<T> => {
      const previous = chains.current.get(key) ?? Promise.resolve();
      // `.catch` before chaining, so one failure does not poison every later
      // action queued behind it.
      const next = previous.catch(() => undefined).then(task);
      chains.current.set(
        key,
        next.catch(() => undefined),
      );
      return next;
    },
    [],
  );

  const value = useMemo<WriteStatusValue>(
    () => ({
      hasWritesInFlight: inFlight > 0,
      begin,
      end,
      runSerial,
      undo,
      offerUndo: setUndo,
      clearUndo: () => setUndo(null),
      savedAt,
      noteSaved,
    }),
    [inFlight, undo, savedAt, begin, end, runSerial, noteSaved],
  );

  return <WriteStatusContext.Provider value={value}>{children}</WriteStatusContext.Provider>;
}

export function useWriteStatus(): WriteStatusValue {
  const ctx = useContext(WriteStatusContext);
  if (!ctx) throw new Error("useWriteStatus must be used within a WriteStatusProvider");
  return ctx;
}

/** Safe outside the provider — for shared code that may render on either shell. */
export function useWriteStatusOptional(): WriteStatusValue | null {
  return useContext(WriteStatusContext);
}
