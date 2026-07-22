// Daily-reset acknowledgment store for the Daily Mission checklist. Checking
// a row is an acknowledgment ("done for today"), not a status mutation — the
// four Next-Actions source categories (a decision, a playbook step, a close
// date) have no single shared "complete" action, so this is the honest,
// uniform semantic. The ack set resets automatically at local midnight: the
// payload is scoped to today's LOCAL calendar date, so a stale date on read
// is simply treated as empty.

import type { KeyValueStore } from "@/lib/storage";

const ACKED_KEY = "edc.mission.acked";

interface AckedPayload {
  date: string;
  ids: string[];
}

/** "YYYY-MM-DD" from the local calendar date — deliberately not a UTC ISO slice. */
function localDateKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isAckedPayload(value: unknown): value is AckedPayload {
  const v = value as AckedPayload;
  return (
    typeof value === "object" &&
    value !== null &&
    typeof v.date === "string" &&
    Array.isArray(v.ids) &&
    v.ids.every((id) => typeof id === "string")
  );
}

/**
 * Reads today's acknowledged ids. Returns `[]` when nothing is stored, the
 * stored payload is corrupted/malformed, or the stored date isn't today's
 * local date. Never throws.
 */
export function readAcked(store: KeyValueStore, now: Date): string[] {
  let raw: string | null;
  try {
    raw = store.getItem(ACKED_KEY);
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
  if (!isAckedPayload(parsed)) return [];
  if (parsed.date !== localDateKey(now)) return [];
  return parsed.ids;
}

/**
 * Toggles `id` in today's ack set (adds if absent, removes if present). A
 * stale (non-today) stored date is discarded rather than appended to, so
 * yesterday's acks never leak into today. Never throws.
 */
export function toggleAck(store: KeyValueStore, id: string, now: Date): void {
  const current = readAcked(store, now);
  const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  const payload: AckedPayload = { date: localDateKey(now), ids: next };
  try {
    store.setItem(ACKED_KEY, JSON.stringify(payload));
  } catch {
    // localStorage full/unavailable — the toggle just won't persist this round.
  }
}
