import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, enterpriseDeals, batSignals } from "@workspace/db";
import { CreateBatSignalParams } from "@workspace/api-zod";
import { requireAuth, getActor } from "../lib/auth";
import { notFound } from "../lib/http";
import { writeAudit } from "../lib/audit";

const router: IRouter = Router();

router.use(requireAuth);

const EXPIRY_MS = 48 * 60 * 60 * 1000;

router.post(
  "/deals/:dealId/bat-signal",
  async (req: Request, res: Response) => {
    const { dealId } = CreateBatSignalParams.parse(req.params);
    const dealRows = await db
      .select({ id: enterpriseDeals.id })
      .from(enterpriseDeals)
      .where(eq(enterpriseDeals.id, dealId))
      .limit(1);
    if (dealRows.length === 0) throw notFound("Deal not found");

    const actor = getActor(req);
    const expiresAt = new Date(Date.now() + EXPIRY_MS);

    const inserted = await db
      .insert(batSignals)
      .values({ dealId, createdBy: actor.displayName, expiresAt })
      .returning({ token: batSignals.token });

    const token = inserted[0].token;

    await writeAudit({
      dealId,
      entityType: "bat_signal",
      fieldChanged: "created",
      newValue: token,
      changedBy: actor.displayName,
    });

    const domain = (process.env.APP_DOMAIN ?? "").split(",")[0]?.trim();
    const shareUrl = domain
      ? `https://${domain}/share/${token}`
      : `/share/${token}`;

    res.status(201).json({
      data: { shareUrl, expiresAt: expiresAt.toISOString() },
    });
  },
);

export default router;
