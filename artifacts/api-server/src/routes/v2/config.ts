import { Router, type IRouter, type Request, type Response } from "express";
import {
  initCatalystApp,
  type CatalystApp,
  createPlaybooksRepo,
  createPlaybookStepsRepo,
  createDealPlaybookAssignmentsRepo,
  createPlaybookStepCompletionsRepo,
  createEnterpriseDealsRepo,
  createPipelineStagesRepo,
  createPricingModelsRepo,
  createDealTechnicalGatesRepo,
  createDealBlockersRepo,
  createBlockerSeveritiesRepo,
  createDealPricingScheduleRepo,
  createFinancialScenariosRepo,
  createCustomRiskPatternsRepo,
  createCustomPatternConditionsRepo,
  createPipelineTargetsRepo,
  createScoringModelWeightsRepo,
} from "@workspace/db/catalyst";
import {
  computeRampTCV,
  evaluateCustomPatterns,
  calculateFlatTCV,
  type CustomPattern,
  type PricingYear,
} from "@workspace/engine";
import {
  CreatePlaybookBody,
  UpdatePlaybookParams,
  UpdatePlaybookBody,
  DeletePlaybookParams,
  GetPlaybookJourneyParams,
  StartDealPlaybookParams,
  SetPlaybookStepStateParams,
  SetPlaybookStepStateBody,
  ReopenPlaybookStepParams,
  GetPricingScheduleParams,
  UpdatePricingScheduleParams,
  UpdatePricingScheduleBody,
  ListScenariosQueryParams,
  CreateScenarioBody,
  DeleteScenarioParams,
  ComputeScenarioBody,
  CreateCustomPatternBody,
  UpdateCustomPatternParams,
  UpdateCustomPatternBody,
  DeleteCustomPatternParams,
  TestCustomPatternBody,
  UpsertPipelineTargetBody,
  UpdateScoringWeightsBody,
} from "@workspace/api-zod";
import { getActor } from "../../lib/auth";
import { badRequest, notFound } from "../../lib/http";
import { logSettingsChange } from "../../lib/catalyst/settings-audit";
import { emitDealEvent } from "../../lib/events";
import {
  getPlaybookJourney,
  startPlaybookForDeal,
  recomputeAssignment,
  dealIdForAssignment,
} from "../../lib/catalyst/playbook-signals";
import { cache, CacheKeys } from "../../lib/cache";
import { rescoreActiveDeals } from "../../lib/catalyst/scoring";

const router: IRouter = Router();

/* --------------------------------------------------------------- F11 Playbooks */

async function playbookWithSteps(catalystApp: CatalystApp, id: string) {
  const pb = await createPlaybooksRepo(catalystApp).getById(id);
  if (!pb) return null;
  const steps = await createPlaybookStepsRepo(catalystApp).listByPlaybookId(id);
  return {
    id: pb.id,
    playbookName: pb.playbookName,
    description: pb.description,
    applicableStage: pb.applicableStage,
    isActive: pb.isActive,
    steps: steps.map((s) => ({
      id: s.id,
      stepOrder: s.stepOrder,
      stepName: s.stepName,
      description: s.description,
      triggerCondition: s.triggerCondition,
      recommendedAction: s.recommendedAction,
      expectedDurationDays: s.expectedDurationDays,
      isCritical: s.isCritical,
    })),
  };
}

router.get("/playbooks", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const all = await createPlaybooksRepo(catalystApp).listAll(); // already sorted by name
  const data = [];
  for (const pb of all) data.push(await playbookWithSteps(catalystApp, pb.id));
  res.json({ data: data.filter(Boolean) });
});

router.post("/playbooks", async (req: Request, res: Response) => {
  const b = CreatePlaybookBody.parse(req.body);
  const catalystApp = initCatalystApp(req);
  const actor = getActor(req);
  const pb = await createPlaybooksRepo(catalystApp).create({
    playbookName: b.playbook_name,
    description: b.description ?? null,
    applicableStage: b.applicable_stage ?? null,
    isActive: b.is_active ?? true,
    createdBy: actor.username,
  });
  if (b.steps?.length) {
    await createPlaybookStepsRepo(catalystApp).replaceForPlaybook(
      pb.id,
      b.steps.map((s) => ({
        stepOrder: s.step_order,
        stepName: s.step_name,
        description: s.description ?? null,
        triggerCondition: s.trigger_condition ?? null,
        recommendedAction: s.recommended_action,
        expectedDurationDays: s.expected_duration_days ?? null,
        isCritical: s.is_critical ?? false,
      })),
    );
  }
  res.status(201).json({ data: await playbookWithSteps(catalystApp, pb.id) });
});

