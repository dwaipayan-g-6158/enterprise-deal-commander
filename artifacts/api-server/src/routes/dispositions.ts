import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, enterpriseDeals, dealAlertDispositions } from "@workspace/db";
import {
  SetDispositionParams,
  SetDispositionBody,
  SetDispositionResponse,
  ClearDispositionParams,
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

router.put(
  "/deals/:dealId/alerts/:patternCode/disposition",
  async (req: Request, res: Response) => {
    const { dealId, patternCode } = SetDispositionParams.parse(req.params);
    const parsed = SetDispositionBody.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid disposition payload", parsed.error.issues);
    }
    await ensureDeal(dealId);
    const actor = getActor(req);
    const body = parsed.data;

    if (body.disposition === "accept" && !body.rationale) {
      throw badRequest("Rationale is required to accept a risk");
    }
    if (body.disposition === "snooze" && !body.snooze_until_field_change) {
      throw badRequest("Snooze requires a field to watch");
    }

    const values = {
      dealId,
      patternCode,
      disposition: body.disposition,
      rationale: body.rationale ?? null,
      snoozeUntilFieldChange: body.snooze_until_field_change ?? null,
      createdBy: actor.displayName,
    };

    const inserted = await db
      .insert(dealAlertDispositions)
      .values(values)
      .onConflictDoUpdate({
        target: [
          dealAlertDispositions.dealId,
          dealAlertDispositions.patternCode,
        ],
        set: {
          disposition: values.disposition,
          rationale: values.rationale,
          snoozeUntilFieldChange: values.snoozeUntilFieldChange,
          createdBy: values.createdBy,
        },
      })
      .returning();

    await writeAudit({
      dealId,
      entityType: "disposition",
      fieldChanged: patternCode,
      newValue: body.disposition,
      changedBy: actor.displayName,
    });

    const row = inserted[0];
    res.json(
      SetDispositionResponse.parse({
        data: {
          id: row.id,
          dealId: row.dealId,
          patternCode: row.patternCode,
          disposition: row.disposition,
          rationale: row.rationale,
          snoozeUntilFieldChange: row.snoozeUntilFieldChange,
          createdBy: row.createdBy,
          createdAt: toISO(row.createdAt) ?? undefined,
        },
      }),
    );
  },
);

router.delete(
  "/deals/:dealId/alerts/:patternCode/disposition",
  async (req: Request, res: Response) => {
    const { dealId, patternCode } = ClearDispositionParams.parse(req.params);
    await ensureDeal(dealId);
    const actor = getActor(req);
    const result = await db
      .delete(dealAlertDispositions)
      .where(
        and(
          eq(dealAlertDispositions.dealId, dealId),
          eq(dealAlertDispositions.patternCode, patternCode),
        ),
      )
      .returning({ id: dealAlertDispositions.id });
    if (result.length === 0) throw notFound("Disposition not found");
    await writeAudit({
      dealId,
      entityType: "disposition",
      fieldChanged: patternCode,
      newValue: "cleared",
      changedBy: actor.displayName,
    });
    res.status(204).end();
  },
);

export default router;
