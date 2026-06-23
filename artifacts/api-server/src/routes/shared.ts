import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, batSignals } from "@workspace/db";
import { GetSharedRiskCardParams, GetSharedRiskCardResponse } from "@workspace/api-zod";
import { notFound, unauthorized } from "../lib/http";
import {
  assembleDealIntelligence,
  getThresholds,
  getDealWithLookups,
} from "../lib/intelligence";

const router: IRouter = Router();

router.get("/share/:token", async (req: Request, res: Response) => {
  const { token } = GetSharedRiskCardParams.parse(req.params);

  const rows = await db
    .select()
    .from(batSignals)
    .where(eq(batSignals.token, token))
    .limit(1);
  const signal = rows[0];
  if (!signal) throw notFound("Share link not found");
  if (signal.expiresAt.getTime() < Date.now()) {
    throw unauthorized("Share link has expired");
  }

  const intel = await assembleDealIntelligence(signal.dealId);
  if (!intel) throw notFound("Deal not found");

  const { thresholds } = await getThresholds();
  const reportingCurrency = String(thresholds.reporting_currency || "USD");

  const dealRow = await getDealWithLookups(signal.dealId);
  const strategicAsk = dealRow?.deal.managerStrategicBlueprint ?? null;

  res.json(
    GetSharedRiskCardResponse.parse({
      data: {
        dealName: intel.dealName,
        accountName: intel.accountName,
        normalizedTCV: intel.financials.normalizedTCV,
        reportingCurrency,
        healthStatus: intel.governance.healthStatus,
        salesStage: intel.salesStage,
        progressPercentage: intel.technicalTrack.progressPercentage,
        currentMilestone: intel.technicalTrack.currentMilestone,
        alerts: intel.governance.alerts,
        strategicAsk,
      },
    }),
  );
});

export default router;
