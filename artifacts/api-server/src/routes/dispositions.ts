import { Router, type IRouter, type Request, type Response } from "express";
import {
  initCatalystApp,
  createEnterpriseDealsRepo,
  createDealAlertDispositionsRepo,
  type CatalystApp,
} from "@workspace/db/catalyst";
import {
  SetDispositionParams,
  SetDispositionBody,
  SetDispositionResponse,
  ClearDispositionParams,
} from "@workspace/api-zod";
import { getActor } from "../lib/auth";
import { badRequest, notFound } from "../lib/http";
import { toISO, getDealWithLookups } from "../lib/catalyst/intelligence";
import { writeAudit } from "../lib/catalyst/audit";
import { snapshotFieldValue } from "../lib/snooze-fields";

// Auth + write-role enforcement is applied centrally in routes/index.ts.
const router: IRouter = Router();

async function ensureDeal(catalystApp: CatalystApp, dealId: string) {
  const deal = await createEnterpriseDealsRepo(catalystApp).getById(dealId);
  if (!deal) throw notFound("Deal not found");
}

router.put(
  "/deals/:dealId/alerts/:patternCode/disposition",
  async (req: Request, res: Response) => {
    const { dealId, patternCode } = SetDispositionParams.parse(req.params);
    const parsed = SetDispositionBody.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid disposition payload", parsed.error.issues);
    }
    const catalystApp = initCatalystApp(req);
    await ensureDeal(catalystApp, dealId);
    const actor = getActor(req);
    const body = parsed.data;

    if (body.disposition === "accept" && !body.rationale) {
      throw badRequest("Rationale is required to accept a risk");
    }
    if (body.disposition === "snooze" && !body.snooze_duration_days) {
      throw badRequest("Snooze requires a duration");
    }

    // Snooze auto-expires on whichever comes first: the duration elapsing
    // (snoozeUntil) or the watched field changing (snoozeFieldBaseline vs.
    // its current value, compared lazily in lib/catalyst/intelligence.ts).
    // Both are null for acknowledge/accept.
    let snoozeUntil: Date | null = null;
    let snoozeFieldBaseline: string | null = null;
    if (body.disposition === "snooze") {
      snoozeUntil = new Date(
        Date.now() + body.snooze_duration_days! * 86_400_000,
      );
      if (body.snooze_until_field_change) {
        const dealRow = await getDealWithLookups(catalystApp, dealId);
        if (!dealRow) throw notFound("Deal not found");
        snoozeFieldBaseline = snapshotFieldValue(
          body.snooze_until_field_change,
          dealRow.deal,
        );
      }
    }

    const created = await createDealAlertDispositionsRepo(catalystApp).upsert({
      dealId,
      patternCode,
      disposition: body.disposition,
      rationale: body.rationale ?? null,
      snoozeUntilFieldChange: body.snooze_until_field_change ?? null,
      snoozeUntil,
      snoozeFieldBaseline,
      createdBy: actor.displayName,
    });

    await writeAudit(catalystApp, {
      dealId,
      entityType: "disposition",
      fieldChanged: patternCode,
      newValue: body.disposition,
      changedBy: actor.displayName,
    });

    res.json(
      SetDispositionResponse.parse({
        data: {
          id: created.id,
          dealId: created.dealId,
          patternCode: created.patternCode,
          disposition: created.disposition,
          rationale: created.rationale,
          snoozeUntilFieldChange: created.snoozeUntilFieldChange,
          snoozeUntil: toISO(created.snoozeUntil),
          createdBy: created.createdBy,
          createdAt: toISO(created.createdAt) ?? undefined,
        },
      }),
    );
  },
);

router.delete(
  "/deals/:dealId/alerts/:patternCode/disposition",
  async (req: Request, res: Response) => {
    const { dealId, patternCode } = ClearDispositionParams.parse(req.params);
    const catalystApp = initCatalystApp(req);
    await ensureDeal(catalystApp, dealId);
    const actor = getActor(req);
    const deleted = await createDealAlertDispositionsRepo(catalystApp).delete(dealId, patternCode);
    if (!deleted) throw notFound("Disposition not found");
    await writeAudit(catalystApp, {
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
