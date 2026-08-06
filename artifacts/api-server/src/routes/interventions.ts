import { Router, type IRouter, type Request, type Response } from "express";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  createDealInterventionsRepo,
  createInterventionChecklistsRepo,
} from "@workspace/db/catalyst";
import {
  LaunchInterventionParams,
  LaunchInterventionBody,
} from "@workspace/api-zod";
import { getActor } from "../lib/auth";
import { badRequest, notFound } from "../lib/http";
import { toISO } from "../lib/catalyst/intelligence";
import { writeAudit } from "../lib/catalyst/audit";

// Auth + write-role enforcement is applied centrally in routes/index.ts.
const router: IRouter = Router();

router.post(
  "/deals/:dealId/interventions",
  async (req: Request, res: Response) => {
    const { dealId } = LaunchInterventionParams.parse(req.params);
    const parsed = LaunchInterventionBody.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid intervention payload", parsed.error.issues);
    }
    const catalystApp = initCatalystApp(req);
    const deal = await createEnterpriseDealsRepo(catalystApp).getById(dealId);
    if (!deal) throw notFound("Deal not found");

    const actor = getActor(req);
    const body = parsed.data;

    const checklist = await createInterventionChecklistsRepo(catalystApp).getById(body.checklist_id);
    if (!checklist) throw notFound("Checklist not found");

    const created = await createDealInterventionsRepo(catalystApp).create({
      dealId,
      patternCode: body.pattern_code,
      checklistId: body.checklist_id,
      launchedBy: actor.displayName,
    });

    await writeAudit(catalystApp, {
      dealId,
      entityType: "intervention",
      fieldChanged: body.pattern_code,
      newValue: String(body.checklist_id),
      changedBy: actor.displayName,
    });

    res.status(201).json({
      data: {
        id: created.id,
        dealId: created.dealId,
        patternCode: created.patternCode,
        checklistId: created.checklistId,
        launchedBy: created.launchedBy,
        launchedAt: toISO(created.launchedAt) ?? new Date().toISOString(),
      },
    });
  },
);

export default router;
