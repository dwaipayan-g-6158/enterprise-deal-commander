// Pure competitive win-rate math. No DB import — the query that feeds it lives
// in lib/catalyst/competitive.ts, which reads the deal↔competitor links out of
// the Data Store and hands the rows here. Keeping the reducer separate from the
// fetch is what lets it be unit-tested without a database at all
// (competitive.test.ts).

/** Our historical win rate (0–1) against one competitor, derived from closed-deal outcomes. */
export interface CompetitorWinRate {
  competitorId: number;
  name: string;
  winRate: number;
}

/** A single deal↔competitor link row reduced into the win-rate tally. */
export interface CompetitorOutcomeRow {
  competitorId: number;
  name: string | null;
  status: string | null;
}

/**
 * Pure reducer: collapse closed-deal competitor link rows into a per-competitor
 * win-rate map. "Won Against" counts as a win, "Lost To" as a loss; every other
 * status (Active, Displaced, …) is ignored for the historical tally. A
 * competitor with no Won/Lost history is absent from the returned map (callers
 * treat that as "no data" → null winRate). Keyed by competitor id.
 *
 * No DB, no clock — same rows in, same map out — so it is unit-testable.
 */
export function reduceWinRates(
  rows: CompetitorOutcomeRow[],
): Map<number, CompetitorWinRate> {
  const tally = new Map<number, { name: string; wins: number; losses: number }>();
  for (const r of rows) {
    const cur = tally.get(r.competitorId) ?? {
      name: r.name ?? "Unknown",
      wins: 0,
      losses: 0,
    };
    if (r.status === "Won Against") cur.wins++;
    if (r.status === "Lost To") cur.losses++;
    // Keep the most recent non-null name we saw for this competitor.
    if (r.name) cur.name = r.name;
    tally.set(r.competitorId, cur);
  }

  const out = new Map<number, CompetitorWinRate>();
  for (const [competitorId, t] of tally) {
    const decided = t.wins + t.losses;
    if (decided === 0) continue; // no history → absent (caller maps to null)
    out.set(competitorId, {
      competitorId,
      name: t.name,
      winRate: t.wins / decided,
    });
  }
  return out;
}
