// Pure. Same constraint as adapters.ts in this directory: no React, no "@/"
// imports — vitest.config.ts is standalone with no resolve.alias, so anything
// reachable from a *.test.ts here must be imported by relative path.
import { dayKey } from "../../../lib/format";
import type { TimelineKind, TimelineRow } from "./adapters";

/**
 * What a deal's history adds up to, so the reader does not have to count.
 *
 * The Record tab's two views were pure enumeration — one line per event, newest
 * first, forever. That answers "what happened at 14:32 on Tuesday", which is
 * almost never the question. The question is "has anything actually moved on
 * this deal, and where", and forty rows do not answer it at a glance on a phone.
 *
 * Everything here folds rows the client already has. Neither endpoint returns
 * grouped counts, and at the page sizes these views use (40 on mobile, 50–200 on
 * desktop) asking the server for them would buy nothing.
 */

export interface KindCount {
  kind: TimelineKind;
  count: number;
}

export interface HistoryDigest {
  total: number;
  /** Inclusive days between the oldest and newest row, or null if undatable. */
  spanDays: number | null;
  /** Distinct actors, most active first. */
  actors: { name: string; count: number }[];
  /** Counts per kind, largest first. Kinds with no rows are omitted. */
  byKind: KindCount[];
  /** The day with the most activity — usually the day the deal actually moved. */
  busiestDay: { day: string; count: number } | null;
  /** Newest row's timestamp, for "last touched". */
  latestAt: string | null;
}

const DAY = 86_400_000;

function inclusiveDays(from: number, to: number): number {
  return Math.max(1, Math.round((to - from) / DAY) + 1);
}

export function digestHistory(rows: TimelineRow[]): HistoryDigest {
  if (rows.length === 0) {
    return { total: 0, spanDays: null, actors: [], byKind: [], busiestDay: null, latestAt: null };
  }

  const kindCounts = new Map<TimelineKind, number>();
  const actorCounts = new Map<string, number>();
  const dayCounts = new Map<string, number>();
  const times: number[] = [];
  let latestAt: string | null = null;
  let latestT = -Infinity;

  for (const row of rows) {
    kindCounts.set(row.kind, (kindCounts.get(row.kind) ?? 0) + 1);
    // An unattributed row is real — system events have no actor — and must not
    // become an "" entry in the contributor list.
    if (row.actor) actorCounts.set(row.actor, (actorCounts.get(row.actor) ?? 0) + 1);

    const t = new Date(row.at).getTime();
    if (Number.isFinite(t)) {
      times.push(t);
      const day = dayKey(row.at);
      dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
      if (t > latestT) {
        latestT = t;
        latestAt = row.at;
      }
    }
  }

  const busiest = [...dayCounts.entries()].sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1),
  )[0];

  return {
    total: rows.length,
    spanDays:
      times.length > 0 ? inclusiveDays(Math.min(...times), Math.max(...times)) : null,
    actors: [...actorCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    byKind: [...kindCounts.entries()]
      .map(([kind, count]) => ({ kind, count }))
      // Ties broken by kind name so the order is stable across renders rather
      // than dependent on Map insertion, which follows the payload.
      .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind)),
    busiestDay: busiest ? { day: busiest[0], count: busiest[1] } : null,
    latestAt,
  };
}

/** Plural-safe wording for a kind's count — "3 stage moves", "1 gate update". */
const KIND_NOUN: Record<TimelineKind, [singular: string, plural: string]> = {
  field: ["field edit", "field edits"],
  stage: ["stage move", "stage moves"],
  health: ["health change", "health changes"],
  gate: ["gate update", "gate updates"],
  blocker: ["blocker", "blockers"],
  playbook: ["playbook step", "playbook steps"],
  meddpicc: ["qualification answer", "qualification answers"],
  system: ["system event", "system events"],
};

export function describeKindCount({ kind, count }: KindCount): string {
  const [singular, plural] = KIND_NOUN[kind];
  return `${count} ${count === 1 ? singular : plural}`;
}
