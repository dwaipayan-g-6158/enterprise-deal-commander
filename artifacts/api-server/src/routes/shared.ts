import { Router, type IRouter, type Request, type Response } from "express";
import { initCatalystApp, createBatSignalsRepo } from "@workspace/db/catalyst";
import { GetSharedRiskCardParams, GetSharedRiskCardResponse } from "@workspace/api-zod";
import { notFound, unauthorized } from "../lib/http";
import {
  assembleDealIntelligence,
  getThresholds,
  getDealWithLookups,
} from "../lib/catalyst/intelligence";

const router: IRouter = Router();

router.get("/share/:token", async (req: Request, res: Response) => {
  const { token } = GetSharedRiskCardParams.parse(req.params);
  const catalystApp = initCatalystApp(req);

  const signal = await createBatSignalsRepo(catalystApp).getByToken(token);
  if (!signal) throw notFound("Share link not found");
  if (signal.expiresAt.getTime() < Date.now()) {
    throw unauthorized("Share link has expired");
  }

  const intel = await assembleDealIntelligence(catalystApp, signal.dealId);
  if (!intel) throw notFound("Deal not found");

  const { thresholds } = await getThresholds(catalystApp);
  const reportingCurrency = String(thresholds.reporting_currency || "USD");

  const dealRow = await getDealWithLookups(catalystApp, signal.dealId);
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
