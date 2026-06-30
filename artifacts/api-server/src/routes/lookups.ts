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
  competitors,
  complianceDrivers,
  competitorBattlecards,
  teamMembers,
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
  ListCompetitorsResponse,
  ListComplianceDriversResponse,
  ListCompetitorBattlecardsResponse,
  CreateCompetitorBody,
  CreateComplianceDriverBody,
  ListTeamMembersResponse,
  CreateTeamMemberBody,
  DeleteTeamMemberParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { badRequest, conflict, notFound } from "../lib/http";

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
    code: r.code,
    productName: r.productName,
    productCategory: r.productCategory,
    suite: r.suite,
  }));
  res.json(ListProductCatalogResponse.parse({ data }));
});

router.get("/lookups/competitors", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(competitors)
    .where(eq(competitors.isActive, true))
    .orderBy(asc(competitors.name));
  const data = rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
  }));
  res.json(ListCompetitorsResponse.parse({ data }));
});

// B4: combobox add-new — create a competitor (default category "IAM").
router.post("/lookups/competitors", async (req: Request, res: Response) => {
  const parsed = CreateCompetitorBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid competitor payload", parsed.error.issues);
  }
  try {
    const [created] = await db
      .insert(competitors)
      .values({
        name: parsed.data.name,
        category: parsed.data.category ?? "IAM",
      })
      .returning();
    res.status(201).json({
      data: { id: created.id, name: created.name, category: created.category },
    });
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      throw conflict("A competitor with this name already exists");
    }
    throw err;
  }
});

router.get(
  "/lookups/compliance-drivers",
  async (_req: Request, res: Response) => {
    const rows = await db
      .select()
      .from(complianceDrivers)
      .where(eq(complianceDrivers.isActive, true))
      .orderBy(asc(complianceDrivers.name));
    const data = rows.map((r) => ({ id: r.id, name: r.name }));
    res.json(ListComplianceDriversResponse.parse({ data }));
  },
);

// B6: combobox add-new — create a compliance driver.
router.post(
  "/lookups/compliance-drivers",
  async (req: Request, res: Response) => {
    const parsed = CreateComplianceDriverBody.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest("Invalid compliance driver payload", parsed.error.issues);
    }
    try {
      const [created] = await db
        .insert(complianceDrivers)
        .values({ name: parsed.data.name })
        .returning();
      res.status(201).json({ data: { id: created.id, name: created.name } });
    } catch (err) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as { code?: string }).code === "23505"
      ) {
        throw conflict("A compliance driver with this name already exists");
      }
      throw err;
    }
  },
);

// B2: team roster for AM/TL dropdowns. Literal path registered before the
// :id param path (Express route ordering).
router.get("/lookups/team-members", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.isActive, true))
    .orderBy(asc(teamMembers.name));
  const data = rows.map((r) => ({
    id: r.id,
    name: r.name,
    can_be_am: r.canBeAm,
    can_be_tl: r.canBeTl,
  }));
  res.json(ListTeamMembersResponse.parse({ data }));
});

router.post("/lookups/team-members", async (req: Request, res: Response) => {
  const parsed = CreateTeamMemberBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid team member payload", parsed.error.issues);
  }
  try {
    const [created] = await db
      .insert(teamMembers)
      .values({
        name: parsed.data.name,
        canBeAm: parsed.data.can_be_am ?? true,
        canBeTl: parsed.data.can_be_tl ?? false,
      })
      .returning();
    res.status(201).json({
      data: {
        id: created.id,
        name: created.name,
        can_be_am: created.canBeAm,
        can_be_tl: created.canBeTl,
      },
    });
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      throw conflict("A team member with this name already exists");
    }
    throw err;
  }
});

router.delete(
  "/lookups/team-members/:id",
  async (req: Request, res: Response) => {
    const { id } = DeleteTeamMemberParams.parse(req.params);
    const result = await db
      .update(teamMembers)
      .set({ isActive: false })
      .where(eq(teamMembers.id, id))
      .returning({ id: teamMembers.id });
    if (result.length === 0) throw notFound("Team member not found");
    res.json({ message: "Team member deleted" });
  },
);

router.get(
  "/lookups/competitor-battlecards",
  async (_req: Request, res: Response) => {
    const rows = await db
      .select({
        competitorId: competitorBattlecards.competitorId,
        competitorName: competitors.name,
        talkingPoints: competitorBattlecards.talkingPoints,
      })
      .from(competitorBattlecards)
      .innerJoin(
        competitors,
        eq(competitorBattlecards.competitorId, competitors.id),
      )
      .where(eq(competitorBattlecards.isActive, true))
      .orderBy(asc(competitors.name));
    res.json(ListCompetitorBattlecardsResponse.parse({ data: rows }));
  },
);

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
