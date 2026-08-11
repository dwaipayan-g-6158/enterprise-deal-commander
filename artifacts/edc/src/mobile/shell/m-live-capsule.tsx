import { useEffect, useState } from "react";
import { Check, Loader2, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { liveStatus, msUntilIdle, type LiveStatus } from "@/mobile/shell/live-status";
import { useWriteStatusOptional } from "@/mobile/write/write-status-context";

/**
 * The one place the shell says what it is doing.
 *
 * Replaces `OfflineStrip`, which could only ever report one binary. The app had
 * no ambient signal at all that a write was in flight: a tap flipped a control
 * optimistically and nothing else happened until — and unless — it failed. On
 * current iOS that gap is worse than it sounds, because `lib/haptics.ts` is a
 * documented no-op since 26.5, so the confirmation gesture the write layer fires
 * beside every success reaches nobody. This is its visible replacement.
 *
 * ## What it deliberately does NOT absorb
 *
 * A failed write stays with `WriteErrorInline`, under the control that failed.
 * Moving it up here would leave the reader looking at a control whose state is
 * now a lie with the explanation somewhere else on screen — the exact reason
 * that component is not a toast.
 *
 * The undo offer stays at the bottom in `UndoBar`. It is an action, not a
 * status, and it needs to be under a thumb; `undo.ts` also clears it on
 * navigation on purpose, which is a per-screen lifetime this chrome does not
 * have.
 *
 * ## Where it renders
 *
 * Inside `MNavBar`, in the slot `OfflineStrip` held, and for the same two
 * reasons: the header already owns `pt-safe`, so a sibling strip would double
 * the status-bar inset or negotiate for it; and the header carries
 * `m-vt-navbar`, which lifts it out of the route transition's snapshot — a strip
 * outside that name would slide away with the content on every navigation.
 *
 * ## Colour
 *
 * Only `offline` carries a fill. `saving` and `saved` paint straight onto the
 * bar's own glass using `--muted-foreground` and `--primary`, which are two of
 * the three foregrounds tokens.test.ts already measures composited over glass.
 * Inventing a new tinted chrome surface would mean a new pair to audit for the
 * sake of two words.
 */
const COPY: Record<LiveStatus, { icon: typeof WifiOff; label: string; className: string }> = {
  offline: {
    icon: WifiOff,
    label: "Offline — showing last-synced data",
    className: "bg-amber-500 text-amber-950",
  },
  saving: { icon: Loader2, label: "Saving…", className: "m-muted" },
  saved: { icon: Check, label: "Saved", className: "text-primary" },
};

export function MLiveCapsule() {
  const write = useWriteStatusOptional();
  const [offline, setOffline] = useState(() =>
    typeof navigator === "undefined" ? false : !navigator.onLine,
  );
  // Re-read on a schedule of its own, because the confirmation window expires on
  // a clock rather than on a state change.
  const [, setTick] = useState(0);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const input = {
    offline,
    writing: write?.hasWritesInFlight ?? false,
    savedAt: write?.savedAt ?? null,
    now: performance.now(),
  };
  const status = liveStatus(input);
  const settleIn = msUntilIdle(input);

  useEffect(() => {
    if (settleIn === null) return;
    // One timeout for the exact remainder, not a poll. Re-armed whenever the
    // remainder changes, which is only when a new save lands.
    const timer = setTimeout(() => setTick((n) => n + 1), settleIn);
    return () => clearTimeout(timer);
  }, [settleIn]);

  // Held through the collapse so the strip has something to draw on its way out
  // instead of emptying and then shrinking.
  const [shown, setShown] = useState<LiveStatus | null>(status);
  useEffect(() => {
    if (status !== null) setShown(status);
  }, [status]);

  // Nothing at all until there has been something to say. Falling back to a
  // state's copy here would park the words "Saving…" in the collapsed strip from
  // first paint — invisible and aria-hidden, so not a defect a reader meets, but
  // it does put a claim in the document that is not true, and it is what any
  // text extraction of the page reads. Measured on the deployed build.
  const held = shown === null ? null : COPY[shown];

  return (
    <div className="m-collapse" data-open={status !== null} aria-hidden={status === null}>
      <div>
        {held === null ? null : (
          <div
            // Polite: a connection dropping, or a write landing, is worth saying
            // and is never worth talking over whatever is being read.
            role="status"
            // Keyed on the state so React remounts the row and m-appear replays —
            // offline to saving is a change of message, not of one word, and
            // swapping the text in place reads as a glitch.
            key={shown}
            className={cn(
              "m-label m-appear flex items-center justify-center gap-1.5 py-1",
              held.className,
            )}
          >
            <held.icon
              className={cn("h-3.5 w-3.5 shrink-0", shown === "saving" && "m-spin")}
              aria-hidden="true"
            />
            {held.label}
          </div>
        )}
      </div>
    </div>
  );
}
