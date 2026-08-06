import { Router, type IRouter, type Request, type Response } from "express";
import {
  initCatalystApp,
  createPipelineStagesRepo,
  createPricingModelsRepo,
  createServicesTiersRepo,
  createProductCatalogRepo,
  createAd360FeaturesRepo,
  createCompetitorsRepo,
  createComplianceDriversRepo,
  createTeamMembersRepo,
  createCompetitorBattlecardsRepo,
  createGateDefinitionsRepo,
  createBlockerCategoriesRepo,
  createBlockerSeveritiesRepo,
  createLossArchetypesRepo,
  createInterventionChecklistsRepo,
  createEngineThresholdsRepo,
  createFxRatesRepo,
  DuplicateNameError,
} from "@workspace/db/catalyst";
import {
  ListPipelineStagesResponse,
  ListPricingModelsResponse,
  ListServicesTiersResponse,
  ListProductCatalogResponse,
  ListAd360FeaturesResponse,
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
import { getActor } from "../lib/auth";
import { badRequest, conflict, notFound } from "../lib/http";
import { validateThresholdUpdate } from "../lib/threshold-validation";
// Shared, admin-scoped. This file used to carry its own user-scoped copy —
// see lib/catalyst/settings-audit.ts for why that scope matters.
import { logSettingsChange } from "../lib/catalyst/settings-audit";

// Auth + write-role enforcement is applied centrally in routes/index.ts.
const router: IRouter = Router();

router.get("/lookups/pipeline-stages", async (req: Request, res: Response) => {
  const repo = createPipelineStagesRepo(initCatalystApp(req));
  const data = await repo.listActive();
  res.json(ListPipelineStagesResponse.parse({ data }));
});

router.get("/lookups/pricing-models", async (req: Request, res: Response) => {
  const repo = createPricingModelsRepo(initCatalystApp(req));
  const data = await repo.listActive();
  res.json(ListPricingModelsResponse.parse({ data }));
});

router.get("/lookups/services-tiers", async (req: Request, res: Response) => {
  const repo = createServicesTiersRepo(initCatalystApp(req));
  const data = await repo.listActive();
  res.json(ListServicesTiersResponse.parse({ data }));
});

router.get("/lookups/product-catalog", async (req: Request, res: Response) => {
  const repo = createProductCatalogRepo(initCatalystApp(req));
  const data = await repo.listActive();
  res.json(ListProductCatalogResponse.parse({ data }));
});

// Predefined AD360 Enterprise platform-customization pick-list.
router.get("/lookups/ad360-features", async (req: Request, res: Response) => {
  const repo = createAd360FeaturesRepo(initCatalystApp(req));
  const data = await repo.listActive();
  res.json(ListAd360FeaturesResponse.parse({ data }));
});

router.get("/lookups/competitors", async (req: Request, res: Response) => {
  const repo = createCompetitorsRepo(initCatalystApp(req));
  const data = await repo.listActive();
  res.json(ListCompetitorsResponse.parse({ data }));
});

// B4: combobox add-new — create a competitor (default category "IAM").
router.post("/lookups/competitors", async (req: Request, res: Response) => {
  const parsed = CreateCompetitorBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid competitor payload", parsed.error.issues);
  }
  const actor = getActor(req);
  const repo = createCompetitorsRepo(initCatalystApp(req));
  try {
    const created = await repo.create({
      name: parsed.data.name,
      category: parsed.data.category ?? "IAM",
    });
    await logSettingsChange(req, {
      module: "competitors",
      settingKey: created.name,
      entityId: String(created.id),
      action: "create",
      oldValue: null,
      newValue: { name: created.name, category: created.category },
      actor: actor.username,
    });
    res.status(201).json({ data: created });
  } catch (err) {
    if (err instanceof DuplicateNameError) {
      throw conflict(err.message);
    }
    throw err;
  }
});

router.get(
  "/lookups/compliance-drivers",
  async (req: Request, res: Response) => {
    const repo = createComplianceDriversRepo(initCatalystApp(req));
    const data = await repo.listActive();
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
    const actor = getActor(req);
    const repo = createComplianceDriversRepo(initCatalystApp(req));
    try {
      const created = await repo.create({ name: parsed.data.name });
      await logSettingsChange(req, {
        module: "compliance_drivers",
        settingKey: created.name,
        entityId: String(created.id),
        action: "create",
        oldValue: null,
        newValue: { name: created.name },
        actor: actor.username,
      });
      res.status(201).json({ data: created });
    } catch (err) {
      if (err instanceof DuplicateNameError) {
        throw conflict(err.message);
      }
      throw err;
    }
  },
);

