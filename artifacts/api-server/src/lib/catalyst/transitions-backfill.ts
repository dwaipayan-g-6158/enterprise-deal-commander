// Reconstruct `v2_pipeline_transitions` history for deals whose stage changes
// predate the pipeline-transitions subscriber — or, for seed-inserted deals,
// never went through an update at all.
//
// WHY THIS EXISTS AT ALL
//
// The Flow tab (funnel, conversion matrix, Sankey, recycle, coverage,
// health-score) is built entirely on this one table. On Catalyst it held a
// single row for twelve deals, because the only backfill that had ever existed
// was a Drizzle/Postgres CLI script that could not run against Data Store. The
// symptom was not an empty tab but a *wrong* one: every `convToNextPct` and
// `avgDaysInStage` came back null, and the Sankey drew one nonsensical
// Closed-Lost -> Closed-Won link off that lone row.
//
// SHAPE: A PURE PLANNER, THEN A THIN WRITER
//
// `planTransitionBackfill` decides every row and touches nothing; the runner
// loads inputs, calls it, and writes. Two reasons beyond testability:
//
//   - `createPipelineTransitionsRepo.create()` reads the WHOLE transitions
//     table to check its natural key, and every write invalidates the
//     per-request read cache (lib/db/src/catalyst/sdk.ts). A row-at-a-time port
//     of the original would therefore cost one full-table read per inserted
//     row. Planning first reads it once.
//   - `create()` returns void and silently returns on a natural-key collision,
//     so a write-loop cannot tell "inserted" from "already there". The planner
//     knows, so the endpoint can report honest counts.

import {
  type CatalystApp,
  createEnterpriseDealsRepo,
  createPipelineStagesRepo,
  createPricingModelsRepo,
  createDealAuditLogRepo,
  createDealSnapshotsRepo,
  createPipelineTransitionsRepo,
  formatCatalystDateTime,
} from "@workspace/db/catalyst";
import { computeTransitionType, type StageDef } from "@workspace/engine";
import { termAwareTcv } from "../deal-filters";
import { logger } from "../logger";

/**
 * A deal updated through the live path writes a `deal_audit_log` row AND fires
 * the pipeline-transitions subscriber for the SAME change, in the same request.
 * The two timestamps are generated independently (`changed_at` vs the
 * subscriber's own `new Date()`) and land milliseconds — occasionally more —
 * apart, so an exact-timestamp key does NOT catch the duplicate. An earlier run
 * of the Postgres original double-counted a handful of real exits before this
 * window was added. Match on (dealId, fromStageId, toStageId) instead.
 */
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * How far to back the synthetic "create" row off the synthetic "exit" row for a
 * deal that gets both (Pass C + Pass D).
 *
 * The Postgres original used 1 MILLISECOND. That would silently lose a row
 * here: `formatCatalystDateTime` emits second granularity, so `t - 1ms` formats
 * to the same string as `t`, both rows synthesize the identical natural key
 * (`dealId:transitionedAt`), and `create()` drops the second one without
 * complaint. A full second is the smallest offset Data Store can represent.
 * See trap 7 in the Catalyst runtime-traps notes.
 *
 * `freeSlot` below would in fact rescue a too-small offset by shifting the
 * colliding row forward, so this constant is not the only thing standing
 * between us and a lost row — but it is what expresses the INTENT that a
 * deal's create precedes its exit, rather than leaving that to the order the
 * passes happen to run in.
 */
const CREATE_EXIT_OFFSET_MS = 1000;

export type BackfillPass = "A" | "B" | "C" | "D";

export interface BackfillDeal {
  id: string;
  createdAt: Date;
  salesStageId: number;
  stageEnteredAt: Date;
  /** The deal's CURRENT term-aware TCV, precomputed by the caller. */
  termAwareTcv: number;
}

export interface BackfillAuditRow {
  dealId: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: Date;
}

export interface BackfillSnapshot {
  salesStageId: number | null;
  normalizedTcv: number | null;
  snapshotAt: Date;
  createdBy: string;
}

export interface ExistingTransition {
  dealId: string;
  fromStageId: number | null;
  toStageId: number | null;
  transitionType: string;
  transitionedAt: Date;
}

