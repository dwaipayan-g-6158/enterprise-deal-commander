// Session insight rotation + dedup, mirroring the greeting engine's
// `shown-history.ts` + `select-greeting.ts` (48h dedup window, relax-when-
// empty rotation). Never throws; degrades to "no history" on any storage or
// parse failure.
import type { KeyValueStore } from "@/lib/storage";
import type { Insight } from "./insight-builder";

const SHOWN_HISTORY_KEY = "edc.insights.shown";
const DEDUP_WINDOW_MS = 48 * 60 * 60 * 1000;

interface ShownEntry {
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
function readShownHistory(store: KeyValueStore, now: Date): ShownEntry[] {
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

/** Appends a shown insight id, pruning stale entries first. Never throws. */
function recordShown(store: KeyValueStore, id: string, now: Date): void {
  const pruned = readShownHistory(store, now);
  const next = [...pruned, { id, shownAt: now.toISOString() }];
  try {
    store.setItem(SHOWN_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // localStorage full/unavailable — dedup just won't persist this round.
  }
}

/**
 * Picks one insight from `candidates`: excludes ids shown within the last
 * 48h (relaxing that filter only if it would otherwise leave zero
 * candidates), records the pick, and returns it. Returns `null` for an empty
 * candidate list without touching storage. Never throws.
 */
export function pickInsight(
  candidates: Insight[],
  store: KeyValueStore,
  now: Date,
  random: () => number = Math.random,
): Insight | null {
  if (candidates.length === 0) return null;
  const shownHistory = readShownHistory(store, now);
  const shownIds = new Set(shownHistory.map((s) => s.id));
  const fresh = candidates.filter((c) => !shownIds.has(c.id));
  const pool = fresh.length > 0 ? fresh : candidates;
  const chosen = pool[Math.floor(random() * pool.length)];
  recordShown(store, chosen.id, now);
  return chosen;
}
