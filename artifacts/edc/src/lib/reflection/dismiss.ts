// Per-day dismissal for End-of-Day Reflection — mirrors
// `src/lib/mission/daily-ack.ts`'s local-date-key convention (reset at
// local midnight), NOT `src/lib/weekly/review-dismiss.ts`'s week-keyed one.

import type { KeyValueStore } from "@/lib/storage";

const DISMISSED_KEY = "edc.reflection.dismissed";

function localDateKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whether today's End-of-Day Reflection has already been dismissed. Never throws. */
export function isDismissedToday(store: KeyValueStore, now: Date): boolean {
  let raw: string | null;
  try {
    raw = store.getItem(DISMISSED_KEY);
  } catch {
    return false;
  }
  return raw === localDateKey(now);
}

/** Marks today's reflection as dismissed (overwrites any prior stored date). Never throws. */
export function dismissToday(store: KeyValueStore, now: Date): void {
  try {
    store.setItem(DISMISSED_KEY, localDateKey(now));
  } catch {
    // localStorage full/unavailable — the dismissal just won't persist this round.
  }
}
