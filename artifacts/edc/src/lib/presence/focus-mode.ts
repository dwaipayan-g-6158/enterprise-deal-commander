/**
 * Focus Mode (part of PRD 4.12): a manual override that suppresses the
 * "soft" human-touch layer (celebration toasts, the daily insight, the
 * sidebar quote, personality messages) while leaving all functional UI
 * untouched. See `focus-mode-context.tsx` for the reactive hook consumers
 * actually use — this module is the underlying storage primitive.
 */

import type { KeyValueStore } from "@/lib/storage";

const FOCUS_MODE_KEY = "edc.presence.focusMode";

export function isFocusModeEnabled(store: KeyValueStore): boolean {
  try {
    return store.getItem(FOCUS_MODE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setFocusMode(store: KeyValueStore, enabled: boolean): void {
  try {
    store.setItem(FOCUS_MODE_KEY, enabled ? "true" : "false");
  } catch {
    // localStorage full/unavailable — the toggle just won't persist this round.
  }
}
