import { Router, type IRouter, type Request, type Response } from "express";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  createDealActivityLogRepo,
  createDealHealthHistoryRepo,
  createDealSnapshotsRepo,
} from "@workspace/db/catalyst";
import {
  ListPortfolioActivityQueryParams,
  ListPortfolioActivityResponse,
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
import { notFound } from "../../lib/http";
import { toISO } from "../../lib/catalyst/intelligence";
import crudRouter from "./crud";
import analyticsRouter from "./analytics";
import configRouter from "./config";
import exportsRouter from "./exports";
import meddpiccRouter from "./meddpicc";

// Auth + write-role enforcement is applied centrally in routes/index.ts.
const router: IRouter = Router();

// V2 Sovereign Intelligence sub-routers.
router.use(crudRouter);
router.use(analyticsRouter);
router.use(configRouter);
router.use(exportsRouter);
router.use(meddpiccRouter);

function clampLimit(limit: number | undefined, fallback: number) {
  return Math.min(Math.max(limit ?? fallback, 1), 200);
}

// Portfolio-wide activity stream across all active (non-deleted) deals. The
// per-deal feed lives at /deals/:dealId/activity below; this literal path is
// registered first so it never collides with the param route.
router.get("/activity", async (req: Request, res: Response) => {
  const q = ListPortfolioActivityQueryParams.parse(req.query);
  const catalystApp = initCatalystApp(req);

  const limit = clampLimit(q.limit, 50);
  const offset = Math.max(q.offset ?? 0, 0);

  const [activityAll, deals] = await Promise.all([
    createDealActivityLogRepo(catalystApp).listAll(),
    createEnterpriseDealsRepo(catalystApp).list(),
  ]);
  const liveDealNameById = new Map(
    deals.filter((d) => d.deletedAt == null).map((d) => [d.id, d.dealName]),
  );

  const sinceTime = q.since ? new Date(q.since).getTime() : null;
  const untilTime = q.until ? new Date(q.until).getTime() : null;
  const matched = activityAll.filter((r) => {
    if (!liveDealNameById.has(r.dealId)) return false;
    if (sinceTime != null && r.occurredAt.getTime() < sinceTime) return false;
    if (untilTime != null && r.occurredAt.getTime() > untilTime) return false;
    return true;
  });
  matched.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const data = matched.slice(offset, offset + limit).map((r) => ({
    id: r.id,
    dealId: r.dealId,
    dealName: liveDealNameById.get(r.dealId)!,
    eventType: r.eventType,
    entityType: r.entityType,
    entityId: r.entityId,
    summary: r.summary,
    metadata: r.metadata,
    actor: r.actor,
    occurredAt: toISO(r.occurredAt) ?? new Date().toISOString(),
  }));

  res.json(
    ListPortfolioActivityResponse.parse({
      data,
      meta: { total: matched.length, limit, offset },
    }),
  );
});

router.get(
  "/deals/:dealId/activity",
  async (req: Request, res: Response) => {
    const { dealId } = ListDealActivityParams.parse(req.params);
    const q = ListDealActivityQueryParams.parse(req.query);
    const catalystApp = initCatalystApp(req);
    const deal = await createEnterpriseDealsRepo(catalystApp).getById(dealId);
    if (!deal) throw notFound("Deal not found");

    const limit = clampLimit(q.limit, 50);
    const offset = Math.max(q.offset ?? 0, 0);

    const activityAll = await createDealActivityLogRepo(catalystApp).listAll();
    const sinceTime = q.since ? new Date(q.since).getTime() : null;
    const untilTime = q.until ? new Date(q.until).getTime() : null;
    const matched = activityAll.filter((r) => {
      if (r.dealId !== dealId) return false;
      if (q.event_type && r.eventType !== q.event_type) return false;
      if (sinceTime != null && r.occurredAt.getTime() < sinceTime) return false;
      if (untilTime != null && r.occurredAt.getTime() > untilTime) return false;
      return true;
    });
    matched.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

    const data = matched.slice(offset, offset + limit).map((r) => ({
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
        meta: { total: matched.length, limit, offset },
      }),
    );
  },
);

router.get(
  "/deals/:dealId/health-history",
  async (req: Request, res: Response) => {
    const { dealId } = ListDealHealthHistoryParams.parse(req.params);
    const q = ListDealHealthHistoryQueryParams.parse(req.query);
    const catalystApp = initCatalystApp(req);
    const deal = await createEnterpriseDealsRepo(catalystApp).getById(dealId);
    if (!deal) throw notFound("Deal not found");

    const limit = clampLimit(q.limit, 50);
    const offset = Math.max(q.offset ?? 0, 0);

    const allForDeal = await createDealHealthHistoryRepo(catalystApp).listByDealId(dealId);
    const sinceTime = q.since ? new Date(q.since).getTime() : null;
    const untilTime = q.until ? new Date(q.until).getTime() : null;
    // listByDealId already sorts newest-first; filter preserves that order.
    const matched = allForDeal.filter((r) => {
      if (sinceTime != null && r.changedAt.getTime() < sinceTime) return false;
      if (untilTime != null && r.changedAt.getTime() > untilTime) return false;
      return true;
    });

    const data = matched.slice(offset, offset + limit).map((r) => ({
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
        meta: { total: matched.length, limit, offset },
      }),
    );
  },
);

router.get(
  "/deals/:dealId/snapshots",
  async (req: Request, res: Response) => {
    const { dealId } = ListDealSnapshotsParams.parse(req.params);
    const q = ListDealSnapshotsQueryParams.parse(req.query);
    const catalystApp = initCatalystApp(req);
    const deal = await createEnterpriseDealsRepo(catalystApp).getById(dealId);
    if (!deal) throw notFound("Deal not found");

    const limit = clampLimit(q.limit, 50);
    const offset = Math.max(q.offset ?? 0, 0);

    const allForDeal = await createDealSnapshotsRepo(catalystApp).listByDealId(dealId);
    const sinceTime = q.since ? new Date(q.since).getTime() : null;
    const untilTime = q.until ? new Date(q.until).getTime() : null;
    const matched = allForDeal
      .filter((r) => {
        if (sinceTime != null && r.snapshotAt.getTime() < sinceTime) return false;
        if (untilTime != null && r.snapshotAt.getTime() > untilTime) return false;
        return true;
      })
      // listByDealId returns oldest-first; the original query orders newest-first.
      .sort((a, b) => b.snapshotAt.getTime() - a.snapshotAt.getTime());

    const data = matched.slice(offset, offset + limit).map((r) => ({
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
        meta: { total: matched.length, limit, offset },
      }),
    );
  },
);

router.get("/snapshots/:snapshotId", async (req: Request, res: Response) => {
  const { snapshotId } = GetDealSnapshotParams.parse(req.params);
  const catalystApp = initCatalystApp(req);

  const r = await createDealSnapshotsRepo(catalystApp).getById(snapshotId);
  if (!r) throw notFound("Snapshot not found");

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
