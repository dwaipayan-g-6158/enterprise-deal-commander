/**
 * Personality Messages, Rotating (PRD 4.19): generic warm filler for a
 * moment that currently shows nothing, distinct from Phase 1's
 * state-*specific* empty-state copy. Mirrors `lib/greetings/shown-history.ts`'s
 * rolling-window dedup shape (here 72h instead of 48h), with its own key.
 */

import type { KeyValueStore } from "@/lib/storage";
import messagePoolJson from "./message-pool.json";

export interface PersonalityMessage {
  id: string;
  text: string;
}

const defaultMessagePool = messagePoolJson as PersonalityMessage[];

const SHOWN_KEY = "edc.personality.shown";
const DEDUP_WINDOW_MS = 72 * 60 * 60 * 1000;

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

function readShownHistory(store: KeyValueStore, now: Date): ShownEntry[] {
  let raw: string | null;
  try {
    raw = store.getItem(SHOWN_KEY);
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
  return parsed.filter((e) => isShownEntry(e) && new Date(e.shownAt).getTime() >= cutoff);
}

function recordShown(store: KeyValueStore, pruned: ShownEntry[], id: string, now: Date): void {
  const next = [...pruned, { id, shownAt: now.toISOString() }];
  try {
    store.setItem(SHOWN_KEY, JSON.stringify(next));
  } catch {
    // localStorage full/unavailable — dedup just won't persist this round.
  }
}

/** Picks an unseen-within-72h personality message, resetting once the pool is exhausted. Never throws. */
export function pickPersonalityMessage(
  store: KeyValueStore,
  now: Date,
  pool: PersonalityMessage[] = defaultMessagePool,
): PersonalityMessage {
  const pruned = readShownHistory(store, now);
  const shownIds = pruned.map((e) => e.id);
  const unseen = pool.filter((m) => !shownIds.includes(m.id));
  const candidates = unseen.length > 0 ? unseen : pool;
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  const historyBase = unseen.length > 0 ? pruned : [];
  recordShown(store, historyBase, picked.id, now);
  return picked;
}