export interface PlannedTransition {
  dealId: string;
  fromStageId: number | null;
  toStageId: number;
  transitionType: ReturnType<typeof computeTransitionType>;
  tcvAtTransition: number | null;
  daysInFromStage: number | null;
  transitionedAt: Date;
  createdBy: string;
  pass: BackfillPass;
}

export interface PlanInput {
  deals: BackfillDeal[];
  stages: StageDef[];
  /** `deal_audit_log` rows already filtered to `field_changed = "sales_stage_id"`; any order. */
  auditRows: BackfillAuditRow[];
  /** Snapshots per deal; any order. Only consulted for deals Pass A does not cover. */
  snapshotsByDeal: Map<string, BackfillSnapshot[]>;
  existing: ExistingTransition[];
}

/** The composite the Data Store actually enforces — second-granularity, like the column. */
function naturalKey(dealId: string, at: Date): string {
  return `${dealId}:${formatCatalystDateTime(at)}`;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

/**
 * Plan every row the backfill would write. Pure: same inputs, same output, no
 * clock and no IO. Idempotent by construction — re-planning with the previous
 * run's rows present in `existing` yields an empty array.
 */
export function planTransitionBackfill(input: PlanInput): PlannedTransition[] {
  const { deals, stages, auditRows, snapshotsByDeal, existing } = input;

  const stageById = new Map<number, StageDef>(stages.map((s) => [s.id, s]));
  const sortOrderById = new Map<number, number>(stages.map((s) => [s.id, s.sortOrder]));
  const dealById = new Map(deals.map((d) => [d.id, d]));

  const planned: PlannedTransition[] = [];

  // Rows already on record, plus rows planned earlier in THIS run — the passes
  // must not collide with each other any more than with the database.
  const seenByDeal = new Map<string, ExistingTransition[]>();
  for (const row of existing) {
    const arr = seenByDeal.get(row.dealId) ?? [];
    arr.push(row);
    seenByDeal.set(row.dealId, arr);
  }
  const takenKeys = new Set(existing.map((r) => naturalKey(r.dealId, r.transitionedAt)));

  /**
   * Already recorded? For a create, any existing create for the deal counts —
   * its exact timestamp is unknowable. For a move, the same stage pair inside
   * the dedupe window.
   */
  function findExistingNearby(
    dealId: string,
    fromStageId: number | null,
    toStageId: number,
    at: Date,
    isCreate: boolean,
  ): ExistingTransition | null {
    const list = seenByDeal.get(dealId);
    if (!list) return null;
    return (
      list.find((r) => {
        if (isCreate) return r.transitionType === "create";
        return (
          r.fromStageId === fromStageId &&
          r.toStageId === toStageId &&
          Math.abs(r.transitionedAt.getTime() - at.getTime()) <= DEDUP_WINDOW_MS
        );
      }) ?? null
    );
  }

  /**
   * Nudge forward to the first second this deal has free.
   *
   * Two genuinely distinct transitions for one deal inside the same second
   * synthesize the same natural key, and `create()` would silently drop the
   * later one. Postgres never hit this (microsecond timestamps); here it is
   * reachable whenever a rep advances a deal twice in quick succession, or a
   * seeded deal's createdAt and stageEnteredAt coincide. Losing a real
   * transition is worse than recording it a second late, so shift rather than
   * drop — count and ordering are preserved, which is all the Flow maths reads.
   */
  function freeSlot(dealId: string, at: Date): Date {
    let candidate = at;
    while (takenKeys.has(naturalKey(dealId, candidate))) {
      candidate = new Date(candidate.getTime() + 1000);
    }
    return candidate;
  }

  function emit(row: Omit<PlannedTransition, "transitionedAt"> & { transitionedAt: Date }): Date {
    const at = freeSlot(row.dealId, row.transitionedAt);
    const finalRow = { ...row, transitionedAt: at };
    planned.push(finalRow);
    takenKeys.add(naturalKey(row.dealId, at));
    const arr = seenByDeal.get(row.dealId) ?? [];
    arr.push({
      dealId: row.dealId,
      fromStageId: row.fromStageId,
      toStageId: row.toStageId,
      transitionType: row.transitionType,
      transitionedAt: at,
    });
    seenByDeal.set(row.dealId, arr);
    return at;
  }

  /* ------------------------------------------------ Pass A: deal_audit_log */
  // The richest source: written synchronously on every stage change by
  // routes/deals.ts, so denser and more complete than periodic snapshots.

  const auditByDeal = new Map<string, BackfillAuditRow[]>();
  for (const row of auditRows) {
    if (!dealById.has(row.dealId)) continue;
    const arr = auditByDeal.get(row.dealId) ?? [];
    arr.push(row);
    auditByDeal.set(row.dealId, arr);
  }
  for (const arr of auditByDeal.values()) {
    arr.sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
  }
  const dealsCoveredByA = new Set(auditByDeal.keys());

  for (const [dealId, rows] of auditByDeal) {
    const deal = dealById.get(dealId)!;
    let prevStageId: number | null = null;
    let prevAt: Date = deal.createdAt;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // The audit log records changes, never the initial insert — so the FIRST
      // row's oldValue is the stage the deal was created in. Emit a synthetic
      // create for it before walking the real moves.
      if (i === 0) {
        const createdStageId =
          row.oldValue != null && row.oldValue !== "" ? Number(row.oldValue) : null;
        if (createdStageId != null && stageById.has(createdStageId)) {
          const existingCreate = findExistingNearby(dealId, null, createdStageId, prevAt, true);
          if (existingCreate) {
            prevStageId = createdStageId;
            prevAt = existingCreate.transitionedAt;
          } else {
            prevAt = emit({
              dealId,
              fromStageId: null,
              toStageId: createdStageId,
              transitionType: "create",
              tcvAtTransition: deal.termAwareTcv,
              daysInFromStage: null,
              transitionedAt: prevAt,
              createdBy: "backfill-audit-log",
              pass: "A",
            });
            prevStageId = createdStageId;
          }
        }
      }

      const toStageId = row.newValue != null && row.newValue !== "" ? Number(row.newValue) : null;
      if (toStageId == null) continue;
      const toStage = stageById.get(toStageId);
      if (!toStage) continue;

      const fromSortOrder = prevStageId != null ? (sortOrderById.get(prevStageId) ?? null) : null;
      const transitionType = computeTransitionType(fromSortOrder, toStage);

      const existingMove = findExistingNearby(dealId, prevStageId, toStageId, row.changedAt, false);
      if (existingMove) {
        // Already recorded live for this exact move — adopt its real timestamp
        // so the NEXT hop's daysInFromStage is computed from authoritative data
        // rather than our reconstruction.
        prevStageId = toStageId;
        prevAt = existingMove.transitionedAt;
        continue;
      }

      const at = emit({
        dealId,
        fromStageId: prevStageId,
        toStageId,
        transitionType,
        // The audit log carries no TCV of its own. The deal's current
        // term-aware TCV is not historically precise if revenue moved since,
        // but it is far better than a null that contributes exactly 0 to the
        // value bridge, Sankey value mode and recycled-value.
        tcvAtTransition: deal.termAwareTcv,
        daysInFromStage: prevStageId != null ? daysBetween(prevAt, row.changedAt) : null,
        transitionedAt: row.changedAt,
        createdBy: "backfill-audit-log",
        pass: "A",
      });

      prevStageId = toStageId;
      prevAt = at;
    }
  }

  /* --------------------------------------- Pass B: deal_snapshots (fallback) */
  // Only for deals Pass A did not cover, so one deal never gets two
  // independently reconstructed — and possibly divergent — partial histories.

  for (const deal of deals) {
    if (dealsCoveredByA.has(deal.id)) continue;
    const snaps = [...(snapshotsByDeal.get(deal.id) ?? [])].sort(
      (a, b) => a.snapshotAt.getTime() - b.snapshotAt.getTime(),
    );

    let prevStageId: number | null = null;
    let prevAt: Date = deal.createdAt;

    for (const snap of snaps) {
      if (snap.salesStageId == null || snap.salesStageId === prevStageId) continue;
      const toStage = stageById.get(snap.salesStageId);
      if (!toStage) continue;

      const fromSortOrder = prevStageId != null ? (sortOrderById.get(prevStageId) ?? null) : null;
      const isCreate = prevStageId === null;

      // The same already-recorded check Pass A does, and for a sharper reason
      // here: without it this pass is not idempotent. `freeSlot` SHIFTS a
      // colliding row rather than skipping it, so a re-plan of a transition
      // already written by an earlier run would be nudged a second forward and
      // inserted again — every run adding another copy. Pass A never showed
      // this because it checks first. (Caught on the live re-run, not in
      // tests: the idempotency test's fixture had no snapshot-only deal, so
      // this pass never executed in it.)
      const already = findExistingNearby(
        deal.id,
        prevStageId,
        snap.salesStageId,
        snap.snapshotAt,
        isCreate,
      );
      if (already) {
        prevStageId = snap.salesStageId;
        prevAt = already.transitionedAt;
        continue;
      }

      const at = emit({
        dealId: deal.id,
        fromStageId: prevStageId,
        toStageId: snap.salesStageId,
        transitionType: computeTransitionType(fromSortOrder, toStage),
        tcvAtTransition: snap.normalizedTcv,
        daysInFromStage: prevStageId != null ? daysBetween(prevAt, snap.snapshotAt) : null,
        transitionedAt: snap.snapshotAt,
        createdBy: snap.createdBy || "backfill-snapshot",
        pass: "B",
      });

      prevStageId = snap.salesStageId;
      prevAt = at;
    }
  }

  /* ------------------------------------------ Pass C: synthetic create floor */
  // A deal reaching here has NO audit trail and NO snapshot history — typically
  // seed-inserted and never updated through the API. Without a create row it
  // contributes nothing to the value bridge's Created total despite plainly
  // being in the pipeline, which is what drove "Still open" negative and
  // silently floored to 0.

  const hasType = (dealId: string, pred: (t: string) => boolean): boolean =>
    (seenByDeal.get(dealId) ?? []).some((r) => pred(r.transitionType));

  for (const deal of deals) {
    if (hasType(deal.id, (t) => t === "create")) continue;
    const toStage = stageById.get(deal.salesStageId);
    if (!toStage) continue;

    // Pass D will insert an exit at the UNMODIFIED stageEnteredAt. For a
    // never-updated deal createdAt and stageEnteredAt are the same instant, so
    // back the create off far enough that the two survive as distinct rows.
    const willAlsoGetExit =
      !!toStage.terminal && !hasType(deal.id, (t) => t === "exit_won" || t === "exit_lost");
    const createAt = willAlsoGetExit
      ? new Date(
          Math.min(deal.createdAt.getTime(), deal.stageEnteredAt.getTime()) - CREATE_EXIT_OFFSET_MS,
        )
      : deal.createdAt;

    emit({
      dealId: deal.id,
      fromStageId: null,
      // The only stage recoverable for a deal with zero history.
      toStageId: deal.salesStageId,
      transitionType: "create",
      tcvAtTransition: deal.termAwareTcv,
      daysInFromStage: null,
      transitionedAt: createAt,
      createdBy: "backfill-synthetic-create",
      pass: "C",
    });
  }

  /* -------------------------------------------- Pass D: synthetic exit floor */

  for (const deal of deals) {
    if (hasType(deal.id, (t) => t === "exit_won" || t === "exit_lost")) continue;
    const toStage = stageById.get(deal.salesStageId);
    if (!toStage?.terminal) continue;

    emit({
      dealId: deal.id,
      // The true prior stage is unrecoverable for a deal with no history.
      fromStageId: null,
      toStageId: deal.salesStageId,
      transitionType: toStage.terminal === "won" ? "exit_won" : "exit_lost",
      tcvAtTransition: deal.termAwareTcv,
      daysInFromStage: null,
      transitionedAt: deal.stageEnteredAt,
      createdBy: "backfill-synthetic-exit",
      pass: "D",
    });
  }

  return planned;
}

