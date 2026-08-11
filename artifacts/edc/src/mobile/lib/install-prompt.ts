/**
 * Captures the browser's install prompt so the app can offer it later.
 *
 * ## Why this is module scope and not a hook
 *
 * `beforeinstallprompt` fires ONCE, early, and often before React has mounted
 * anything. A hook that subscribes on mount misses it and the button never
 * appears. So the listener installs at import time and holds the event; a
 * component subscribes afterwards and is told what was already captured.
 *
 * ## Chromium only, and that is not a bug to fix
 *
 * iOS Safari does not implement `beforeinstallprompt` at all — installing there
 * is Share → Add to Home Screen, which no API can trigger. Anything rendered
 * from this must therefore be conditional on an event that will never arrive on
 * iOS, rather than a button that does nothing when tapped.
 */

/** The Chromium-only event. Not in lib.dom, so it is described here. */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function announce(): void {
  for (const l of listeners) l();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Without this the browser shows its own mini-infobar, which competes with
    // the in-app affordance and is easy to dismiss forever by accident.
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    announce();
  });

  window.addEventListener("appinstalled", () => {
    installed = true;
    // The captured event is single-use and now meaningless.
    deferred = null;
    announce();
  });
}

/**
 * True when the app is already running as an installed app, in which case the
 * browser never fires the event and offering to install would be nonsense.
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS's non-standard equivalent, still the only signal there.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function canInstall(): boolean {
  return deferred !== null && !installed && !isStandalone();
}

/**
 * Shows the browser's own install dialog.
 *
 * Returns the user's choice, or "unavailable" if there was nothing to show.
 * The event cannot be reused: whatever the outcome, it is discarded and the
 * affordance disappears until the browser decides to offer another one.
 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferred;
  if (!event) return "unavailable";
  deferred = null;
  announce();
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome;
  } catch {
    return "unavailable";
  }
}

/** Subscribe to availability changes. Returns an unsubscribe function. */
export function onInstallAvailabilityChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test seam. */
export function _resetInstallPrompt(): void {
  deferred = null;
  installed = false;
  listeners.clear();
}

/** Test seam: inject a captured event without a real browser. */
export function _setDeferredForTest(event: InstallPromptEvent | null): void {
  deferred = event;
  announce();
}
