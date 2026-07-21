import type { KeyValueStore } from "@/lib/storage";

const RECENT_DEALS_KEY = "edc.recentDeals";
const MAX_RECENT = 5;

export interface RecentDealEntry {
  dealId: string;
  dealName: string;
  stageName: string;
  visitedAt: string;
}

function isRecentDealEntry(value: unknown): value is RecentDealEntry {
  const v = value as RecentDealEntry;
  return (
    typeof value === "object" &&
    value !== null &&
    typeof v.dealId === "string" &&
    typeof v.dealName === "string" &&
    typeof v.stageName === "string" &&
    typeof v.visitedAt === "string"
  );
}

/** Reads the recently-visited-deals list, most recent first. Never throws. */
export function readRecentDeals(store: KeyValueStore): RecentDealEntry[] {
  let raw: string | null;
  try {
    raw = store.getItem(RECENT_DEALS_KEY);
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
  return parsed.filter(isRecentDealEntry);
}

/** Records a deal visit: moves it to the front, dedupes by dealId, caps at 5. Never throws. */
export function recordDealVisit(
  store: KeyValueStore,
  entry: Omit<RecentDealEntry, "visitedAt">,
  now: Date,
): void {
  const existing = readRecentDeals(store).filter(
    (d) => d.dealId !== entry.dealId,
  );
  const next = [{ ...entry, visitedAt: now.toISOString() }, ...existing].slice(
    0,
    MAX_RECENT,
  );
  try {
    store.setItem(RECENT_DEALS_KEY, JSON.stringify(next));
  } catch {
    // localStorage full/unavailable — Continue Working just won't update this round.
  }
}
