import { useEffect, useRef } from "react";
import { popOverlayEntry, pushOverlayEntry } from "@/mobile/lib/back-gesture";

/**
 * Makes the system back gesture close an overlay instead of leaving the screen.
 *
 * ## The bug
 *
 * vaul does not touch history. So on Android, with a sheet open, the back
 * gesture is handled by the router: the sheet stays exactly where it is while
 * the SCREEN BEHIND IT navigates away. The reader is then looking at a sheet
 * belonging to a page they are no longer on, and has to dismiss it to find out
 * that back "worked".
 *
 * This is the most Android-specific defect in the shell, and it is invisible on
 * iOS in a browser tab — which is where most of this gets reviewed.
 *
 * ## How it works
 *
 * Opening pushes a marker history entry. The back gesture pops that entry
 * instead of the screen's, and the listener below closes the sheet. Closing by
 * any other route — the grabber, a fling, the scrim, a confirm button — calls
 * `history.back()` to consume the marker, so the entry never outlives the
 * overlay it belongs to.
 *
 * `skipNextPop` keeps those two paths from fighting: our own `history.back()`
 * fires a popstate that must not be read as a second dismissal.
 *
 * ## Why the listener is installed separately from the marker
 *
 * They look like one effect and cannot be. On close, React runs the previous
 * effect's cleanup BEFORE the new effect body — so a single `[open]` effect
 * would remove its own listener and only then call `history.back()`, leaving
 * the resulting popstate unhandled and `overlayDepth` stuck above zero forever.
 * The gesture layer stands down while that counter is non-zero, so one
 * open/close cycle would permanently disable animated back for the session.
 *
 * The counter cannot simply be decremented before `history.back()` either: the
 * gesture layer would then intercept our own synthetic pop and play a screen
 * transition for what is only a sheet closing.
 */

const MARKER = "__mOverlay";

export function useBackDismiss(open: boolean, onClose: () => void): void {
  const pushedRef = useRef(false);
  const skipNextPopRef = useRef(false);
  // A ref so a caller passing a fresh closure each render cannot re-run the
  // effect and push a second marker.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Installed once, for the component's lifetime.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onPop = () => {
      if (!pushedRef.current) return; // not our entry
      pushedRef.current = false;
      popOverlayEntry();

      if (skipNextPopRef.current) {
        // Our own history.back(); the overlay is already closing.
        skipNextPopRef.current = false;
        return;
      }
      onCloseRef.current();
    };

    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Unmounted while open: release the counter so the gesture layer does not
      // stay stood down. The stranded entry costs one extra back press, which
      // is the lesser failure and is rare — sheets close before they unmount.
      if (pushedRef.current) {
        pushedRef.current = false;
        popOverlayEntry();
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (open && !pushedRef.current) {
      pushedRef.current = true;
      pushOverlayEntry();
      // The shell's history index is carried through untouched: the marker is an
      // extra entry at the same conceptual place, so nothing reads it as a move.
      history.pushState({ ...(history.state ?? {}), [MARKER]: true }, "");
      return;
    }

    if (!open && pushedRef.current) {
      skipNextPopRef.current = true;
      history.back(); // pushedRef and the counter are released by onPop
    }
  }, [open]);
}
