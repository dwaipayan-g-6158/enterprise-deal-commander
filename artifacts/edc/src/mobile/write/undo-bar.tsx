import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Undo2 } from "lucide-react";
import { useWriteStatus } from "@/mobile/write/write-status-context";
import { describeUndo, remainingMs, UNDO_WINDOW_MS } from "@/mobile/write/undo";
import { haptic } from "@/mobile/lib/haptics";

/**
 * The undo offer, above the tab bar.
 *
 * Not a toast, and not vaul. `<Toaster/>` renders outside `.m-shell` — desktop
 * tokens, desktop position, and a limit of one, so a second action would evict
 * the first offer mid-window. vaul would add a drag gesture to something with
 * nothing to drag. A plain bar inside the shell is the whole requirement.
 *
 * A navigation clears it: an undo bar that outlives the screen it belongs to
 * offers to reverse something the reader can no longer see, which is worse than
 * not offering at all.
 */
export function UndoBar({ onUndo }: { onUndo: (entry: NonNullable<ReturnType<typeof useWriteStatus>["undo"]>) => void }) {
  const { undo, clearUndo } = useWriteStatus();
  const [path] = useLocation();
  const [remaining, setRemaining] = useState(UNDO_WINDOW_MS);

  useEffect(() => {
    if (!undo) return;
    clearUndo();
    // Cleared on the FIRST navigation after the offer opens, not on every
    // render — `path` in the dep array is what makes it a navigation trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  useEffect(() => {
    if (!undo) return;
    setRemaining(UNDO_WINDOW_MS);

    let frame = 0;
    const tick = () => {
      const left = remainingMs(undo, performance.now());
      setRemaining(left);
      if (left <= 0) {
        clearUndo();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [undo, clearUndo]);

  if (!undo) return null;

  const progress = remaining / UNDO_WINDOW_MS;

  return (
    <div
      // Above the tab bar and the capsule, clear of the home indicator.
      className="m-card m-vt-capsule absolute inset-x-4 bottom-[var(--m-float-bottom)] z-40 overflow-hidden"
      role="status"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="m-caption min-w-0 flex-1 truncate">{describeUndo(undo.action)}</span>
        <button
          type="button"
          onClick={() => {
            haptic();
            onUndo(undo);
            clearUndo();
          }}
          className="m-label m-press m-tap flex shrink-0 items-center gap-1.5 text-primary"
        >
          <Undo2 className="h-4 w-4" aria-hidden="true" />
          Undo
        </button>
      </div>
      {/* The window, shown rather than guessed at. A countdown the reader cannot
          see is a deadline they will miss. */}
      <div
        aria-hidden="true"
        className="h-0.5 bg-primary transition-none"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}