router.put("/playbooks/:id", async (req: Request, res: Response) => {
  const { id } = UpdatePlaybookParams.parse(req.params);
  const b = UpdatePlaybookBody.parse(req.body);
  const catalystApp = initCatalystApp(req);
  const pb = await createPlaybooksRepo(catalystApp).update(id, {
    playbookName: b.playbook_name,
    description: b.description ?? null,
    applicableStage: b.applicable_stage ?? null,
    isActive: b.is_active ?? undefined,
  });
  if (!pb) throw notFound("Playbook not found");
  if (b.steps) {
    await createPlaybookStepsRepo(catalystApp).replaceForPlaybook(
      id,
      b.steps.map((s) => ({
        stepOrder: s.step_order,
        stepName: s.step_name,
        description: s.description ?? null,
        triggerCondition: s.trigger_condition ?? null,
        recommendedAction: s.recommended_action,
        expectedDurationDays: s.expected_duration_days ?? null,
        isCritical: s.is_critical ?? false,
      })),
    );
  }
  res.json({ data: await playbookWithSteps(catalystApp, id) });
});

router.delete("/playbooks/:id", async (req: Request, res: Response) => {
  const { id } = DeletePlaybookParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  // Mirrors the original schema's playbook_steps.playbookId onDelete:"cascade"
  // (native in Postgres, not native in Data Store) — explicit ordered delete,
  // children before parent. Existing assignments/completions referencing this
  // playbook are left untouched, same as the original code (no explicit
  // cascade for those either — Postgres itself would only restrict, not
  // cascade, since dealPlaybookAssignments.playbookId has no onDelete clause).
  await createPlaybookStepsRepo(catalystApp).replaceForPlaybook(id, []);
  await createPlaybooksRepo(catalystApp).delete(id);
  res.json({ message: "Playbook deleted" });
});

// Lazy backfill: when a deal sitting in a stage has no assignment yet for that
// stage's configured playbook, create one on first read (currentStepId = first
// step). Mirrors the on-stage-change auto-assign in
// subscribers/playbook-engine.ts so deals that were already in a stage before
// playbooks existed (or a deal created directly into a stage, with no
// stage_changed event ever firing) still pick one up. Guarded per (deal,
// playbook) via startPlaybookForDeal — a no-op once the assignment exists.
async function autoAssignCurrentStagePlaybook(catalystApp: CatalystApp, dealId: string): Promise<void> {
  const deal = await createEnterpriseDealsRepo(catalystApp).getById(dealId);
  if (!deal) return;
  const stages = await createPipelineStagesRepo(catalystApp).listAll();
  const stageName = stages.find((s) => s.id === deal.salesStageId)?.stageName;
  if (!stageName) return;

  const activePlaybooks = await createPlaybooksRepo(catalystApp).listActive();
  const playbook = activePlaybooks.find((p) => p.applicableStage === stageName);
  if (!playbook) return;

  const { assignment, created } = await startPlaybookForDeal(catalystApp, dealId, playbook.id);
  if (!created) return;
  emitDealEvent("playbook.assigned", {
    dealId,
    actor: "system",
    assignmentId: assignment.id,
    playbookId: playbook.id,
    catalystApp,
  });
}

// GET /v2/deals/{dealId}/playbook-journey — the full stage-by-stage picture:
// one entry per stage that has a configured playbook (Discovery → Closed-Won),
// each not_started / active / completed. Replaces the old singular
// GET .../playbook, which only ever showed one playbook at a time.
router.get("/deals/:dealId/playbook-journey", async (req: Request, res: Response) => {
  const { dealId } = GetPlaybookJourneyParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  await autoAssignCurrentStagePlaybook(catalystApp, dealId);
  const journey = await getPlaybookJourney(catalystApp, dealId);
  res.json({ data: { journey } });
});

