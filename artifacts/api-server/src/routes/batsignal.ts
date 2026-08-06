import { Router, type IRouter, type Request, type Response } from "express";
import { initCatalystApp, createEnterpriseDealsRepo, createBatSignalsRepo } from "@workspace/db/catalyst";
import { CreateBatSignalParams } from "@workspace/api-zod";
import { getActor } from "../lib/auth";
import { notFound } from "../lib/http";
import { writeAudit } from "../lib/catalyst/audit";

// Auth + write-role enforcement is applied centrally in routes/index.ts.
const router: IRouter = Router();

const EXPIRY_MS = 48 * 60 * 60 * 1000;

router.post(
  "/deals/:dealId/bat-signal",
  async (req: Request, res: Response) => {
    const { dealId } = CreateBatSignalParams.parse(req.params);
    const catalystApp = initCatalystApp(req);
    const deal = await createEnterpriseDealsRepo(catalystApp).getById(dealId);
    if (!deal) throw notFound("Deal not found");

    const actor = getActor(req);
    const expiresAt = new Date(Date.now() + EXPIRY_MS);

    const { token } = await createBatSignalsRepo(catalystApp).create({
      dealId,
      createdBy: actor.displayName,
      expiresAt,
    });

    await writeAudit(catalystApp, {
      dealId,
      entityType: "bat_signal",
      fieldChanged: "created",
      newValue: token,
      changedBy: actor.displayName,
    });

    // APP_ORIGIN is the full public origin (scheme + host) users hit in
    // their browser — NOT the API server's own port, which differs from it
    // in local dev (frontend :5173 proxies /api to the server on :5000).
    // Falls back to a relative path when unset, same as before this was
    // ever configured.
    const origin = (process.env.APP_ORIGIN ?? "").split(",")[0]?.trim();
    const shareUrl = origin ? `${origin}/share/${token}` : `/share/${token}`;

    res.status(201).json({
      data: { shareUrl, expiresAt: expiresAt.toISOString() },
    });
  },
);

export default router;
