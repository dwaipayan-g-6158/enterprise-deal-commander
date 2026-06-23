import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  dealInterventions,
  interventionChecklists,
} from "@workspace/db";
import {
  LaunchInterventionParams,
  LaunchInterventionBody,
} from "@workspace/api-zod";
import { requireAuth, getActor } from "../lib/auth";
import { badRequest, notFound } from "../lib/http";
import { toISO } from "../lib/intelligence";
import { writeAudit } from "../lib/audit";

const router: IRouter = Router();

router.use(requireAuth);

router.post(
  "/deals/:dealId/interventions",
  async (req: Request, res: Response) => {
    const { dealId } = LaunchInterventionParams.parse(req.params);
    const parsed = LaunchInterventionBody.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid intervention payload", parsed.error.issues);
    }
    const dealRows = await db
      .select({ id: enterpriseDeals.id })
      .from(enterpriseDeals)
      .where(eq(enterpriseDeals.id, dealId))
      .limit(1);
    if (dealRows.length === 0) throw notFound("Deal not found");

    const actor = getActor(req);
    const body = parsed.data;

    const checklist = await db
      .select({ id: interventionChecklists.id })
      .from(interventionChecklists)
      .where(eq(interventionChecklists.id, body.checklist_id))
      .limit(1);
    if (checklist.length === 0) throw notFound("Checklist not found");

    const inserted = await db
      .insert(dealInterventions)
      .values({
        dealId,
        patternCode: body.pattern_code,
        checklistId: body.checklist_id,
        launchedBy: actor.displayName,
      })
      .returning();

    await writeAudit({
      dealId,
      entityType: "intervention",
      fieldChanged: body.pattern_code,
      newValue: String(body.checklist_id),
      changedBy: actor.displayName,
    });

    const row = inserted[0];
    res.status(201).json({
      data: {
        id: row.id,
        dealId: row.dealId,
        patternCode: row.patternCode,
        checklistId: row.checklistId,
        launchedBy: row.launchedBy,
        launchedAt: toISO(row.launchedAt) ?? new Date().toISOString(),
      },
    });
  },
);

export default router;