// POST /v2/deals/{dealId}/playbooks/{playbookId}/start — manual start of any
// stage's playbook (idempotent: returns the existing assignment if already
// started). Lets a Commander pre-work an upcoming stage or backfill a gap.
router.post("/deals/:dealId/playbooks/:playbookId/start", async (req: Request, res: Response) => {
  const { dealId, playbookId } = StartDealPlaybookParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  const actor = getActor(req);
  const { assignment, created } = await startPlaybookForDeal(catalystApp, dealId, playbookId);
  if (created) {
    emitDealEvent("playbook.assigned", {
      dealId,
      actor: actor.displayName,
      assignmentId: assignment.id,
      playbookId,
      catalystApp,
    });
  }
  res.json({ data: { assignmentId: assignment.id, created } });
});

// Set a step's action state (completed | skipped | blocked) with an optional note.
// Steps are freely actionable in any order. Upserts one ledger row per step.
router.post(
  "/playbook-assignments/:assignmentId/steps/:stepId/state",
  async (req: Request, res: Response) => {
    const { assignmentId, stepId } = SetPlaybookStepStateParams.parse(req.params);
    const b = SetPlaybookStepStateBody.parse(req.body ?? {});
    const catalystApp = initCatalystApp(req);
    const actor = getActor(req);
    await createPlaybookStepCompletionsRepo(catalystApp).upsertForStep({
      assignmentId,
      stepId,
      status: b.status,
      note: b.note ?? null,
      completedBy: actor.displayName,
    });
    await recomputeAssignment(catalystApp, assignmentId);
    const dealId = await dealIdForAssignment(catalystApp, assignmentId);
    if (dealId)
      emitDealEvent("playbook.step_changed", {
        dealId,
        actor: actor.displayName,
        assignmentId,
        stepId,
        action: b.status,
        catalystApp,
      });
    res.json({ data: { status: b.status } });
  },
);

// Reopen a step — remove its action so it returns to "not started".
router.delete(
  "/playbook-assignments/:assignmentId/steps/:stepId/state",
  async (req: Request, res: Response) => {
    const { assignmentId, stepId } = ReopenPlaybookStepParams.parse(req.params);
    const catalystApp = initCatalystApp(req);
    const actor = getActor(req);
    await createPlaybookStepCompletionsRepo(catalystApp).deleteForStep(assignmentId, stepId);
    await recomputeAssignment(catalystApp, assignmentId);
    const dealId = await dealIdForAssignment(catalystApp, assignmentId);
    if (dealId)
      emitDealEvent("playbook.step_changed", {
        dealId,
        actor: actor.displayName,
        assignmentId,
        stepId,
        action: "reopened",
        catalystApp,
      });
    res.json({ data: { reopened: true } });
  },
);

/* --------------------------------------------------- F13 Pricing schedule + scenarios */

async function fallbackPricing(catalystApp: CatalystApp, dealId: string) {
  const deal = await createEnterpriseDealsRepo(catalystApp).getById(dealId);
  if (!deal) {
    return { productRevenue: 0, servicesRevenue: 0, contractTermYears: 1, pricingModel: "Annual" };
  }
  const pricingModels = await createPricingModelsRepo(catalystApp).listAll();
  const pricingModel = pricingModels.find((p) => p.id === deal.pricingModelId)?.modelName ?? "Annual";
  return {
    productRevenue: Number(deal.productRevenue) || 0,
    servicesRevenue: Number(deal.servicesRevenue) || 0,
    contractTermYears: deal.contractTermYears ?? 1,
    pricingModel,
  };
}

async function scheduleFor(catalystApp: CatalystApp, dealId: string): Promise<PricingYear[]> {
  return createDealPricingScheduleRepo(catalystApp).list(dealId);
}

router.get("/deals/:dealId/pricing-schedule", async (req: Request, res: Response) => {
  const { dealId } = GetPricingScheduleParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  const schedule = await scheduleFor(catalystApp, dealId);
  const rampTCV = computeRampTCV(schedule, await fallbackPricing(catalystApp, dealId));
  res.json({ data: schedule, rampTCV });
});

