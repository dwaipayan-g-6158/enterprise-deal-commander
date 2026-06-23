import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  dealBlockers,
  blockerCategories,
  blockerSeverities,
} from "@workspace/db";
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
import { requireAuth, getActor } from "../lib/auth";
import { badRequest, notFound } from "../lib/http";
import { toISO } from "../lib/intelligence";
import { writeAudit } from "../lib/audit";

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

async function serializeBlocker(blockerId: string) {
  const rows = await db
    .select({
      id: dealBlockers.id,
      categoryId: dealBlockers.categoryId,
      category: blockerCategories.categoryName,
      severityId: dealBlockers.severityId,
      severity: blockerSeverities.severityName,
      description: dealBlockers.description,
      isResolved: dealBlockers.isResolved,
      resolvedAt: dealBlockers.resolvedAt,
      resolutionNotes: dealBlockers.resolutionNotes,
      loggedAt: dealBlockers.loggedAt,
    })
    .from(dealBlockers)
    .innerJoin(
      blockerCategories,
      eq(dealBlockers.categoryId, blockerCategories.id),
    )
    .innerJoin(
      blockerSeverities,
      eq(dealBlockers.severityId, blockerSeverities.id),
    )
    .where(eq(dealBlockers.id, blockerId))
    .limit(1);
  const b = rows[0];
  if (!b) return null;
  return {
    id: b.id,
    categoryId: b.categoryId,
    category: b.category,
    severityId: b.severityId,
    severity: b.severity,
    description: b.description,
    isResolved: b.isResolved,
    resolvedAt: toISO(b.resolvedAt),
    resolutionNotes: b.resolutionNotes,
    loggedAt: toISO(b.loggedAt) ?? undefined,
  };
}

router.get("/deals/:dealId/blockers", async (req: Request, res: Response) => {
  const { dealId } = ListBlockersParams.parse(req.params);
  const q = ListBlockersQueryParams.parse(req.query);
  await ensureDeal(dealId);

  const conditions = [eq(dealBlockers.dealId, dealId)];
  if (q.resolved !== undefined) {
    conditions.push(eq(dealBlockers.isResolved, q.resolved));
  }

  const rows = await db
    .select({
      id: dealBlockers.id,
      categoryId: dealBlockers.categoryId,
      category: blockerCategories.categoryName,
      severityId: dealBlockers.severityId,
      severity: blockerSeverities.severityName,
      description: dealBlockers.description,
      isResolved: dealBlockers.isResolved,
      resolvedAt: dealBlockers.resolvedAt,
      resolutionNotes: dealBlockers.resolutionNotes,
      loggedAt: dealBlockers.loggedAt,
      severitySort: blockerSeverities.sortOrder,
    })
    .from(dealBlockers)
    .innerJoin(
      blockerCategories,
      eq(dealBlockers.categoryId, blockerCategories.id),
    )
    .innerJoin(
      blockerSeverities,
      eq(dealBlockers.severityId, blockerSeverities.id),
    )
    .where(and(...conditions))
    .orderBy(asc(blockerSeverities.sortOrder));

  const data = rows.map((b) => ({
    id: b.id,
    categoryId: b.categoryId,
    category: b.category,
    severityId: b.severityId,
    severity: b.severity,
    description: b.description,
    isResolved: b.isResolved,
    resolvedAt: toISO(b.resolvedAt),
    resolutionNotes: b.resolutionNotes,
    loggedAt: toISO(b.loggedAt) ?? undefined,
  }));

  res.json(ListBlockersResponse.parse({ data }));
});

router.post("/deals/:dealId/blockers", async (req: Request, res: Response) => {
  const { dealId } = CreateBlockerParams.parse(req.params);
  const parsed = CreateBlockerBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid blocker payload", parsed.error.issues);
  }
  await ensureDeal(dealId);
  const actor = getActor(req);
  const body = parsed.data;

  const inserted = await db
    .insert(dealBlockers)
    .values({
      dealId,
      categoryId: body.category_id,
      severityId: body.severity_id,
      description: body.description,
    })
    .returning({ id: dealBlockers.id });

  await writeAudit({
    dealId,
    entityType: "blocker",
    fieldChanged: "created",
    newValue: body.description.slice(0, 200),
    changedBy: actor.displayName,
  });

  const data = await serializeBlocker(inserted[0].id);
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
    await ensureDeal(dealId);
    const actor = getActor(req);
    const body = parsed.data;

    const existingRows = await db
      .select()
      .from(dealBlockers)
      .where(
        and(eq(dealBlockers.id, blockerId), eq(dealBlockers.dealId, dealId)),
      )
      .limit(1);
    const existing = existingRows[0];
    if (!existing) throw notFound("Blocker not found");

    const updates: Partial<typeof dealBlockers.$inferInsert> = {};
    if (body.is_resolved !== undefined) {
      updates.isResolved = body.is_resolved;
      updates.resolvedAt = body.is_resolved ? new Date() : null;
    }
    if (body.resolution_notes !== undefined) {
      updates.resolutionNotes = body.resolution_notes;
    }
    if (body.severity_id !== undefined) {
      updates.severityId = body.severity_id;
    }

    if (Object.keys(updates).length > 0) {
      await db
        .update(dealBlockers)
        .set(updates)
        .where(eq(dealBlockers.id, blockerId));
    }

    if (
      body.is_resolved !== undefined &&
      body.is_resolved !== existing.isResolved
    ) {
      await writeAudit({
        dealId,
        entityType: "blocker",
        fieldChanged: "is_resolved",
        oldValue: String(existing.isResolved),
        newValue: String(body.is_resolved),
        changedBy: actor.displayName,
      });
    }

    const data = await serializeBlocker(blockerId);
    res.json(UpdateBlockerResponse.parse({ data }));
  },
);

router.delete(
  "/deals/:dealId/blockers/:blockerId",
  async (req: Request, res: Response) => {
    const { dealId, blockerId } = DeleteBlockerParams.parse(req.params);
    await ensureDeal(dealId);
    const actor = getActor(req);
    const result = await db
      .delete(dealBlockers)
      .where(
        and(eq(dealBlockers.id, blockerId), eq(dealBlockers.dealId, dealId)),
      )
      .returning({ id: dealBlockers.id });
    if (result.length === 0) throw notFound("Blocker not found");
    await writeAudit({
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
