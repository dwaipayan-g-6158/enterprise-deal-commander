/**
 * Pure streak calculator: counts consecutive local calendar days with at
 * least one activity-log event, walking backward from today (or yesterday,
 * if today has no activity yet — an in-progress day shouldn't zero out the
 * display). Mirrors `src/lib/weekly/week-boundaries.ts`'s local-time
 * convention: the backend has no timezone awareness anywhere in this app,
 * so this stays entirely client-side, operating on ISO timestamps already
 * fetched via the existing `/v2/activity?since=` endpoint. No new backend
 * endpoint exists for this — see the design spec.
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function computeStreak(occurredAtISOStrings: string[], now: Date): number {
  const activeDays = new Set<string>();
  for (const iso of occurredAtISOStrings) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    activeDays.add(localDateKey(d));
  }

  const todayKey = localDateKey(now);
  const yesterday = new Date(now.getTime() - ONE_DAY_MS);
  const yesterdayKey = localDateKey(yesterday);

  let cursor: Date;
  if (activeDays.has(todayKey)) {
    cursor = now;
  } else if (activeDays.has(yesterdayKey)) {
    cursor = yesterday;
  } else {
    return 0;
  }

  let streak = 0;
  while (activeDays.has(localDateKey(cursor))) {
    streak++;
    cursor = new Date(cursor.getTime() - ONE_DAY_MS);
  }
  return streak;
}
