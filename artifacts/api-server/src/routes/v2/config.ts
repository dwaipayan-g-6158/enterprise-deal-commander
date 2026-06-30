import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, gt } from "drizzle-orm";
import {
  db,
  enterpriseDeals,
  pipelineStages,
  pricingModels,
  dealTechnicalGates,
  dealBlockers,
  blockerSeverities,
  playbooks,
  playbookSteps,
  dealPlaybookAssignments,
  playbookStepCompletions,
  dealPricingSchedule,
  financialScenarios,
  customRiskPatterns,
  customPatternConditions,
} from "@workspace/db";
import {
  computeRampTCV,
  evaluateCustomPatterns,
  type CustomPattern,
  type PricingYear,
} from "@workspace/engine";
import {
  CreatePlaybookBody,
  UpdatePlaybookParams,
  UpdatePlaybookBody,
  DeletePlaybookParams,
  GetDealPlaybookParams,
  CompletePlaybookStepParams,
  CompletePlaybookStepBody,
  SkipPlaybookStepParams,
  SkipPlaybookStepBody,
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
} from "@workspace/api-zod";
import { getActor } from "../../lib/auth";
import { notFound } from "../../lib/http";

const router: IRouter = Router();

/* --------------------------------------------------------------- F11 Playbooks */

async function playbookWithSteps(id: string) {
  const [pb] = await db.select().from(playbooks).where(eq(playbooks.id, id)).limit(1);
  if (!pb) return null;
  const steps = await db
    .select()
    .from(playbookSteps)
    .where(eq(playbookSteps.playbookId, id))
    .orderBy(asc(playbookSteps.stepOrder));
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

router.get("/playbooks", async (_req: Request, res: Response) => {
  const rows = await db.select({ id: playbooks.id }).from(playbooks).orderBy(asc(playbooks.playbookName));
  const data = [];
  for (const r of rows) data.push(await playbookWithSteps(r.id));
  res.json({ data: data.filter(Boolean) });
});

router.post("/playbooks", async (req: Request, res: Response) => {
  const b = CreatePlaybookBody.parse(req.body);
  const actor = getActor(req);
  const [pb] = await db
    .insert(playbooks)
    .values({
      playbookName: b.playbook_name,
      description: b.description ?? null,
      applicableStage: b.applicable_stage ?? null,
      isActive: b.is_active ?? true,
      createdBy: actor.username,
    })
    .returning();
  if (b.steps?.length) {
    await db.insert(playbookSteps).values(
      b.steps.map((s) => ({
        playbookId: pb.id,
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
  res.status(201).json({ data: await playbookWithSteps(pb.id) });
});

router.put("/playbooks/:id", async (req: Request, res: Response) => {
  const { id } = UpdatePlaybookParams.parse(req.params);
  const b = UpdatePlaybookBody.parse(req.body);
  const [pb] = await db
    .update(playbooks)
    .set({
      playbookName: b.playbook_name,
      description: b.description ?? null,
      applicableStage: b.applicable_stage ?? null,
      isActive: b.is_active ?? undefined,
    })
    .where(eq(playbooks.id, id))
    .returning();
  if (!pb) throw notFound("Playbook not found");
  if (b.steps) {
    await db.delete(playbookSteps).where(eq(playbookSteps.playbookId, id));
    if (b.steps.length) {
      await db.insert(playbookSteps).values(
        b.steps.map((s) => ({
          playbookId: id,
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
  }
  res.json({ data: await playbookWithSteps(id) });
});

router.delete("/playbooks/:id", async (req: Request, res: Response) => {
  const { id } = DeletePlaybookParams.parse(req.params);
  await db.delete(playbooks).where(eq(playbooks.id, id));
  res.json({ message: "Playbook deleted" });
});

// Auto-assign-if-missing: when a deal sitting in a stage has no active
// assignment but its current stage has a configured playbook, create the
// assignment (currentStepId = first step) and return it. Mirrors the on-stage-
// change auto-assign in subscribers/playbook-engine.ts so deals that were
// already in a stage before playbooks existed still pick one up. Returns the
// new assignment row, or null when no playbook targets the stage.
async function autoAssignPlaybookIfMissing(dealId: string) {
  const [deal] = await db
    .select({ stageName: pipelineStages.stageName })
    .from(enterpriseDeals)
    .innerJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id))
    .where(eq(enterpriseDeals.id, dealId))
    .limit(1);
  if (!deal?.stageName) return null;

  const [playbook] = await db
    .select()
    .from(playbooks)
    .where(
      and(eq(playbooks.applicableStage, deal.stageName), eq(playbooks.isActive, true)),
    )
    .limit(1);
  if (!playbook) return null;

  const [firstStep] = await db
    .select({ id: playbookSteps.id })
    .from(playbookSteps)
    .where(eq(playbookSteps.playbookId, playbook.id))
    .orderBy(asc(playbookSteps.stepOrder))
    .limit(1);

  const [created] = await db
    .insert(dealPlaybookAssignments)
    .values({
      dealId,
      playbookId: playbook.id,
      currentStepId: firstStep?.id ?? null,
    })
    .returning();
  return created;
}

router.get("/deals/:dealId/playbook", async (req: Request, res: Response) => {
  const { dealId } = GetDealPlaybookParams.parse(req.params);
  let [assignment] = await db
    .select()
    .from(dealPlaybookAssignments)
    .where(
      and(eq(dealPlaybookAssignments.dealId, dealId), eq(dealPlaybookAssignments.status, "Active")),
    )
    .limit(1);
  if (!assignment) {
    const created = await autoAssignPlaybookIfMissing(dealId);
    if (!created) {
      res.json({ data: null });
      return;
    }
    assignment = created;
  }
  const playbook = await playbookWithSteps(assignment.playbookId);
  const completions = await db
    .select()
    .from(playbookStepCompletions)
    .where(eq(playbookStepCompletions.assignmentId, assignment.id));
  res.json({
    data: {
      assignmentId: assignment.id,
      status: assignment.status,
      currentStepId: assignment.currentStepId,
      playbook,
      completedStepIds: completions.map((c) => c.stepId),
    },
  });
});

async function advanceStep(assignmentId: string, stepId: string) {
  const [assignment] = await db
    .select()
    .from(dealPlaybookAssignments)
    .where(eq(dealPlaybookAssignments.id, assignmentId))
    .limit(1);
  if (!assignment) return;
  const [current] = await db
    .select()
    .from(playbookSteps)
    .where(eq(playbookSteps.id, stepId))
    .limit(1);
  if (!current) return;
  const [next] = await db
    .select()
    .from(playbookSteps)
    .where(
      and(
        eq(playbookSteps.playbookId, assignment.playbookId),
        gt(playbookSteps.stepOrder, current.stepOrder),
      ),
    )
    .orderBy(asc(playbookSteps.stepOrder))
    .limit(1);
  if (next) {
    await db
      .update(dealPlaybookAssignments)
      .set({ currentStepId: next.id })
      .where(eq(dealPlaybookAssignments.id, assignmentId));
  } else {
    await db
      .update(dealPlaybookAssignments)
      .set({ status: "Completed", completedAt: new Date(), currentStepId: null })
      .where(eq(dealPlaybookAssignments.id, assignmentId));
  }
}

router.post(
  "/playbook-assignments/:assignmentId/steps/:stepId/complete",
  async (req: Request, res: Response) => {
    const { assignmentId, stepId } = CompletePlaybookStepParams.parse(req.params);
    const b = CompletePlaybookStepBody.parse(req.body ?? {});
    await db.insert(playbookStepCompletions).values({
      assignmentId,
      stepId,
      notes: b.notes ?? null,
      skipped: false,
    });
    await advanceStep(assignmentId, stepId);
    res.json({ data: { completed: true } });
  },
);

router.post(
  "/playbook-assignments/:assignmentId/steps/:stepId/skip",
  async (req: Request, res: Response) => {
    const { assignmentId, stepId } = SkipPlaybookStepParams.parse(req.params);
    const b = SkipPlaybookStepBody.parse(req.body ?? {});
    await db.insert(playbookStepCompletions).values({
      assignmentId,
      stepId,
      skipped: true,
      skipReason: b.skip_reason ?? null,
    });
    await advanceStep(assignmentId, stepId);
    res.json({ data: { skipped: true } });
  },
);

/* --------------------------------------------------- F13 Pricing schedule + scenarios */

async function fallbackPricing(dealId: string) {
  const [d] = await db
    .select({
      productRevenue: enterpriseDeals.productRevenue,
      servicesRevenue: enterpriseDeals.servicesRevenue,
      contractTermYears: enterpriseDeals.contractTermYears,
      pricingModel: pricingModels.modelName,
    })
    .from(enterpriseDeals)
    .leftJoin(pricingModels, eq(enterpriseDeals.pricingModelId, pricingModels.id))
    .where(eq(enterpriseDeals.id, dealId))
    .limit(1);
  return {
    productRevenue: Number(d?.productRevenue) || 0,
    servicesRevenue: Number(d?.servicesRevenue) || 0,
    contractTermYears: d?.contractTermYears ?? 1,
    pricingModel: d?.pricingModel ?? "Annual",
  };
}

async function scheduleFor(dealId: string): Promise<PricingYear[]> {
  const rows = await db
    .select()
    .from(dealPricingSchedule)
    .where(eq(dealPricingSchedule.dealId, dealId))
    .orderBy(asc(dealPricingSchedule.yearNumber));
  return rows.map((r) => ({
    yearNumber: r.yearNumber,
    productRevenue: Number(r.productRevenue) || 0,
    servicesRevenue: Number(r.servicesRevenue) || 0,
    discountPct: Number(r.discountPct) || 0,
  }));
}

router.get("/deals/:dealId/pricing-schedule", async (req: Request, res: Response) => {
  const { dealId } = GetPricingScheduleParams.parse(req.params);
  const schedule = await scheduleFor(dealId);
  const rampTCV = computeRampTCV(schedule, await fallbackPricing(dealId));
  res.json({ data: schedule, rampTCV });
});

router.put("/deals/:dealId/pricing-schedule", async (req: Request, res: Response) => {
  const { dealId } = UpdatePricingScheduleParams.parse(req.params);
  const b = UpdatePricingScheduleBody.parse(req.body);
  await db.delete(dealPricingSchedule).where(eq(dealPricingSchedule.dealId, dealId));
  if (b.years.length) {
    await db.insert(dealPricingSchedule).values(
      b.years.map((y) => ({
        dealId,
        yearNumber: y.year_number,
        productRevenue: String(y.product_revenue),
        servicesRevenue: String(y.services_revenue ?? 0),
        discountPct: String(y.discount_pct ?? 0),
        notes: y.notes ?? null,
      })),
    );
  }
  const schedule = await scheduleFor(dealId);
  const rampTCV = computeRampTCV(schedule, await fallbackPricing(dealId));
  res.json({ data: schedule, rampTCV });
});

router.get("/scenarios", async (req: Request, res: Response) => {
  const q = ListScenariosQueryParams.parse(req.query);
  const rows = await db
    .select()
    .from(financialScenarios)
    .where(q.deal_id ? eq(financialScenarios.dealId, q.deal_id) : undefined as never);
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
  const actor = getActor(req);
  const [row] = await db
    .insert(financialScenarios)
    .values({
      scenarioName: b.scenario_name,
      description: b.description ?? null,
      dealId: b.deal_id ?? null,
      isGlobal: b.is_global ?? false,
      modifications: b.modifications,
      createdBy: actor.username,
    })
    .returning();
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
  await db.delete(financialScenarios).where(eq(financialScenarios.id, id));
  res.json({ message: "Scenario deleted" });
});

interface ScenarioMod {
  target?: string;
  value?: number | string;
}

router.post("/scenarios/compute", async (req: Request, res: Response) => {
  const b = ComputeScenarioBody.parse(req.body);
  let productRevenue = 0;
  let servicesRevenue = 0;
  let term = 1;
  let pricingModel = "Annual";
  if (b.deal_id) {
    const fb = await fallbackPricing(b.deal_id);
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

async function patternWithConditions(id: string) {
  const [p] = await db.select().from(customRiskPatterns).where(eq(customRiskPatterns.id, id)).limit(1);
  if (!p) return null;
  const conditions = await db
    .select()
    .from(customPatternConditions)
    .where(eq(customPatternConditions.patternId, id))
    .orderBy(asc(customPatternConditions.sortOrder));
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

router.get("/custom-patterns", async (_req: Request, res: Response) => {
  const rows = await db.select({ id: customRiskPatterns.id }).from(customRiskPatterns);
  const data = [];
  for (const r of rows) data.push(await patternWithConditions(r.id));
  res.json({ data: data.filter(Boolean) });
});

router.post("/custom-patterns", async (req: Request, res: Response) => {
  const b = CreateCustomPatternBody.parse(req.body);
  const actor = getActor(req);
  const [p] = await db
    .insert(customRiskPatterns)
    .values({
      patternName: b.pattern_name,
      description: b.description ?? null,
      severity: b.severity,
      weight: b.weight,
      alertMessageTemplate: b.alert_message_template,
      isActive: b.is_active ?? true,
      createdBy: actor.username,
    })
    .returning();
  if (b.conditions.length) {
    await db.insert(customPatternConditions).values(
      b.conditions.map((c) => ({
        patternId: p.id,
        fieldPath: c.field_path,
        operator: c.operator,
        comparisonValue: c.comparison_value,
        sortOrder: c.sort_order,
      })),
    );
  }
  res.status(201).json({ data: await patternWithConditions(p.id) });
});

router.put("/custom-patterns/:id", async (req: Request, res: Response) => {
  const { id } = UpdateCustomPatternParams.parse(req.params);
  const b = UpdateCustomPatternBody.parse(req.body);
  const [p] = await db
    .update(customRiskPatterns)
    .set({
      patternName: b.pattern_name,
      description: b.description ?? null,
      severity: b.severity,
      weight: b.weight,
      alertMessageTemplate: b.alert_message_template,
      isActive: b.is_active ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(customRiskPatterns.id, id))
    .returning();
  if (!p) throw notFound("Pattern not found");
  await db.delete(customPatternConditions).where(eq(customPatternConditions.patternId, id));
  if (b.conditions.length) {
    await db.insert(customPatternConditions).values(
      b.conditions.map((c) => ({
        patternId: id,
        fieldPath: c.field_path,
        operator: c.operator,
        comparisonValue: c.comparison_value,
        sortOrder: c.sort_order,
      })),
    );
  }
  res.json({ data: await patternWithConditions(id) });
});

router.delete("/custom-patterns/:id", async (req: Request, res: Response) => {
  const { id } = DeleteCustomPatternParams.parse(req.params);
  await db.delete(customRiskPatterns).where(eq(customRiskPatterns.id, id));
  res.json({ message: "Pattern deleted" });
});

// Build a normalized intelligence-shaped object per active deal for pattern eval.
async function normalizedDeals() {
  const deals = await db
    .select({
      id: enterpriseDeals.id,
      dealName: enterpriseDeals.dealName,
      accountName: enterpriseDeals.accountName,
      productRevenue: enterpriseDeals.productRevenue,
      servicesRevenue: enterpriseDeals.servicesRevenue,
      stageEnteredAt: enterpriseDeals.stageEnteredAt,
      stageName: pipelineStages.stageName,
    })
    .from(enterpriseDeals)
    .leftJoin(pipelineStages, eq(enterpriseDeals.salesStageId, pipelineStages.id));
  const out = [];
  for (const d of deals) {
    const gates = await db
      .select({ isCompleted: dealTechnicalGates.isCompleted })
      .from(dealTechnicalGates)
      .where(eq(dealTechnicalGates.dealId, d.id));
    const progress = gates.length
      ? Math.round((gates.filter((g) => g.isCompleted).length / gates.length) * 100)
      : 0;
    const blockers = await db
      .select({ severity: blockerSeverities.severityName })
      .from(dealBlockers)
      .leftJoin(blockerSeverities, eq(dealBlockers.severityId, blockerSeverities.id))
      .where(and(eq(dealBlockers.dealId, d.id), eq(dealBlockers.isResolved, false)));
    out.push({
      dealId: d.id,
      dealName: d.dealName,
      accountName: d.accountName,
      salesStage: d.stageName,
      daysInStage: Math.max(0, Math.round((Date.now() - new Date(d.stageEnteredAt).getTime()) / 86_400_000)),
      financials: {
        calculatedTCV: (Number(d.productRevenue) || 0) + (Number(d.servicesRevenue) || 0),
        productRevenue: Number(d.productRevenue) || 0,
        servicesRevenue: Number(d.servicesRevenue) || 0,
      },
      technicalTrack: { progressPercentage: progress },
      governance: {
        activeBlockerCount: blockers.length,
        highSeverityBlockerCount: blockers.filter((b) => /high|critical/i.test(b.severity ?? "")).length,
      },
    });
  }
  return out;
}

router.post("/custom-patterns/test", async (req: Request, res: Response) => {
  const b = TestCustomPatternBody.parse(req.body);
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
  const deals = await normalizedDeals();
  const matches = deals
    .filter((d) => evaluateCustomPatterns([pattern], d).length > 0)
    .map((d) => ({ dealId: d.dealId, dealName: d.dealName, accountName: d.accountName }));
  res.json({ data: { matchCount: matches.length, matches } });
});

export default router;