// B2: team roster for AM/TL dropdowns. Literal path registered before the
// :id param path (Express route ordering).
router.get("/lookups/team-members", async (req: Request, res: Response) => {
  const repo = createTeamMembersRepo(initCatalystApp(req));
  const data = (await repo.listActive()).map((r) => ({
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
  const actor = getActor(req);
  const repo = createTeamMembersRepo(initCatalystApp(req));
  try {
    const created = await repo.create({
      name: parsed.data.name,
      canBeAm: parsed.data.can_be_am ?? true,
      canBeTl: parsed.data.can_be_tl ?? false,
    });
    await logSettingsChange(req, {
      module: "team_members",
      settingKey: created.name,
      entityId: String(created.id),
      action: "create",
      oldValue: null,
      newValue: { name: created.name, canBeAm: created.canBeAm, canBeTl: created.canBeTl },
      actor: actor.username,
    });
    res.status(201).json({
      data: {
        id: created.id,
        name: created.name,
        can_be_am: created.canBeAm,
        can_be_tl: created.canBeTl,
      },
    });
  } catch (err) {
    if (err instanceof DuplicateNameError) {
      throw conflict(err.message);
    }
    throw err;
  }
});

router.delete(
  "/lookups/team-members/:id",
  async (req: Request, res: Response) => {
    const { id } = DeleteTeamMemberParams.parse(req.params);
    const actor = getActor(req);
    const repo = createTeamMembersRepo(initCatalystApp(req));
    const result = await repo.deactivate(Number(id));
    if (!result) throw notFound("Team member not found");
    await logSettingsChange(req, {
      module: "team_members",
      settingKey: result.name,
      entityId: String(id),
      action: "deactivate",
      oldValue: { isActive: true },
      newValue: { isActive: false },
      actor: actor.username,
    });
    res.json({ message: "Team member deleted" });
  },
);

router.get(
  "/lookups/competitor-battlecards",
  async (req: Request, res: Response) => {
    const repo = createCompetitorBattlecardsRepo(initCatalystApp(req));
    const data = await repo.listActive();
    res.json(ListCompetitorBattlecardsResponse.parse({ data }));
  },
);

router.get("/lookups/gate-definitions", async (req: Request, res: Response) => {
  const repo = createGateDefinitionsRepo(initCatalystApp(req));
  const data = await repo.listActive();
  res.json(ListGateDefinitionsResponse.parse({ data }));
});

router.get(
  "/lookups/blocker-categories",
  async (req: Request, res: Response) => {
    const repo = createBlockerCategoriesRepo(initCatalystApp(req));
    const data = await repo.listActive();
    res.json(ListBlockerCategoriesResponse.parse({ data }));
  },
);

router.get(
  "/lookups/blocker-severities",
  async (req: Request, res: Response) => {
    const repo = createBlockerSeveritiesRepo(initCatalystApp(req));
    const data = await repo.listAll();
    res.json(ListBlockerSeveritiesResponse.parse({ data }));
  },
);

router.get("/lookups/loss-archetypes", async (req: Request, res: Response) => {
  const repo = createLossArchetypesRepo(initCatalystApp(req));
  const data = await repo.listActive();
  res.json(ListLossArchetypesResponse.parse({ data }));
});

router.get(
  "/lookups/intervention-checklists",
  async (req: Request, res: Response) => {
    const repo = createInterventionChecklistsRepo(initCatalystApp(req));
    const data = await repo.listActive();
    res.json(ListInterventionChecklistsResponse.parse({ data }));
  },
);

router.get(
  "/lookups/engine-thresholds",
  async (req: Request, res: Response) => {
    const repo = createEngineThresholdsRepo(initCatalystApp(req));
    const data = await repo.listAll();
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
    const actor = getActor(req);
    const repo = createEngineThresholdsRepo(initCatalystApp(req));
    const beforeByKey = await repo.mapByKey();

    // validateThresholdUpdate only applies its numeric/bounds rules to keys
    // it recognizes by name (POSITIVE_WEIGHT_KEYS etc.) or that are already
    // present in `current` — a genuinely unknown parameter_key sails through
    // both and would otherwise get upserted into engine_thresholds with zero
    // validation at all. Reject the whole batch up front instead.
    const unknownKeys = [...new Set(
      parsed.data.updates
        .map((u) => u.parameter_key)
        .filter((key) => !beforeByKey.has(key)),
    )];
    if (unknownKeys.length > 0) {
      throw badRequest(`Unrecognized engine threshold parameter_key(s): ${unknownKeys.join(", ")}`);
    }

    const currentMap = new Map(
      [...beforeByKey.entries()].map(([k, v]) => [k, { parameterValue: v.parameterValue, dataType: v.dataType }]),
    );
    const validation = validateThresholdUpdate(parsed.data.updates, currentMap);
    if (!validation.valid) {
      throw badRequest(validation.error ?? "Invalid threshold update");
    }
    for (const update of parsed.data.updates) {
      const prior = beforeByKey.get(update.parameter_key);
      await repo.upsertOne(update.parameter_key, update.parameter_value);
      await logSettingsChange(req, {
        module: "engine_thresholds",
        settingKey: update.parameter_key,
        action: "update",
        oldValue: prior?.parameterValue ?? null,
        newValue: update.parameter_value,
        dataType: prior?.dataType ?? "number",
        actor: actor.username,
      });
    }
    const data = await repo.listAll();
    res.json(UpdateEngineThresholdsResponse.parse({ data }));
  },
);

router.get("/lookups/fx-rates", async (req: Request, res: Response) => {
  const repo = createFxRatesRepo(initCatalystApp(req));
  const data = await repo.listAll();
  res.json(ListFxRatesResponse.parse({ data }));
});

router.put("/lookups/fx-rates", async (req: Request, res: Response) => {
  const parsed = UpdateFxRatesBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid fx rates payload", parsed.error.issues);
  }
  const actor = getActor(req);
  const repo = createFxRatesRepo(initCatalystApp(req));
  const beforeByKey = await repo.mapByKey();
  for (const update of parsed.data.updates) {
    const key = `${update.base_currency}:${update.quote_currency}:${update.as_of}`;
    const prior = beforeByKey.get(key);
    await repo.upsertOne(update.base_currency, update.quote_currency, update.as_of, update.rate);
    await logSettingsChange(req, {
      module: "fx_rates",
      settingKey: key,
      action: "update",
      oldValue: prior ? prior.rate : null,
      newValue: update.rate,
      dataType: "number",
      actor: actor.username,
    });
  }
  const data = await repo.listAll();
  res.json(UpdateFxRatesResponse.parse({ data }));
});

export default router;
