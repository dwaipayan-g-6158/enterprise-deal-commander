import type { KeyValueStore } from "@/lib/storage";

const DISMISSED_KEY = "edc.weekly.dismissed";
// Keep the persisted list small — a handful of week keys is all this ever
// needs; prune-on-write avoids unbounded growth in localStorage over years
// of use (mirrors the never-throw, prune-on-write convention in
// `src/lib/greetings/shown-history.ts`).
const MAX_ENTRIES = 12;

/** Reads the set of dismissed week keys. Never throws. */
function readDismissed(store: KeyValueStore): string[] {
  let raw: string | null;
  try {
    raw = store.getItem(DISMISSED_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((v): v is string => typeof v === "string");
}

/** Whether `weekKey` has already been dismissed for its week. Never throws. */
export function isDismissed(store: KeyValueStore, weekKey: string): boolean {
  return readDismissed(store).includes(weekKey);
}

/** Marks `weekKey` as dismissed, pruning to the most recent entries. Never throws. */
export function dismiss(store: KeyValueStore, weekKey: string): void {
  const existing = readDismissed(store).filter((k) => k !== weekKey);
  const next = [...existing, weekKey].slice(-MAX_ENTRIES);
  try {
    store.setItem(DISMISSED_KEY, JSON.stringify(next));
  } catch {
    // localStorage full/unavailable — the dismissal just won't persist this round.
  }
}