router.put("/deals/:dealId/pricing-schedule", async (req: Request, res: Response) => {
  const { dealId } = UpdatePricingScheduleParams.parse(req.params);
  const b = UpdatePricingScheduleBody.parse(req.body);
  const catalystApp = initCatalystApp(req);
  await createDealPricingScheduleRepo(catalystApp).replaceSet(
    dealId,
    b.years.map((y) => ({
      yearNumber: y.year_number,
      productRevenue: Number(y.product_revenue),
      servicesRevenue: Number(y.services_revenue ?? 0),
      discountPct: Number(y.discount_pct ?? 0),
      notes: y.notes ?? null,
    })),
  );
  const schedule = await scheduleFor(catalystApp, dealId);
  const rampTCV = computeRampTCV(schedule, await fallbackPricing(catalystApp, dealId));
  res.json({ data: schedule, rampTCV });
});

router.get("/scenarios", async (req: Request, res: Response) => {
  const q = ListScenariosQueryParams.parse(req.query);
  const catalystApp = initCatalystApp(req);
  const rows = await createFinancialScenariosRepo(catalystApp).list(q.deal_id);
  res.json({
    data: rows.map((r) => ({
      id: r.id,
      scenarioName: r.scenarioName,
      description: r.description,
      dealId: r.dealId,
      isGlobal: r.isGlobal,
      modifications: r.modifications,
      computedResults: r.computedResults,
    })),
  });
});

router.post("/scenarios", async (req: Request, res: Response) => {
  const b = CreateScenarioBody.parse(req.body);
  const catalystApp = initCatalystApp(req);
  const actor = getActor(req);
  const row = await createFinancialScenariosRepo(catalystApp).create({
    scenarioName: b.scenario_name,
    description: b.description ?? null,
    dealId: b.deal_id ?? null,
    isGlobal: b.is_global ?? false,
    modifications: b.modifications,
    createdBy: actor.username,
  });
  res.status(201).json({
    data: {
      id: row.id,
      scenarioName: row.scenarioName,
      description: row.description,
      dealId: row.dealId,
      isGlobal: row.isGlobal,
      modifications: row.modifications,
      computedResults: row.computedResults,
    },
  });
});

router.delete("/scenarios/:id", async (req: Request, res: Response) => {
  const { id } = DeleteScenarioParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  await createFinancialScenariosRepo(catalystApp).delete(id);
  res.json({ message: "Scenario deleted" });
});

interface ScenarioMod {
  target?: string;
  value?: number | string;
}

router.post("/scenarios/compute", async (req: Request, res: Response) => {
  const b = ComputeScenarioBody.parse(req.body);
  const catalystApp = initCatalystApp(req);
  let productRevenue = 0;
  let servicesRevenue = 0;
  let term = 1;
  let pricingModel = "Annual";
  if (b.deal_id) {
    const fb = await fallbackPricing(catalystApp, b.deal_id);
    productRevenue = fb.productRevenue;
    servicesRevenue = fb.servicesRevenue;
    term = fb.contractTermYears;
    pricingModel = fb.pricingModel;
  }
  const currentTCV = computeRampTCV([], { productRevenue, servicesRevenue, contractTermYears: term, pricingModel });
  for (const mod of b.modifications as ScenarioMod[]) {
    if (mod.target === "product_revenue") productRevenue = Number(mod.value) || 0;
    if (mod.target === "services_revenue") servicesRevenue = Number(mod.value) || 0;
  }
  const scenarioTCV = computeRampTCV([], { productRevenue, servicesRevenue, contractTermYears: term, pricingModel });
  const delta = scenarioTCV - currentTCV;
  res.json({
    data: {
      currentTCV,
      scenarioTCV,
      delta,
      deltaPct: currentTCV ? Math.round((delta / currentTCV) * 1000) / 10 : 0,
    },
  });
});

/* --------------------------------------------------------- F10 Custom patterns */

