import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, gt, gte, lte } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  dealAuditLog,
  dealReviewMarkers,
} from "@workspace/db";
import {
  ListAuditParams,
  ListAuditQueryParams,
  ListAuditResponse,
  ListChangesParams,
  ListChangesQueryParams,
  ListChangesResponse,
  SetReviewMarkerParams,
  SetReviewMarkerResponse,
  GetSnapshotParams,
  GetSnapshotQueryParams,
  GetSnapshotResponse,
} from "@workspace/api-zod";
import { requireAuth, getActor } from "../lib/auth";
import { badRequest, notFound } from "../lib/http";
import { toISO, getDealGates, serializeDeal } from "../lib/intelligence";

const router: IRouter = Router();

router.use(requireAuth);

async function ensureDeal(dealId: string) {
  const rows = await db
    .select({ id: enterpriseDeals.id })
    .from(enterpriseDeals)
    .where(eq(enterpriseDeals.id, dealId))
    .limit(1);
  if (rows.length === 0) throw notFound("Deal not found");
}

router.get("/deals/:dealId/audit", async (req: Request, res: Response) => {
  const { dealId } = ListAuditParams.parse(req.params);
  const q = ListAuditQueryParams.parse(req.query);
  await ensureDeal(dealId);

  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  const offset = Math.max(q.offset ?? 0, 0);

  const conditions = [eq(dealAuditLog.dealId, dealId)];
  if (q.entity_type) conditions.push(eq(dealAuditLog.entityType, q.entity_type));
  if (q.field_changed)
    conditions.push(eq(dealAuditLog.fieldChanged, q.field_changed));
  if (q.since) conditions.push(gte(dealAuditLog.changedAt, new Date(q.since)));
  if (q.until) conditions.push(lte(dealAuditLog.changedAt, new Date(q.until)));

  const where = and(...conditions);

  const rows = await db
    .select()
    .from(dealAuditLog)
    .where(where)
    .orderBy(desc(dealAuditLog.changedAt))
    .limit(limit)
    .offset(offset);

  const totalRows = await db
    .select({ id: dealAuditLog.id })
    .from(dealAuditLog)
    .where(where);

  const data = rows.map((r) => ({
    id: r.id,
    entityType: r.entityType,
    fieldChanged: r.fieldChanged,
    oldValue: r.oldValue,
    newValue: r.newValue,
    changedBy: r.changedBy,
    changedAt: toISO(r.changedAt) ?? new Date().toISOString(),
  }));

  res.json(
    ListAuditResponse.parse({
      data,
      meta: { total: totalRows.length, limit, offset },
    }),
  );
});

router.get("/deals/:dealId/changes", async (req: Request, res: Response) => {
  const { dealId } = ListChangesParams.parse(req.params);
  const q = ListChangesQueryParams.parse(req.query);
  await ensureDeal(dealId);

  const conditions = [eq(dealAuditLog.dealId, dealId)];
  if (q.since) conditions.push(gt(dealAuditLog.changedAt, new Date(q.since)));

  const rows = await db
    .select()
    .from(dealAuditLog)
    .where(and(...conditions))
    .orderBy(desc(dealAuditLog.changedAt))
    .limit(200);

  const data = rows.map((r) => {
    const from = r.oldValue ? ` from "${r.oldValue}"` : "";
    const to = r.newValue ? ` to "${r.newValue}"` : "";
    return {
      line: `${r.changedBy} changed ${r.fieldChanged}${from}${to}`,
      field: r.fieldChanged,
      at: toISO(r.changedAt) ?? new Date().toISOString(),
    };
  });

  res.json(ListChangesResponse.parse({ data }));
});

router.post(
  "/deals/:dealId/review-marker",
  async (req: Request, res: Response) => {
    const { dealId } = SetReviewMarkerParams.parse(req.params);
    await ensureDeal(dealId);
    const actor = getActor(req);
    const now = new Date();

    const inserted = await db
      .insert(dealReviewMarkers)
      .values({ dealId, lastReviewedAt: now, reviewedBy: actor.displayName })
      .onConflictDoUpdate({
        target: dealReviewMarkers.dealId,
        set: { lastReviewedAt: now, reviewedBy: actor.displayName },
      })
      .returning();

    const row = inserted[0];
    res.json(
      SetReviewMarkerResponse.parse({
        data: {
          lastReviewedAt: toISO(row.lastReviewedAt) ?? now.toISOString(),
          reviewedBy: row.reviewedBy,
        },
      }),
    );
  },
);

router.get("/deals/:dealId/snapshot", async (req: Request, res: Response) => {
  const { dealId } = GetSnapshotParams.parse(req.params);
  const q = GetSnapshotQueryParams.parse(req.query);
  await ensureDeal(dealId);

  const asOf = new Date(q.date);
  if (Number.isNaN(asOf.getTime())) throw badRequest("Invalid date");

  const deal = await serializeDeal(dealId);
  if (!deal) throw notFound("Deal not found");
  const gates = await getDealGates(dealId);

  const laterEntries = await db
    .select()
    .from(dealAuditLog)
    .where(and(eq(dealAuditLog.dealId, dealId), gt(dealAuditLog.changedAt, asOf)))
    .orderBy(desc(dealAuditLog.changedAt));

  const dealRecord: Record<string, unknown> = { ...deal };
  const gateState = new Map(gates.map((g) => [g.gateCode, g.isCompleted]));
  let reconstructed = false;

  for (const entry of laterEntries) {
    reconstructed = true;
    if (
      entry.entityType === "gate" &&
      entry.fieldChanged === "is_completed" &&
      entry.entityId
    ) {
      gateState.set(entry.entityId, entry.oldValue === "true");
    }
  }

  const reconstructedGates = gates.map((g) => ({
    ...g,
    isCompleted: gateState.get(g.gateCode) ?? g.isCompleted,
  }));

  res.json(
    GetSnapshotResponse.parse({
      data: {
        asOf: asOf.toISOString(),
        deal: dealRecord,
        gates: reconstructedGates,
        salesStage: deal.salesStage,
        reconstructed,
      },
    }),
  );
});

export default router;
