import { Router, type IRouter, type Request, type Response } from "express";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  createDealBlockersRepo,
  createBlockerCategoriesRepo,
  createBlockerSeveritiesRepo,
  type CatalystApp,
} from "@workspace/db/catalyst";
import {
  ListBlockersParams,
  ListBlockersQueryParams,
  ListBlockersResponse,
  CreateBlockerParams,
  CreateBlockerBody,
  UpdateBlockerParams,
  UpdateBlockerBody,
  UpdateBlockerResponse,
  DeleteBlockerParams,
} from "@workspace/api-zod";
import { getActor } from "../lib/auth";
import { badRequest, notFound } from "../lib/http";
import { toISO } from "../lib/catalyst/intelligence";
import { writeAudit } from "../lib/catalyst/audit";
import { emitDealEvent } from "../lib/events";

// Auth + write-role enforcement is applied centrally in routes/index.ts.
const router: IRouter = Router();

async function ensureDeal(catalystApp: CatalystApp, dealId: string) {
  const deal = await createEnterpriseDealsRepo(catalystApp).getById(dealId);
  if (!deal) throw notFound("Deal not found");
}

async function serializeBlocker(catalystApp: CatalystApp, blockerId: string) {
  const blocker = await createDealBlockersRepo(catalystApp).getById(blockerId);
  if (!blocker) return null;
  const [categories, severities] = await Promise.all([
    createBlockerCategoriesRepo(catalystApp).listAll(),
    createBlockerSeveritiesRepo(catalystApp).listAll(),
  ]);
  const category = categories.find((c) => c.id === blocker.categoryId);
  const severity = severities.find((s) => s.id === blocker.severityId);
  // Mirrors the original innerJoin: a dangling category/severity id means the row doesn't resolve.
  if (!category || !severity) return null;
  return {
    id: blocker.id,
    categoryId: blocker.categoryId,
    category: category.categoryName,
    severityId: blocker.severityId,
    severity: severity.severityName,
    description: blocker.description,
    isResolved: blocker.isResolved,
    resolvedAt: toISO(blocker.resolvedAt),
    resolutionNotes: blocker.resolutionNotes,
    loggedAt: toISO(blocker.loggedAt) ?? undefined,
  };
}

router.get("/deals/:dealId/blockers", async (req: Request, res: Response) => {
  const { dealId } = ListBlockersParams.parse(req.params);
  const q = ListBlockersQueryParams.parse(req.query);
  const catalystApp = initCatalystApp(req);
  await ensureDeal(catalystApp, dealId);

  const [blockers, categories, severities] = await Promise.all([
    createDealBlockersRepo(catalystApp).list(dealId),
    createBlockerCategoriesRepo(catalystApp).listAll(),
    createBlockerSeveritiesRepo(catalystApp).listAll(),
  ]);
  const categoryById = new Map(categories.map((c) => [c.id, c.categoryName]));
  const severityById = new Map(severities.map((s) => [s.id, s]));

  const filtered =
    q.resolved !== undefined ? blockers.filter((b) => b.isResolved === q.resolved) : blockers;

  const data = filtered
    .map((b) => {
      const category = categoryById.get(b.categoryId);
      const severity = severityById.get(b.severityId);
      if (!category || !severity) return null; // mirrors the original innerJoin drop
      return {
        id: b.id,
        categoryId: b.categoryId,
        category,
        severityId: b.severityId,
        severity: severity.severityName,
        description: b.description,
        isResolved: b.isResolved,
        resolvedAt: toISO(b.resolvedAt),
        resolutionNotes: b.resolutionNotes,
        loggedAt: toISO(b.loggedAt) ?? undefined,
        severitySort: severity.sortOrder,
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .sort((a, b) => a.severitySort - b.severitySort)
    .map(({ severitySort: _severitySort, ...rest }) => rest);

  res.json(ListBlockersResponse.parse({ data }));
});

router.post("/deals/:dealId/blockers", async (req: Request, res: Response) => {
  const { dealId } = CreateBlockerParams.parse(req.params);
  const parsed = CreateBlockerBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid blocker payload", parsed.error.issues);
  }
  const catalystApp = initCatalystApp(req);
  await ensureDeal(catalystApp, dealId);
  const actor = getActor(req);
  const body = parsed.data;

  const created = await createDealBlockersRepo(catalystApp).create({
    dealId,
    categoryId: body.category_id,
    severityId: body.severity_id,
    description: body.description,
  });

  await writeAudit(catalystApp, {
    dealId,
    entityType: "blocker",
    fieldChanged: "created",
    newValue: body.description.slice(0, 200),
    changedBy: actor.displayName,
  });
  emitDealEvent("blocker.created", {
    dealId,
    actor: actor.displayName,
    blockerId: created.id,
    description: body.description,
    catalystApp,
  });

  const data = await serializeBlocker(catalystApp, created.id);
  res.status(201).json(UpdateBlockerResponse.parse({ data }));
});

router.put(
  "/deals/:dealId/blockers/:blockerId",
  async (req: Request, res: Response) => {
    const { dealId, blockerId } = UpdateBlockerParams.parse(req.params);
    const parsed = UpdateBlockerBody.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid blocker update payload", parsed.error.issues);
    }
    const catalystApp = initCatalystApp(req);
    await ensureDeal(catalystApp, dealId);
    const actor = getActor(req);
    const body = parsed.data;

    const existing = await createDealBlockersRepo(catalystApp).getById(blockerId);
    if (!existing || existing.dealId !== dealId) throw notFound("Blocker not found");

    const updates: { isResolved?: boolean; resolutionNotes?: string | null; severityId?: number } = {};
    if (body.is_resolved !== undefined) updates.isResolved = body.is_resolved;
    if (body.resolution_notes !== undefined) updates.resolutionNotes = body.resolution_notes;
    if (body.severity_id !== undefined) updates.severityId = body.severity_id;

    if (Object.keys(updates).length > 0) {
      await createDealBlockersRepo(catalystApp).update(blockerId, updates);
    }

    if (
      body.is_resolved !== undefined &&
      body.is_resolved !== existing.isResolved
    ) {
      await writeAudit(catalystApp, {
        dealId,
        entityType: "blocker",
        fieldChanged: "is_resolved",
        oldValue: String(existing.isResolved),
        newValue: String(body.is_resolved),
        changedBy: actor.displayName,
      });
      emitDealEvent("blocker.resolved", {
        dealId,
        actor: actor.displayName,
        blockerId,
        isResolved: body.is_resolved,
        catalystApp,
      });
    }

    const data = await serializeBlocker(catalystApp, blockerId);
    res.json(UpdateBlockerResponse.parse({ data }));
  },
);

router.delete(
  "/deals/:dealId/blockers/:blockerId",
  async (req: Request, res: Response) => {
    const { dealId, blockerId } = DeleteBlockerParams.parse(req.params);
    const catalystApp = initCatalystApp(req);
    await ensureDeal(catalystApp, dealId);
    const actor = getActor(req);
    const deleted = await createDealBlockersRepo(catalystApp).delete(blockerId, dealId);
    if (!deleted) throw notFound("Blocker not found");
    await writeAudit(catalystApp, {
      dealId,
      entityType: "blocker",
      fieldChanged: "deleted",
      newValue: blockerId,
      changedBy: actor.displayName,
    });
    res.status(204).end();
  },
);

export default router;