async function patternWithConditions(catalystApp: CatalystApp, id: string) {
  const p = await createCustomRiskPatternsRepo(catalystApp).getById(id);
  if (!p) return null;
  const conditions = await createCustomPatternConditionsRepo(catalystApp).listByPatternId(id);
  return {
    id: p.id,
    patternName: p.patternName,
    description: p.description,
    severity: p.severity,
    weight: p.weight,
    alertMessageTemplate: p.alertMessageTemplate,
    isActive: p.isActive,
    triggerCount: p.triggerCount,
    conditions: conditions.map((c) => ({
      fieldPath: c.fieldPath,
      operator: c.operator,
      comparisonValue: c.comparisonValue,
      sortOrder: c.sortOrder,
    })),
  };
}

router.get("/custom-patterns", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const rows = await createCustomRiskPatternsRepo(catalystApp).listAll();
  const data = [];
  for (const r of rows) data.push(await patternWithConditions(catalystApp, r.id));
  res.json({ data: data.filter(Boolean) });
});

router.post("/custom-patterns", async (req: Request, res: Response) => {
  const parsed = CreateCustomPatternBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid custom pattern payload", parsed.error.issues);
  }
  const b = parsed.data;
  const catalystApp = initCatalystApp(req);
  const actor = getActor(req);
  const p = await createCustomRiskPatternsRepo(catalystApp).create({
    patternName: b.pattern_name,
    description: b.description ?? null,
    severity: b.severity,
    weight: b.weight,
    alertMessageTemplate: b.alert_message_template,
    isActive: b.is_active ?? true,
    createdBy: actor.username,
  });
  if (b.conditions.length) {
    await createCustomPatternConditionsRepo(catalystApp).replaceForPattern(
      p.id,
      b.conditions.map((c) => ({
        fieldPath: c.field_path,
        operator: c.operator,
        comparisonValue: c.comparison_value,
        sortOrder: c.sort_order,
      })),
    );
  }
  await logSettingsChange(req, {
    module: "custom_risk_patterns",
    settingKey: b.pattern_name,
    entityId: String(p.id),
    action: "create",
    oldValue: null,
    newValue: { patternName: b.pattern_name, severity: b.severity, weight: b.weight },
    actor: actor.username,
  });
  res.status(201).json({ data: await patternWithConditions(catalystApp, p.id) });
});

router.put("/custom-patterns/:id", async (req: Request, res: Response) => {
  const { id } = UpdateCustomPatternParams.parse(req.params);
  const parsed = UpdateCustomPatternBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid custom pattern payload", parsed.error.issues);
  }
  const b = parsed.data;
  const catalystApp = initCatalystApp(req);
  const actor = getActor(req);
  const prior = await createCustomRiskPatternsRepo(catalystApp).getById(id);
  const p = await createCustomRiskPatternsRepo(catalystApp).update(id, {
    patternName: b.pattern_name,
    description: b.description ?? null,
    severity: b.severity,
    weight: b.weight,
    alertMessageTemplate: b.alert_message_template,
    isActive: b.is_active ?? undefined,
  });
  if (!p) throw notFound("Pattern not found");
  await createCustomPatternConditionsRepo(catalystApp).replaceForPattern(
    id,
    b.conditions.map((c) => ({
      fieldPath: c.field_path,
      operator: c.operator,
      comparisonValue: c.comparison_value,
      sortOrder: c.sort_order,
    })),
  );
  await logSettingsChange(req, {
    module: "custom_risk_patterns",
    settingKey: b.pattern_name,
    entityId: String(id),
    action: "update",
    oldValue: prior ? { patternName: prior.patternName, severity: prior.severity, weight: prior.weight } : null,
    newValue: { patternName: b.pattern_name, severity: b.severity, weight: b.weight },
    actor: actor.username,
  });
  res.json({ data: await patternWithConditions(catalystApp, id) });
});

router.delete("/custom-patterns/:id", async (req: Request, res: Response) => {
  const { id } = DeleteCustomPatternParams.parse(req.params);
  const catalystApp = initCatalystApp(req);
  const actor = getActor(req);
  const prior = await createCustomRiskPatternsRepo(catalystApp).getById(id);
  // Mirrors the original schema's custom_pattern_conditions.patternId
  // onDelete:"cascade" — explicit ordered delete, children before parent.
  await createCustomPatternConditionsRepo(catalystApp).replaceForPattern(id, []);
  await createCustomRiskPatternsRepo(catalystApp).delete(id);
  if (prior) {
    await logSettingsChange(req, {
      module: "custom_risk_patterns",
      settingKey: prior.patternName,
      entityId: String(id),
      action: "delete",
      oldValue: { patternName: prior.patternName, severity: prior.severity, weight: prior.weight },
      newValue: null,
      actor: actor.username,
    });
  }
  res.json({ message: "Pattern deleted" });
});

