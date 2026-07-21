import type { KeyValueStore } from "@/lib/storage";

const SHOWN_HISTORY_KEY = "edc.greetings.shown";
const DEDUP_WINDOW_MS = 48 * 60 * 60 * 1000;

export interface ShownEntry {
  id: string;
  shownAt: string;
}

function isShownEntry(value: unknown): value is ShownEntry {
  const v = value as ShownEntry;
  return (
    typeof value === "object" &&
    value !== null &&
    typeof v.id === "string" &&
    typeof v.shownAt === "string"
  );
}

/** Reads the dedup log, pruning entries older than 48h. Never throws. */
export function readShownHistory(store: KeyValueStore, now: Date): ShownEntry[] {
  let raw: string | null;
  try {
    raw = store.getItem(SHOWN_HISTORY_KEY);
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
  const cutoff = now.getTime() - DEDUP_WINDOW_MS;
  return parsed.filter(
    (e) => isShownEntry(e) && new Date(e.shownAt).getTime() >= cutoff,
  );
}

/** Appends a shown greeting id, pruning stale entries first. Never throws. */
export function recordShown(store: KeyValueStore, id: string, now: Date): void {
  const pruned = readShownHistory(store, now);
  const next = [...pruned, { id, shownAt: now.toISOString() }];
  try {
    store.setItem(SHOWN_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // localStorage full/unavailable — dedup just won't persist this round.
  }
}
