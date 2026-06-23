import { Router, type IRouter, type Request, type Response } from "express";
import { asc, eq } from "drizzle-orm";
import {
  db,
  pipelineStages,
  pricingModels,
  servicesTiers,
  productCatalog,
  gateDefinitions,
  blockerCategories,
  blockerSeverities,
  lossArchetypes,
  interventionChecklists,
  engineThresholds,
  fxRates,
} from "@workspace/db";
import {
  ListPipelineStagesResponse,
  ListPricingModelsResponse,
  ListServicesTiersResponse,
  ListProductCatalogResponse,
  ListGateDefinitionsResponse,
  ListBlockerCategoriesResponse,
  ListBlockerSeveritiesResponse,
  ListLossArchetypesResponse,
  ListInterventionChecklistsResponse,
  ListEngineThresholdsResponse,
  UpdateEngineThresholdsBody,
  UpdateEngineThresholdsResponse,
  ListFxRatesResponse,
  UpdateFxRatesBody,
  UpdateFxRatesResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { badRequest } from "../lib/http";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/lookups/pipeline-stages", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.isActive, true))
    .orderBy(asc(pipelineStages.sortOrder));
  const data = rows.map((r) => ({
    id: r.id,
    stageName: r.stageName,
    sortOrder: r.sortOrder,
    description: r.description,
  }));
  res.json(ListPipelineStagesResponse.parse({ data }));
});

router.get("/lookups/pricing-models", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(pricingModels)
    .where(eq(pricingModels.isActive, true))
    .orderBy(asc(pricingModels.id));
  const data = rows.map((r) => ({ id: r.id, modelName: r.modelName }));
  res.json(ListPricingModelsResponse.parse({ data }));
});

router.get("/lookups/services-tiers", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(servicesTiers)
    .where(eq(servicesTiers.isActive, true))
    .orderBy(asc(servicesTiers.id));
  const data = rows.map((r) => ({ id: r.id, tierName: r.tierName }));
  res.json(ListServicesTiersResponse.parse({ data }));
});

router.get("/lookups/product-catalog", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(productCatalog)
    .where(eq(productCatalog.isActive, true))
    .orderBy(asc(productCatalog.productName));
  const data = rows.map((r) => ({
    id: r.id,
    productName: r.productName,
    productCategory: r.productCategory,
  }));
  res.json(ListProductCatalogResponse.parse({ data }));
});

router.get("/lookups/gate-definitions", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(gateDefinitions)
    .where(eq(gateDefinitions.isActive, true))
    .orderBy(asc(gateDefinitions.sortOrder));
  const data = rows.map((r) => ({
    gateGroup: r.gateGroup,
    gateCode: r.gateCode,
    label: r.label,
    description: r.description,
    sortOrder: r.sortOrder,
    prerequisiteGateCodes: r.prerequisiteGateCodes,
  }));
  res.json(ListGateDefinitionsResponse.parse({ data }));
});

router.get(
  "/lookups/blocker-categories",
  async (_req: Request, res: Response) => {
    const rows = await db
      .select()
      .from(blockerCategories)
      .where(eq(blockerCategories.isActive, true))
      .orderBy(asc(blockerCategories.id));
    const data = rows.map((r) => ({ id: r.id, categoryName: r.categoryName }));
    res.json(ListBlockerCategoriesResponse.parse({ data }));
  },
);

router.get(
  "/lookups/blocker-severities",
  async (_req: Request, res: Response) => {
    const rows = await db
      .select()
      .from(blockerSeverities)
      .orderBy(asc(blockerSeverities.sortOrder));
    const data = rows.map((r) => ({
      id: r.id,
      severityName: r.severityName,
      sortOrder: r.sortOrder,
    }));
    res.json(ListBlockerSeveritiesResponse.parse({ data }));
  },
);

router.get("/lookups/loss-archetypes", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(lossArchetypes)
    .where(eq(lossArchetypes.isActive, true))
    .orderBy(asc(lossArchetypes.id));
  const data = rows.map((r) => ({ id: r.id, archetypeName: r.archetypeName }));
  res.json(ListLossArchetypesResponse.parse({ data }));
});

router.get(
  "/lookups/intervention-checklists",
  async (_req: Request, res: Response) => {
    const rows = await db
      .select()
      .from(interventionChecklists)
      .where(eq(interventionChecklists.isActive, true))
      .orderBy(asc(interventionChecklists.id));
    const data = rows.map((r) => ({
      id: r.id,
      triggerPatternCode: r.triggerPatternCode,
      name: r.name,
      steps: r.steps,
    }));
    res.json(ListInterventionChecklistsResponse.parse({ data }));
  },
);

router.get(
  "/lookups/engine-thresholds",
  async (_req: Request, res: Response) => {
    const rows = await db
      .select()
      .from(engineThresholds)
      .orderBy(asc(engineThresholds.parameterKey));
    const data = rows.map((r) => ({
      parameterKey: r.parameterKey,
      parameterValue: r.parameterValue,
      dataType: r.dataType,
      description: r.description,
    }));
    res.json(ListEngineThresholdsResponse.parse({ data }));
  },
);

router.put(
  "/lookups/engine-thresholds",
  async (req: Request, res: Response) => {
    const parsed = UpdateEngineThresholdsBody.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid thresholds payload", parsed.error.issues);
    }
    for (const update of parsed.data.updates) {
      await db
        .insert(engineThresholds)
        .values({
          parameterKey: update.parameter_key,
          parameterValue: update.parameter_value,
        })
        .onConflictDoUpdate({
          target: engineThresholds.parameterKey,
          set: { parameterValue: update.parameter_value },
        });
    }
    const rows = await db
      .select()
      .from(engineThresholds)
      .orderBy(asc(engineThresholds.parameterKey));
    const data = rows.map((r) => ({
      parameterKey: r.parameterKey,
      parameterValue: r.parameterValue,
      dataType: r.dataType,
      description: r.description,
    }));
    res.json(UpdateEngineThresholdsResponse.parse({ data }));
  },
);

router.get("/lookups/fx-rates", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(fxRates)
    .orderBy(asc(fxRates.baseCurrency));
  const data = rows.map((r) => ({
    baseCurrency: r.baseCurrency,
    quoteCurrency: r.quoteCurrency,
    rate: Number(r.rate),
    asOf: r.asOf,
  }));
  res.json(ListFxRatesResponse.parse({ data }));
});

router.put("/lookups/fx-rates", async (req: Request, res: Response) => {
  const parsed = UpdateFxRatesBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid fx rates payload", parsed.error.issues);
  }
  for (const update of parsed.data.updates) {
    await db
      .insert(fxRates)
      .values({
        baseCurrency: update.base_currency,
        quoteCurrency: update.quote_currency,
        rate: String(update.rate),
        asOf: update.as_of,
      })
      .onConflictDoUpdate({
        target: [fxRates.baseCurrency, fxRates.quoteCurrency, fxRates.asOf],
        set: { rate: String(update.rate) },
      });
  }
  const rows = await db
    .select()
    .from(fxRates)
    .orderBy(asc(fxRates.baseCurrency));
  const data = rows.map((r) => ({
    baseCurrency: r.baseCurrency,
    quoteCurrency: r.quoteCurrency,
    rate: Number(r.rate),
    asOf: r.asOf,
  }));
  res.json(UpdateFxRatesResponse.parse({ data }));
});

export default router;