// Build a normalized intelligence-shaped object per LIVE deal (excludes
// soft-deleted and archived) for pattern eval. This is a live-preview
// surface — "if I saved this pattern right now, which of my current deals
// would it fire on" — so it deliberately does NOT include archived deals,
// unlike the historical analytics endpoints in routes/v2/analytics.ts.
async function normalizedDeals(catalystApp: CatalystApp) {
  const [allDeals, stages, pricingModels, severities] = await Promise.all([
    createEnterpriseDealsRepo(catalystApp).list(),
    createPipelineStagesRepo(catalystApp).listAll(),
    createPricingModelsRepo(catalystApp).listAll(),
    createBlockerSeveritiesRepo(catalystApp).listAll(),
  ]);
  const stageNameById = new Map(stages.map((s) => [s.id, s.stageName]));
  const pricingModelNameById = new Map(pricingModels.map((p) => [p.id, p.modelName]));
  const severityNameById = new Map(severities.map((s) => [s.id, s.severityName]));
  const deals = allDeals.filter((d) => d.deletedAt == null && d.archivedAt == null);

  const out = [];
  for (const d of deals) {
    const gates = await createDealTechnicalGatesRepo(catalystApp).list(d.id);
    const progress = gates.length
      ? Math.round((gates.filter((g) => g.isCompleted).length / gates.length) * 100)
      : 0;
    const blockers = await createDealBlockersRepo(catalystApp).list(d.id);
    const activeSeverityNames = blockers
      .filter((b) => !b.isResolved)
      .map((b) => severityNameById.get(b.severityId) ?? "");
    out.push({
      dealId: d.id,
      dealName: d.dealName,
      accountName: d.accountName,
      salesStage: stageNameById.get(d.salesStageId),
      daysInStage: Math.max(0, Math.round((Date.now() - d.stageEnteredAt.getTime()) / 86_400_000)),
      financials: {
        calculatedTCV: calculateFlatTCV({
          productRevenue: Number(d.productRevenue) || 0,
          servicesRevenue: Number(d.servicesRevenue) || 0,
          contractTermYears: d.contractTermYears,
          pricingModel: pricingModelNameById.get(d.pricingModelId) ?? "",
        }),
        productRevenue: Number(d.productRevenue) || 0,
        servicesRevenue: Number(d.servicesRevenue) || 0,
      },
      technicalTrack: { progressPercentage: progress },
      governance: {
        activeBlockerCount: activeSeverityNames.length,
        highSeverityBlockerCount: activeSeverityNames.filter((s) => /high|critical/i.test(s)).length,
      },
    });
  }
  return out;
}

router.post("/custom-patterns/test", async (req: Request, res: Response) => {
  const b = TestCustomPatternBody.parse(req.body);
  const catalystApp = initCatalystApp(req);
  const pattern: CustomPattern = {
    id: "draft",
    patternName: b.pattern_name,
    severity: b.severity as "RED" | "YELLOW",
    weight: b.weight,
    alertMessageTemplate: b.alert_message_template,
    conditions: b.conditions.map((c) => ({
      fieldPath: c.field_path,
      operator: c.operator as CustomPattern["conditions"][number]["operator"],
      comparisonValue: c.comparison_value,
      sortOrder: c.sort_order,
    })),
  };
  const deals = await normalizedDeals(catalystApp);
  const matches = deals
    .filter((d) => evaluateCustomPatterns([pattern], d).length > 0)
    .map((d) => ({ dealId: d.dealId, dealName: d.dealName, accountName: d.accountName }));
  res.json({ data: { matchCount: matches.length, matches } });
});

/* ------------------------------------------------- Pipeline Targets (config) */

// GET /v2/config/targets — list all period targets, newest first.
router.get("/config/targets", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const rows = await createPipelineTargetsRepo(catalystApp).listAll(); // already desc(periodStart)
  res.json({
    data: rows.map((r) => ({
      id: r.id,
      periodType: r.periodType,
      periodStart: r.periodStart,
      targetValue: r.targetValue,
    })),
  });
});

