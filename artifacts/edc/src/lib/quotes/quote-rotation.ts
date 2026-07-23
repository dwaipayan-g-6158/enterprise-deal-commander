/**
 * Random Professional Quotes (PRD 4.5): one quote per local calendar day,
 * non-repeating until the pool is exhausted. Domain-owned dedup module,
 * mirroring the shape of `lib/greetings/shown-history.ts` but keyed to a
 * calendar day rather than a rolling time window — this codebase keeps one
 * small pure file per feature rather than a shared generic rotation utility.
 */

import type { KeyValueStore } from "@/lib/storage";
import quotePoolJson from "./quote-pool.json";

export interface Quote {
  id: string;
  text: string;
  author?: string;
}

const defaultQuotePool = quotePoolJson as Quote[];

const SHOWN_KEY = "edc.quotes.shown";

interface QuoteRotationState {
  lastPickedDate: string;
  lastPickedId: string;
  shownIds: string[];
}

function isQuoteRotationState(value: unknown): value is QuoteRotationState {
  const v = value as QuoteRotationState;
  return (
    typeof value === "object" &&
    value !== null &&
    typeof v.lastPickedDate === "string" &&
    typeof v.lastPickedId === "string" &&
    Array.isArray(v.shownIds) &&
    v.shownIds.every((id) => typeof id === "string")
  );
}

function localDateKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readState(store: KeyValueStore): QuoteRotationState | null {
  let raw: string | null;
  try {
    raw = store.getItem(SHOWN_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isQuoteRotationState(parsed) ? parsed : null;
}

function writeState(store: KeyValueStore, state: QuoteRotationState): void {
  try {
    store.setItem(SHOWN_KEY, JSON.stringify(state));
  } catch {
    // localStorage full/unavailable — the rotation just won't persist this round.
  }
}

/** Picks (and memoizes for the rest of the local day) today's quote. Never throws. */
export function pickDailyQuote(
  store: KeyValueStore,
  now: Date,
  pool: Quote[] = defaultQuotePool,
): Quote {
  const todayKey = localDateKey(now);
  const state = readState(store);

  if (state && state.lastPickedDate === todayKey) {
    const cached = pool.find((q) => q.id === state.lastPickedId);
    if (cached) return cached;
  }

  const priorShown = state?.shownIds ?? [];
  const unseenPool = pool.filter((q) => !priorShown.includes(q.id));
  const candidates = unseenPool.length > 0 ? unseenPool : pool;
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  const shownIds = unseenPool.length > 0 ? [...priorShown, picked.id] : [picked.id];

  writeState(store, { lastPickedDate: todayKey, lastPickedId: picked.id, shownIds });
  return picked;
}
