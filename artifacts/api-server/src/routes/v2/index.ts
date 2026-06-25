import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  dealActivityLog,
  dealHealthHistory,
  dealSnapshots,
} from "@workspace/db";
import {
  ListDealActivityParams,
  ListDealActivityQueryParams,
  ListDealActivityResponse,
  ListDealHealthHistoryParams,
  ListDealHealthHistoryQueryParams,
  ListDealHealthHistoryResponse,
  ListDealSnapshotsParams,
  ListDealSnapshotsQueryParams,
  ListDealSnapshotsResponse,
  GetDealSnapshotParams,
  GetDealSnapshotResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../../lib/auth";
import { notFound } from "../../lib/http";
import { toISO } from "../../lib/intelligence";
import crudRouter from "./crud";
import analyticsRouter from "./analytics";
import configRouter from "./config";
import exportsRouter from "./exports";

const router: IRouter = Router();

router.use(requireAuth);

// V2 Sovereign Intelligence sub-routers (auth applied above).
router.use(crudRouter);
router.use(analyticsRouter);
router.use(configRouter);
router.use(exportsRouter);

async function ensureDeal(dealId: string) {
  const rows = await db
    .select({ id: enterpriseDeals.id })
    .from(enterpriseDeals)
    .where(eq(enterpriseDeals.id, dealId))
    .limit(1);
  if (rows.length === 0) throw notFound("Deal not found");
}

function clampLimit(limit: number | undefined, fallback: number) {
  return Math.min(Math.max(limit ?? fallback, 1), 200);
}

router.get(
  "/deals/:dealId/activity",
  async (req: Request, res: Response) => {
    const { dealId } = ListDealActivityParams.parse(req.params);
    const q = ListDealActivityQueryParams.parse(req.query);
    await ensureDeal(dealId);

    const limit = clampLimit(q.limit, 50);
    const offset = Math.max(q.offset ?? 0, 0);

    const conditions = [eq(dealActivityLog.dealId, dealId)];
    if (q.event_type)
      conditions.push(eq(dealActivityLog.eventType, q.event_type));
    if (q.since)
      conditions.push(gte(dealActivityLog.occurredAt, new Date(q.since)));
    if (q.until)
      conditions.push(lte(dealActivityLog.occurredAt, new Date(q.until)));
    const where = and(...conditions);

    const rows = await db
      .select()
      .from(dealActivityLog)
      .where(where)
      .orderBy(desc(dealActivityLog.occurredAt))
      .limit(limit)
      .offset(offset);

    const totalRows = await db
      .select({ id: dealActivityLog.id })
      .from(dealActivityLog)
      .where(where);

    const data = rows.map((r) => ({
      id: r.id,
      dealId: r.dealId,
      eventType: r.eventType,
      entityType: r.entityType,
      entityId: r.entityId,
      summary: r.summary,
      metadata: r.metadata,
      actor: r.actor,
      occurredAt: toISO(r.occurredAt) ?? new Date().toISOString(),
    }));

    res.json(
      ListDealActivityResponse.parse({
        data,
        meta: { total: totalRows.length, limit, offset },
      }),
    );
  },
);

router.get(
  "/deals/:dealId/health-history",
  async (req: Request, res: Response) => {
    const { dealId } = ListDealHealthHistoryParams.parse(req.params);
    const q = ListDealHealthHistoryQueryParams.parse(req.query);
    await ensureDeal(dealId);

    const limit = clampLimit(q.limit, 50);
    const offset = Math.max(q.offset ?? 0, 0);

    const conditions = [eq(dealHealthHistory.dealId, dealId)];
    if (q.since)
      conditions.push(gte(dealHealthHistory.changedAt, new Date(q.since)));
    if (q.until)
      conditions.push(lte(dealHealthHistory.changedAt, new Date(q.until)));
    const where = and(...conditions);

    const rows = await db
      .select()
      .from(dealHealthHistory)
      .where(where)
      .orderBy(desc(dealHealthHistory.changedAt))
      .limit(limit)
      .offset(offset);

    const totalRows = await db
      .select({ id: dealHealthHistory.id })
      .from(dealHealthHistory)
      .where(where);

    const data = rows.map((r) => ({
      id: r.id,
      dealId: r.dealId,
      fromStatus: r.fromStatus,
      toStatus: r.toStatus,
      reason: r.reason,
      actor: r.actor,
      changedAt: toISO(r.changedAt) ?? new Date().toISOString(),
    }));

    res.json(
      ListDealHealthHistoryResponse.parse({
        data,
        meta: { total: totalRows.length, limit, offset },
      }),
    );
  },
);

router.get(
  "/deals/:dealId/snapshots",
  async (req: Request, res: Response) => {
    const { dealId } = ListDealSnapshotsParams.parse(req.params);
    const q = ListDealSnapshotsQueryParams.parse(req.query);
    await ensureDeal(dealId);

    const limit = clampLimit(q.limit, 50);
    const offset = Math.max(q.offset ?? 0, 0);

    const conditions = [eq(dealSnapshots.dealId, dealId)];
    if (q.since)
      conditions.push(gte(dealSnapshots.snapshotAt, new Date(q.since)));
    if (q.until)
      conditions.push(lte(dealSnapshots.snapshotAt, new Date(q.until)));
    const where = and(...conditions);

    const rows = await db
      .select({
        id: dealSnapshots.id,
        dealId: dealSnapshots.dealId,
        reason: dealSnapshots.reason,
        triggerEvent: dealSnapshots.triggerEvent,
        healthStatus: dealSnapshots.healthStatus,
        salesStageId: dealSnapshots.salesStageId,
        salesStage: dealSnapshots.salesStage,
        calculatedTcv: dealSnapshots.calculatedTcv,
        normalizedTcv: dealSnapshots.normalizedTcv,
        createdBy: dealSnapshots.createdBy,
        snapshotAt: dealSnapshots.snapshotAt,
      })
      .from(dealSnapshots)
      .where(where)
      .orderBy(desc(dealSnapshots.snapshotAt))
      .limit(limit)
      .offset(offset);

    const totalRows = await db
      .select({ id: dealSnapshots.id })
      .from(dealSnapshots)
      .where(where);

    const data = rows.map((r) => ({
      id: r.id,
      dealId: r.dealId,
      reason: r.reason,
      triggerEvent: r.triggerEvent,
      healthStatus: r.healthStatus,
      salesStageId: r.salesStageId,
      salesStage: r.salesStage,
      calculatedTcv: r.calculatedTcv,
      normalizedTcv: r.normalizedTcv,
      createdBy: r.createdBy,
      snapshotAt: toISO(r.snapshotAt) ?? new Date().toISOString(),
    }));

    res.json(
      ListDealSnapshotsResponse.parse({
        data,
        meta: { total: totalRows.length, limit, offset },
      }),
    );
  },
);

router.get("/snapshots/:snapshotId", async (req: Request, res: Response) => {
  const { snapshotId } = GetDealSnapshotParams.parse(req.params);

  const rows = await db
    .select()
    .from(dealSnapshots)
    .where(eq(dealSnapshots.id, snapshotId))
    .limit(1);
  if (rows.length === 0) throw notFound("Snapshot not found");
  const r = rows[0];

  res.json(
    GetDealSnapshotResponse.parse({
      data: {
        id: r.id,
        dealId: r.dealId,
        reason: r.reason,
        triggerEvent: r.triggerEvent,
        healthStatus: r.healthStatus,
        salesStageId: r.salesStageId,
        salesStage: r.salesStage,
        calculatedTcv: r.calculatedTcv,
        normalizedTcv: r.normalizedTcv,
        createdBy: r.createdBy,
        snapshotAt: toISO(r.snapshotAt) ?? new Date().toISOString(),
        payload: r.payload,
      },
    }),
  );
});

export default router;
