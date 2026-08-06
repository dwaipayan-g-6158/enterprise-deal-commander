import { Router, type IRouter, type Request, type Response } from "express";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  createDealAuditLogRepo,
  createDealReviewMarkersRepo,
  type CatalystApp,
} from "@workspace/db/catalyst";
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
import { getActor } from "../lib/auth";
import { badRequest, notFound } from "../lib/http";
import { toISO, getDealGates, serializeDeal } from "../lib/catalyst/intelligence";

// Auth + write-role enforcement is applied centrally in routes/index.ts.
const router: IRouter = Router();

async function ensureDeal(catalystApp: CatalystApp, dealId: string) {
  const deal = await createEnterpriseDealsRepo(catalystApp).getById(dealId);
  if (!deal) throw notFound("Deal not found");
}

router.get("/deals/:dealId/audit", async (req: Request, res: Response) => {
  const { dealId } = ListAuditParams.parse(req.params);
  const q = ListAuditQueryParams.parse(req.query);
  const catalystApp = initCatalystApp(req);
  await ensureDeal(catalystApp, dealId);

  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  const offset = Math.max(q.offset ?? 0, 0);

  // Already sorted desc(changedAt) by the repo.
  let rows = await createDealAuditLogRepo(catalystApp).list(dealId);
  if (q.entity_type) rows = rows.filter((r) => r.entityType === q.entity_type);
  if (q.field_changed) rows = rows.filter((r) => r.fieldChanged === q.field_changed);
  if (q.since) {
    const since = new Date(q.since);
    rows = rows.filter((r) => r.changedAt >= since);
  }
  if (q.until) {
    const until = new Date(q.until);
    rows = rows.filter((r) => r.changedAt <= until);
  }

  const total = rows.length;
  const page = rows.slice(offset, offset + limit);

  const data = page.map((r) => ({
    id: r.id,
    // Exposed so the client can tell rows of one batch apart: a batch gate
    // save writes every row with fieldChanged="is_completed" and one shared
    // changed_at, so entityId (the gate code) is the only discriminator.
    entityType: r.entityType,
    entityId: r.entityId,
    fieldChanged: r.fieldChanged,
    oldValue: r.oldValue,
    newValue: r.newValue,
    changedBy: r.changedBy,
    changedAt: toISO(r.changedAt) ?? new Date().toISOString(),
  }));

  res.json(
    ListAuditResponse.parse({
      data,
      meta: { total, limit, offset },
    }),
  );
});

router.get("/deals/:dealId/changes", async (req: Request, res: Response) => {
  const { dealId } = ListChangesParams.parse(req.params);
  const q = ListChangesQueryParams.parse(req.query);
  const catalystApp = initCatalystApp(req);
  await ensureDeal(catalystApp, dealId);

  let rows = await createDealAuditLogRepo(catalystApp).list(dealId);
  if (q.since) {
    const since = new Date(q.since);
    rows = rows.filter((r) => r.changedAt > since);
  }
  rows = rows.slice(0, 200);

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
    const catalystApp = initCatalystApp(req);
    await ensureDeal(catalystApp, dealId);
    const actor = getActor(req);

    const { lastReviewedAt, reviewedBy } = await createDealReviewMarkersRepo(catalystApp).upsert(
      dealId,
      actor.displayName,
    );

    res.json(
      SetReviewMarkerResponse.parse({
        data: {
          lastReviewedAt: toISO(lastReviewedAt) ?? lastReviewedAt.toISOString(),
          reviewedBy,
        },
      }),
    );
  },
);

router.get("/deals/:dealId/snapshot", async (req: Request, res: Response) => {
  const { dealId } = GetSnapshotParams.parse(req.params);
  const q = GetSnapshotQueryParams.parse(req.query);
  const catalystApp = initCatalystApp(req);
  await ensureDeal(catalystApp, dealId);

  const asOf = new Date(q.date);
  if (Number.isNaN(asOf.getTime())) throw badRequest("Invalid date");

  const deal = await serializeDeal(catalystApp, dealId);
  if (!deal) throw notFound("Deal not found");
  const gates = await getDealGates(catalystApp, dealId);

  const allEntries = await createDealAuditLogRepo(catalystApp).list(dealId); // desc(changedAt)
  const laterEntries = allEntries.filter((e) => e.changedAt > asOf);

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