// PUT /v2/config/targets — upsert a period target (conflict on periodType + periodStart).
router.put("/config/targets", async (req: Request, res: Response) => {
  const parsed = UpsertPipelineTargetBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid pipeline target payload", parsed.error.issues);
  }
  const body = parsed.data;
  const catalystApp = initCatalystApp(req);
  const actor = getActor(req);
  // body.periodStart is a Date (coerced by Zod's coerce.date() + useDates:true).
  // The Data Store column is a `date` — needs YYYY-MM-DD.
  const periodStartStr = body.periodStart instanceof Date
    ? body.periodStart.toISOString().slice(0, 10)
    : String(body.periodStart);
  const periodType = body.periodType ?? "quarter";
  const { row, prior } = await createPipelineTargetsRepo(catalystApp).upsert(
    periodType,
    periodStartStr,
    body.targetValue,
  );
  await logSettingsChange(req, {
    module: "pipeline_targets",
    settingKey: `${periodType}:${periodStartStr}`,
    entityId: String(row.id),
    action: prior ? "update" : "create",
    oldValue: prior ? prior.targetValue : null,
    newValue: body.targetValue,
    dataType: "number",
    actor: actor.username,
  });
  res.json({
    data: {
      id: row.id,
      periodType: row.periodType,
      periodStart: row.periodStart,
      targetValue: row.targetValue,
    },
  });
});

/* --------------------------------------- Predictive-score weights (config) */

// GET /v2/config/scoring-weights — latest calibrated weight per factor (fractions
// of 1.0). The predictive score's playbook_adherence and 8 other factors.
router.get("/config/scoring-weights", async (req: Request, res: Response) => {
  const catalystApp = initCatalystApp(req);
  const rows = await createScoringModelWeightsRepo(catalystApp).listAll(); // newest first
  const latest = new Map<string, number>();
  for (const r of rows) {
    if (!latest.has(r.featureId)) latest.set(r.featureId, r.calibratedWeight);
  }
  res.json({
    data: [...latest.entries()].map(([featureId, weight]) => ({ featureId, weight })),
  });
});

// PUT /v2/config/scoring-weights — append a new calibration row per supplied
// factor (append-only history; latest wins). Weights are fractions of 1.0.
router.put("/config/scoring-weights", async (req: Request, res: Response) => {
  const parsed = UpdateScoringWeightsBody.safeParse(req.body);
  if (!parsed.success) {
    throw badRequest("Invalid scoring weights payload", parsed.error.issues);
  }
  const body = parsed.data;
  const catalystApp = initCatalystApp(req);
  const actor = getActor(req);
  const today = new Date().toISOString().slice(0, 10);
  // Latest calibrated weight per featureId, so each audit entry can record the
  // real prior value instead of a hardcoded null — same "latest row per
  // featureId" dedup GET /config/scoring-weights above already does. A
  // featureId with no prior row (e.g. a brand-new custom factor) legitimately
  // has no previous weight, so it stays null.
  const priorRows = await createScoringModelWeightsRepo(catalystApp).listAll();
  const priorByFeature = new Map<string, number>();
  for (const r of priorRows) {
    if (!priorByFeature.has(r.featureId)) priorByFeature.set(r.featureId, r.calibratedWeight);
  }
  for (const w of body.weights) {
    await createScoringModelWeightsRepo(catalystApp).append(w.feature_id, w.weight, today);
    await logSettingsChange(req, {
      module: "scoring_model_weights",
      settingKey: w.feature_id,
      entityId: w.feature_id,
      action: "update",
      oldValue: priorByFeature.get(w.feature_id) ?? null,
      newValue: w.weight,
      dataType: "number",
      actor: actor.username,
    });
  }
  // Drop the cached merged weights so the next score picks up the new values.
  cache.invalidatePrefix(CacheKeys.lookupPrefix);
  // Re-score every active deal now, inline, so the new weights take effect
  // immediately instead of waiting for each deal's next natural score event.
  const rescored = await rescoreActiveDeals(catalystApp);
  res.json({ data: { updated: body.weights.length, rescored } });
});

export default router;