export interface BackfillResult {
  deals: number;
  planned: number;
  written: number;
  failed: number;
  remaining: number;
  byPass: Record<BackfillPass, number>;
  errors: Array<{ dealId: string; error: string }>;
}

/**
 * Load, plan, write. Safe to call repeatedly: a second run plans nothing
 * because the first run's rows are now in `existing`.
 *
 * `budgetMs` bounds the write loop the same way the snapshot job does — AppSail
 * caps a request at 30 seconds, and a portfolio too large for one invocation
 * should degrade into partial progress plus a visible `remaining` rather than a
 * timeout with an unknown amount written.
 */
export async function runTransitionBackfill(
  catalystApp: CatalystApp,
  budgetMs = 20_000,
): Promise<BackfillResult> {
  const startedAt = Date.now();

  const [dealRows, stageRows, pricingModels, auditEntries, existingRows] = await Promise.all([
    createEnterpriseDealsRepo(catalystApp).list(),
    createPipelineStagesRepo(catalystApp).listAll(),
    createPricingModelsRepo(catalystApp).listAll(),
    createDealAuditLogRepo(catalystApp).listAll(),
    createPipelineTransitionsRepo(catalystApp).listAll(),
  ]);

  const stages: StageDef[] = stageRows.map((s) => ({
    id: s.id,
    name: s.stageName,
    sortOrder: s.sortOrder,
    terminal:
      s.stageName === "Closed-Won" ? "won" : s.stageName === "Closed-Lost" ? "lost" : undefined,
  }));

  const pricingNameById = new Map(pricingModels.map((p) => [p.id, p.modelName]));
  // Deliberately unfiltered — a soft-deleted deal's history is still real
  // history. It is the analytics ROUTES that exclude soft-deleted rows, not
  // this reconstruction.
  const deals: BackfillDeal[] = dealRows.map((d) => ({
    id: d.id,
    createdAt: d.createdAt,
    salesStageId: d.salesStageId,
    stageEnteredAt: d.stageEnteredAt,
    termAwareTcv: termAwareTcv({
      productRevenue: d.productRevenue,
      servicesRevenue: d.servicesRevenue,
      contractTermYears: d.contractTermYears,
      pricingModel: pricingNameById.get(d.pricingModelId) ?? "",
    }),
  }));

  const auditRows: BackfillAuditRow[] = auditEntries
    .filter((e) => e.fieldChanged === "sales_stage_id")
    .map((e) => ({
      dealId: e.dealId,
      oldValue: e.oldValue,
      newValue: e.newValue,
      changedAt: e.changedAt,
    }));

  // Only deals with no audit history can reach Pass B, so only those need their
  // snapshots read. `listByDealId` hydrates offloaded payloads from Stratus,
  // which this pass does not use — worth avoiding for every deal Pass A covers.
  const dealsNeedingSnapshots = deals
    .map((d) => d.id)
    .filter((id) => !auditRows.some((a) => a.dealId === id));
  const snapshotsByDeal = new Map<string, BackfillSnapshot[]>();
  for (const dealId of dealsNeedingSnapshots) {
    const snaps = await createDealSnapshotsRepo(catalystApp).listByDealId(dealId);
    snapshotsByDeal.set(
      dealId,
      snaps.map((s) => ({
        salesStageId: s.salesStageId,
        normalizedTcv: s.normalizedTcv,
        snapshotAt: s.snapshotAt,
        createdBy: s.createdBy,
      })),
    );
  }

  const existing: ExistingTransition[] = existingRows.map((r) => ({
    dealId: r.dealId,
    fromStageId: r.fromStageId,
    toStageId: r.toStageId,
    transitionType: r.transitionType,
    transitionedAt: r.transitionedAt,
  }));

  const planned = planTransitionBackfill({ deals, stages, auditRows, snapshotsByDeal, existing });

  const byPass: Record<BackfillPass, number> = { A: 0, B: 0, C: 0, D: 0 };
  const errors: Array<{ dealId: string; error: string }> = [];
  const repo = createPipelineTransitionsRepo(catalystApp);
  let written = 0;
  let considered = 0;

  for (const row of planned) {
    if (Date.now() - startedAt > budgetMs) break;
    considered++;
    try {
      await repo.create({
        dealId: row.dealId,
        fromStageId: row.fromStageId,
        toStageId: row.toStageId,
        transitionType: row.transitionType,
        tcvAtTransition: row.tcvAtTransition,
        daysInFromStage: row.daysInFromStage,
        overridden: false,
        transitionedAt: row.transitionedAt,
        createdBy: row.createdBy,
      });
      written++;
      byPass[row.pass]++;
    } catch (err) {
      // One bad row must not abort the reconstruction for the rest.
      logger.error({ err, dealId: row.dealId }, "Transition backfill row failed");
      errors.push({
        dealId: row.dealId,
        // A Data Store rejection is a PLAIN OBJECT, not an Error — `String(err)`
        // on one yields "[object Object]" and loses everything.
        error:
          err instanceof Error
            ? err.message
            : (JSON.stringify(err) ?? String(err)).slice(0, 400),
      });
    }
  }

  return {
    deals: deals.length,
    planned: planned.length,
    written,
    failed: errors.length,
    remaining: planned.length - considered,
    byPass,
    errors: errors.slice(0, 5),
  };
}
