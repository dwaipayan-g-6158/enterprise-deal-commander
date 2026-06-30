/**
 * Backfill script: reconstruct pipeline_transitions rows from historical deal_snapshots.
 *
 * For each deal, walks its snapshots in chronological order (by snapshotAt asc)
 * and emits one transition row whenever salesStageId changes (de-duping consecutive
 * equal stages). Uses onConflictDoNothing on (dealId, transitionedAt) for idempotency.
 *
 * Run:
 *   $env:DATABASE_URL = "postgresql://..."
 *   pnpm --filter @workspace/scripts run backfill:transitions
 */

import { asc, eq } from "drizzle-orm";
import {
  db,
  dealSnapshots,
  pipelineTransitions,
  pipelineStages,
  enterpriseDeals,
} from "@workspace/db";
import { computeTransitionType, type StageDef } from "@workspace/engine";

async function main(): Promise<void> {
  // Load all pipeline stage definitions (for sortOrder lookups).
  const stageRows = await db.select().from(pipelineStages);
  const stages: StageDef[] = stageRows.map((s) => ({
    id: s.id,
    name: s.stageName,
    sortOrder: s.sortOrder,
    terminal:
      s.stageName === "Closed-Won"
        ? "won"
        : s.stageName === "Closed-Lost"
          ? "lost"
          : undefined,
  }));
  const sortOrderById = new Map<number, number>(
    stages.map((s) => [s.id, s.sortOrder]),
  );

  // Fetch all deals (we only need id and createdAt as the initial timestamp anchor).
  const deals = await db
    .select({ id: enterpriseDeals.id, createdAt: enterpriseDeals.createdAt })
    .from(enterpriseDeals);

  let inserted = 0;
  let skipped = 0;

  for (const deal of deals) {
    // Fetch this deal's snapshots ordered chronologically.
    const snaps = await db
      .select({
        stageId: dealSnapshots.salesStageId,
        tcv: dealSnapshots.normalizedTcv,
        at: dealSnapshots.snapshotAt,
        by: dealSnapshots.createdBy,
      })
      .from(dealSnapshots)
      .where(eq(dealSnapshots.dealId, deal.id))
      .orderBy(asc(dealSnapshots.snapshotAt));

    // prevAt starts from deal.createdAt (the deal's creation timestamp).
    let prevStageId: number | null = null;
    let prevAt: Date = new Date(deal.createdAt);

    for (const snap of snaps) {
      // Skip snapshots with no stage recorded.
      if (snap.stageId == null) continue;
      // De-duplicate consecutive equal stages.
      if (snap.stageId === prevStageId) continue;

      const toStage = stages.find((s) => s.id === snap.stageId);
      if (!toStage) continue;

      const fromSortOrder =
        prevStageId != null ? (sortOrderById.get(prevStageId) ?? null) : null;
      const transitionType = computeTransitionType(fromSortOrder, toStage);

      const transitionedAt = new Date(snap.at);

      // daysInFromStage: only meaningful when there was a previous stage.
      const daysInFromStage =
        prevStageId != null
          ? Math.max(
              0,
              Math.round(
                (transitionedAt.getTime() - prevAt.getTime()) / 86_400_000,
              ),
            )
          : null;

      // tcvAtTransition: use normalizedTcv from the snapshot.
      const tcvAtTransition = snap.tcv ?? null;

      const result = await db
        .insert(pipelineTransitions)
        .values({
          dealId: deal.id,
          fromStageId: prevStageId,
          toStageId: snap.stageId,
          transitionType,
          tcvAtTransition,
          daysInFromStage,
          overridden: false,
          transitionedAt,
          createdBy: snap.by ?? "backfill",
        })
        .onConflictDoNothing({
          target: [pipelineTransitions.dealId, pipelineTransitions.transitionedAt],
        });

      // onConflictDoNothing returns rowCount 0 when skipped.
      const rowCount = (result as { rowCount?: number }).rowCount ?? 1;
      if (rowCount > 0) {
        inserted++;
      } else {
        skipped++;
      }

      prevStageId = snap.stageId;
      prevAt = transitionedAt;
    }
  }

  console.log(
    `Backfill complete: ${inserted} transition rows inserted, ${skipped} skipped (already existed).`,
  );
  await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("Backfill failed:", e);
  process.exit(1);
});
