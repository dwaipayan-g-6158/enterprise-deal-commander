/**
 * Backfill script: reconstruct pipeline_transitions rows for deals whose
 * stage history predates the pipeline-transitions subscriber (or, for
 * seed-inserted deals, never went through an update at all).
 *
 * Four passes, run in order, each idempotent via
 * onConflictDoNothing({ target: [dealId, transitionedAt] }):
 *
 *   Pass A (richest source): reconstruct from deal_audit_log's
 *     field_changed = 'sales_stage_id' rows. This is written synchronously on
 *     every stage change via the update path (routes/deals.ts), so it's
 *     denser and more complete than periodic snapshots. Only deals with at
 *     least one such audit row are covered by this pass. deal_audit_log
 *     carries no TCV of its own, so every row this pass inserts uses the
 *     deal's own CURRENT flat TCV (not historically precise if revenue
 *     changed since, but far better than a silent null/zero).
 *
 *   Pass B (fallback source): the original deal_snapshots-based
 *     reconstruction, run ONLY for deals Pass A didn't cover (no audit-log
 *     stage-change history at all) — this avoids inserting two independently
 *     reconstructed, possibly-divergent partial histories for the same deal.
 *
 *   Pass C (synthetic create floor): for ANY deal — open or closed — still
 *     missing a "create" transition after A and B (most commonly a
 *     seed-inserted deal that was never updated via the API, so it has no
 *     audit trail and no snapshot history), insert one: fromStageId null,
 *     toStageId = the deal's CURRENT stage (the only stage recoverable for
 *     a deal with zero history), transitionedAt = createdAt. Without this,
 *     such a deal contributes nothing to the value bridge's Created total
 *     even though it's plainly present in the open pipeline (or already
 *     closed) — which is exactly what drove "Still open" negative and
 *     silently floored to 0.
 *
 *   Pass D (synthetic exit floor): for any deal currently in a terminal
 *     stage still missing an exit_won/exit_lost row after A, B, and C,
 *     insert one: fromStageId null (the true prior stage is unrecoverable),
 *     toStageId = current stage, transitionedAt = stageEnteredAt.
 *
 *   Both C and D use the deal's own current flatTcv (not a snapshot lookup,
 *   which would find nothing for a deal with no history) and are tagged
 *   createdBy = "backfill-synthetic-create" / "backfill-synthetic-exit".
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
  dealAuditLog,
} from "@workspace/db";
import { computeTransitionType, type StageDef } from "@workspace/engine";

// Flat TCV — productRevenue + servicesRevenue. Same formula as
// deal-filters.ts's flatTcv (kept local for the same package-boundary
// reason above) — matches every OTHER analytics route on this branch
// (/analytics/pipeline, /analytics/simulation, ...), so a synthetic
// transition's TCV agrees with the rest of the app rather than
// disagreeing on multi-year deals via a term-aware formula used nowhere
// else here.
function flatTcv(row: { productRevenue: unknown; servicesRevenue: unknown }): number {
  return (Number(row.productRevenue) || 0) + (Number(row.servicesRevenue) || 0);
}

interface InsertArgs {
  dealId: string;
  fromStageId: number | null;
  toStageId: number;
  transitionType: ReturnType<typeof computeTransitionType>;
  tcvAtTransition: string | null;
  daysInFromStage: number | null;
  transitionedAt: Date;
  createdBy: string;
}

async function insertTransition(args: InsertArgs): Promise<boolean> {
  const result = await db
    .insert(pipelineTransitions)
    .values({ ...args, overridden: false })
    .onConflictDoNothing({
      target: [pipelineTransitions.dealId, pipelineTransitions.transitionedAt],
    });
  return ((result as unknown as { rowCount?: number }).rowCount ?? 1) > 0;
}

async function main(): Promise<void> {
  const stageRows = await db.select().from(pipelineStages);
  const stages: StageDef[] = stageRows.map((s) => ({
    id: s.id,
    name: s.stageName,
    sortOrder: s.sortOrder,
    terminal:
      s.stageName === "Closed-Won" ? "won" : s.stageName === "Closed-Lost" ? "lost" : undefined,
  }));
  const sortOrderById = new Map<number, number>(stages.map((s) => [s.id, s.sortOrder]));
  const stageById = new Map<number, StageDef>(stages.map((s) => [s.id, s]));

  // All deals, not filtered by notDeletedFilter — a soft-deleted deal's
  // history is still real history; it's the live analytics ROUTES that
  // exclude soft-deleted rows, not this reconstruction.
  const deals = await db
    .select({
      id: enterpriseDeals.id,
      createdAt: enterpriseDeals.createdAt,
      salesStageId: enterpriseDeals.salesStageId,
      stageEnteredAt: enterpriseDeals.stageEnteredAt,
      productRevenue: enterpriseDeals.productRevenue,
      servicesRevenue: enterpriseDeals.servicesRevenue,
    })
    .from(enterpriseDeals);
  // Each deal's current flat TCV — the best available approximation for a
  // reconstructed transition's tcvAtTransition. deal_audit_log carries no
  // TCV of its own, so without this every Pass A row would insert `null`,
  // making it contribute exactly 0 to the value bridge, Sankey value mode,
  // and recycled-value — not historically precise (revenue may have
  // changed since), but far better than a silent zero for a real deal.
  const flatTcvByDeal = new Map(deals.map((d) => [d.id, flatTcv(d)]));

  // Transitions that already exist BEFORE this run — a deal updated through
  // the live update path writes an audit_log row AND fires the
  // pipeline-transitions subscriber for the SAME change in the same request,
  // so deal_audit_log-reconstructed events can collide with a transition
  // that's already correctly recorded. The two independently-generated
  // timestamps (audit_log.changed_at vs. the subscriber's own `new Date()`)
  // land a few milliseconds apart, not exactly equal, so
  // onConflictDoNothing's exact (dealId, transitionedAt) key does NOT catch
  // this — it inserted a near-duplicate exit_won/exit_lost row per deal in
  // an earlier run of this script, double-counting a handful of real exits.
  // Matched by (dealId, fromStageId, toStageId) within a generous window
  // instead of an exact timestamp.
  const DEDUP_WINDOW_MS = 5 * 60 * 1000;
  const preExisting = await db.select().from(pipelineTransitions);
  const existingByDeal = new Map<string, typeof preExisting>();
  for (const r of preExisting) {
    const arr = existingByDeal.get(r.dealId) ?? [];
    arr.push(r);
    existingByDeal.set(r.dealId, arr);
  }
  function findExistingNearby(
    dealId: string,
    fromStageId: number | null,
    toStageId: number,
    at: Date,
    isCreate: boolean,
  ) {
    const list = existingByDeal.get(dealId);
    if (!list) return null;
    return (
      list.find((r) => {
        if (isCreate) return r.transitionType === "create";
        return (
          r.fromStageId === fromStageId &&
          r.toStageId === toStageId &&
          Math.abs(new Date(r.transitionedAt).getTime() - at.getTime()) <= DEDUP_WINDOW_MS
        );
      }) ?? null
    );
  }

  let insertedA = 0;
  let skippedA = 0;
  let dedupedA = 0;

  /* ---------------------------------------------- Pass A: deal_audit_log */

  const auditRows = await db
    .select({
      dealId: dealAuditLog.dealId,
      oldValue: dealAuditLog.oldValue,
      newValue: dealAuditLog.newValue,
      changedAt: dealAuditLog.changedAt,
    })
    .from(dealAuditLog)
    .where(eq(dealAuditLog.fieldChanged, "sales_stage_id"))
    .orderBy(asc(dealAuditLog.dealId), asc(dealAuditLog.changedAt));

  const byDeal = new Map<string, typeof auditRows>();
  for (const r of auditRows) {
    const arr = byDeal.get(r.dealId) ?? [];
    arr.push(r);
    byDeal.set(r.dealId, arr);
  }
  const dealsCoveredByA = new Set(byDeal.keys());
  const createdAtByDeal = new Map(deals.map((d) => [d.id, d.createdAt]));

  for (const [dealId, rows] of byDeal) {
    let prevStageId: number | null = null;
    let prevAt: Date = new Date(createdAtByDeal.get(dealId) ?? rows[0].changedAt);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      // The first audit row's oldValue is the stage the deal was CREATED in
      // (audit log only captures changes, not the initial insert) — emit a
      // synthetic "create" transition for it before walking the real moves.
      if (i === 0) {
        const createdStageId = row.oldValue != null && row.oldValue !== "" ? Number(row.oldValue) : null;
        if (createdStageId != null && stageById.has(createdStageId)) {
          const existingCreate = findExistingNearby(dealId, null, createdStageId, prevAt, true);
          if (existingCreate) {
            dedupedA++;
            prevStageId = createdStageId;
            prevAt = new Date(existingCreate.transitionedAt);
          } else {
            const ok = await insertTransition({
              dealId,
              fromStageId: null,
              toStageId: createdStageId,
              transitionType: "create",
              tcvAtTransition: String(flatTcvByDeal.get(dealId) ?? 0),
              daysInFromStage: null,
              transitionedAt: prevAt,
              createdBy: "backfill-audit-log",
            });
            insertedA += ok ? 1 : 0;
            skippedA += ok ? 0 : 1;
            prevStageId = createdStageId;
          }
        }
      }

      const toStageId = row.newValue != null && row.newValue !== "" ? Number(row.newValue) : null;
      if (toStageId == null || !stageById.has(toStageId)) continue;
      const toStage = stageById.get(toStageId)!;
      const fromSortOrder = prevStageId != null ? (sortOrderById.get(prevStageId) ?? null) : null;
      const transitionType = computeTransitionType(fromSortOrder, toStage);
      const transitionedAt = new Date(row.changedAt);

      const existingMove = findExistingNearby(dealId, prevStageId, toStageId, transitionedAt, false);
      if (existingMove) {
        // Already correctly recorded live for this exact stage move — adopt
        // its real timestamp so the NEXT hop's daysInFromStage is computed
        // from authoritative data, not our reconstructed guess.
        dedupedA++;
        prevStageId = toStageId;
        prevAt = new Date(existingMove.transitionedAt);
        continue;
      }

      const daysInFromStage =
        prevStageId != null
          ? Math.max(0, Math.round((transitionedAt.getTime() - prevAt.getTime()) / 86_400_000))
          : null;

      const ok = await insertTransition({
        dealId,
        fromStageId: prevStageId,
        toStageId,
        transitionType,
        tcvAtTransition: String(flatTcvByDeal.get(dealId) ?? 0), // audit log carries no TCV; use the deal's current flat TCV as the best available approximation
        daysInFromStage,
        transitionedAt,
        createdBy: "backfill-audit-log",
      });
      insertedA += ok ? 1 : 0;
      skippedA += ok ? 0 : 1;

      prevStageId = toStageId;
      prevAt = transitionedAt;
    }
  }

  /* ------------------------------------------- Pass B: deal_snapshots (fallback) */

  let insertedB = 0;
  let skippedB = 0;

  for (const deal of deals) {
    if (dealsCoveredByA.has(deal.id)) continue; // Pass A already reconstructed this deal's history

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

    let prevStageId: number | null = null;
    let prevAt: Date = new Date(deal.createdAt);

    for (const snap of snaps) {
      if (snap.stageId == null || snap.stageId === prevStageId) continue;
      const toStage = stageById.get(snap.stageId);
      if (!toStage) continue;

      const fromSortOrder = prevStageId != null ? (sortOrderById.get(prevStageId) ?? null) : null;
      const transitionType = computeTransitionType(fromSortOrder, toStage);
      const transitionedAt = new Date(snap.at);
      const daysInFromStage =
        prevStageId != null
          ? Math.max(0, Math.round((transitionedAt.getTime() - prevAt.getTime()) / 86_400_000))
          : null;

      const ok = await insertTransition({
        dealId: deal.id,
        fromStageId: prevStageId,
        toStageId: snap.stageId,
        transitionType,
        tcvAtTransition: snap.tcv ?? null,
        daysInFromStage,
        transitionedAt,
        createdBy: snap.by ?? "backfill-snapshot",
      });
      insertedB += ok ? 1 : 0;
      skippedB += ok ? 0 : 1;

      prevStageId = snap.stageId;
      prevAt = transitionedAt;
    }
  }

  /* ------------------------------ Pass C: synthetic create (floor) --- */

  const existingRows = await db
    .select({ dealId: pipelineTransitions.dealId, transitionType: pipelineTransitions.transitionType })
    .from(pipelineTransitions);
  const dealsWithCreate = new Set(
    existingRows.filter((r) => r.transitionType === "create").map((r) => r.dealId),
  );
  const dealsWithExit = new Set(
    existingRows
      .filter((r) => r.transitionType === "exit_won" || r.transitionType === "exit_lost")
      .map((r) => r.dealId),
  );

  // A deal that reaches this pass has NO audit trail and NO snapshot
  // history at all (Pass A/B each ensure a "create" transition for every
  // deal they DO cover) — it was seed-inserted and never updated via the
  // API. createAt is backed off 1ms whenever the deal's current stage is
  // terminal, since Pass D below will insert an exit at the UNMODIFIED
  // stageEnteredAt — createdAt and stageEnteredAt both default to the same
  // INSERT's `now()` for a never-updated deal, so without the offset the
  // create and exit rows would collide on the same (dealId, transitionedAt)
  // key and one would silently be dropped.
  let insertedC = 0;
  for (const deal of deals) {
    if (dealsWithCreate.has(deal.id)) continue;
    const toStage = stageById.get(deal.salesStageId);
    const createdAt = new Date(deal.createdAt);
    const willAlsoGetExit = !!toStage?.terminal && !dealsWithExit.has(deal.id);
    const createAt = willAlsoGetExit
      ? new Date(Math.min(createdAt.getTime(), new Date(deal.stageEnteredAt).getTime()) - 1)
      : createdAt;

    const ok = await insertTransition({
      dealId: deal.id,
      fromStageId: null,
      toStageId: deal.salesStageId,
      transitionType: "create",
      tcvAtTransition: String(flatTcv(deal)),
      daysInFromStage: null,
      transitionedAt: createAt,
      createdBy: "backfill-synthetic-create",
    });
    if (ok) insertedC++;
  }

  /* -------------------------------- Pass D: synthetic exit (floor) --- */

  let insertedD = 0;
  for (const deal of deals) {
    if (dealsWithExit.has(deal.id)) continue;
    const toStage = stageById.get(deal.salesStageId);
    if (!toStage?.terminal) continue;

    const ok = await insertTransition({
      dealId: deal.id,
      fromStageId: null,
      toStageId: deal.salesStageId,
      transitionType: toStage.terminal === "won" ? "exit_won" : "exit_lost",
      tcvAtTransition: String(flatTcv(deal)),
      daysInFromStage: null,
      transitionedAt: new Date(deal.stageEnteredAt),
      createdBy: "backfill-synthetic-exit",
    });
    if (ok) insertedD++;
  }

  console.log(
    `Backfill complete.\n` +
      `  Pass A (audit log):      ${insertedA} inserted, ${skippedA} exact-timestamp skips, ${dedupedA} deduped against an already-live-recorded transition\n` +
      `  Pass B (snapshots):      ${insertedB} inserted, ${skippedB} skipped (already existed)\n` +
      `  Pass C (synthetic create): ${insertedC} inserted\n` +
      `  Pass D (synthetic exit):   ${insertedD} inserted`,
  );
  await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
  process.exit(0);
}

main().catch((e) => {
  console.error("Backfill failed:", e);
  process.exit(1);
});
