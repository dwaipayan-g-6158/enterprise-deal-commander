import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import {
  db,
  commanders,
  pipelineStages,
  pricingModels,
  servicesTiers,
  productCatalog,
  ad360Features,
  blockerCategories,
  blockerSeverities,
  lossArchetypes,
  gateDefinitions,
  interventionChecklists,
  engineThresholds,
  fxRates,
  scoringModelWeights,
  segments,
  dealTypes,
  automationRuleTemplates,
  enterpriseDeals,
  dealTechnicalGates,
  dealCrossSells,
  dealProductInterests,
  dealComplianceDrivers,
  dealBlockers,
  competitors,
  complianceDrivers,
  competitorBattlecards,
  tagDefinitions,
  teamMembers,
  playbooks,
  playbookSteps,
  dealMemory,
  dealCompetitors,
  meddpiccQuestions,
  dealMeddpiccAnswers,
  dealMeddpiccScores,
} from "@workspace/db";
import { logger } from "./lib/logger";
import { rescoreActiveDeals } from "./lib/scoring";
import { QUESTION_CATALOG } from "@workspace/engine";
// All seed DATA lives in ./seed-data — a database-agnostic module with no
// Drizzle/bcrypt/network imports, so the Catalyst-backed seed can consume the
// exact same literals. Everything below is the Postgres-specific *behavior*:
// presence guards, id resolution, relative-date conversion, insert order.
import {
  PIPELINE_STAGES,
  PRICING_MODELS,
  SERVICES_TIERS,
  TEAM_MEMBERS,
  TAG_DEFINITIONS,
  PRODUCT_CATALOG,
  AD360_FEATURES,
  COMPETITORS,
  COMPLIANCE_DRIVERS,
  BLOCKER_CATEGORIES,
  BLOCKER_SEVERITIES,
  LOSS_ARCHETYPES,
  GATE_DEFINITIONS,
  ALL_GATE_CODES,
  INTERVENTION_CHECKLISTS,
  COMPETITOR_BATTLECARDS,
  ENGINE_THRESHOLDS,
  FX_RATES,
  SCORING_MODEL_WEIGHTS,
  SEGMENTS,
  DEAL_TYPES,
  AUTOMATION_RULE_TEMPLATES,
  PLAYBOOK_SEEDS,
  DEAL_SEEDS,
} from "./seed-data";

async function seedLookups() {
  await db.insert(pipelineStages).values(PIPELINE_STAGES).onConflictDoNothing();

  await db.insert(pricingModels).values(PRICING_MODELS).onConflictDoNothing();
  // B1: "Hybrid" retired — deactivate any pre-existing row so listPricingModels
  // (which filters isActive = true) hides it.
  await db
    .update(pricingModels)
    .set({ isActive: false })
    .where(eq(pricingModels.modelName, "Hybrid"));

  await db.insert(servicesTiers).values(SERVICES_TIERS).onConflictDoNothing();
  // B3: "Managed Services Contract" retired — deactivate any pre-existing row so
  // listServicesTiers (which filters isActive = true) hides it.
  await db
    .update(servicesTiers)
    .set({ isActive: false })
    .where(eq(servicesTiers.tierName, "Managed Services Contract"));

  await db.insert(teamMembers).values(TEAM_MEMBERS).onConflictDoNothing();

  await db.insert(tagDefinitions).values(TAG_DEFINITIONS).onConflictDoNothing();

  await db.insert(productCatalog).values(PRODUCT_CATALOG).onConflictDoNothing();

  await db.insert(ad360Features).values(AD360_FEATURES).onConflictDoNothing();

  await db.insert(competitors).values(COMPETITORS).onConflictDoNothing();

  await db.insert(complianceDrivers).values(COMPLIANCE_DRIVERS).onConflictDoNothing();

  await db.insert(blockerCategories).values(BLOCKER_CATEGORIES).onConflictDoNothing();

  await db.insert(blockerSeverities).values(BLOCKER_SEVERITIES).onConflictDoNothing();

  await db.insert(lossArchetypes).values(LOSS_ARCHETYPES).onConflictDoNothing();

  await db.insert(gateDefinitions).values(GATE_DEFINITIONS).onConflictDoNothing();

  await db.insert(interventionChecklists).values(INTERVENTION_CHECKLISTS).onConflictDoNothing();

  // Competitor battlecards (talking points surfaced in the Next-Best-Action panel).
  const competitorRows = await db.select().from(competitors);
  const competitorIdByName = (name: string) =>
    competitorRows.find((c) => c.name === name)?.id;
  const battlecardValues = COMPETITOR_BATTLECARDS
    .map((b) => {
      const competitorId = competitorIdByName(b.competitorName);
      return competitorId
        ? { competitorId, talkingPoints: b.talkingPoints }
        : null;
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
  if (battlecardValues.length > 0) {
    await db.insert(competitorBattlecards).values(battlecardValues).onConflictDoNothing();
  }

  await db.insert(engineThresholds).values(ENGINE_THRESHOLDS).onConflictDoNothing();

  const today = new Date().toISOString().slice(0, 10);
  await db
    .insert(fxRates)
    .values(FX_RATES.map((r) => ({ ...r, asOf: today })))
    .onConflictDoNothing();

  // Predictive scoring model calibrated weights (Settings redesign)
  // Task 6 will read these and scale by 100 to preserve the 0-100 scoring convention.
  // Guarded by a presence check (scoring model weights have no unique constraint on featureId,
  // so onConflictDoNothing cannot dedupe by featureId).
  const existingScoringWeights = await db.select({ id: scoringModelWeights.id }).from(scoringModelWeights).limit(1);
  if (existingScoringWeights.length === 0) {
    await db
      .insert(scoringModelWeights)
      .values(
        SCORING_MODEL_WEIGHTS.map((w) => ({
          featureId: w.featureId,
          calibratedWeight: w.calibratedWeight,
          sampleSize: 0,
          calibrationDate: today,
        })),
      )
      .onConflictDoNothing();
  } else {
    logger.info("Scoring model weights already present — skipping seed");
  }

  // Sample segments and deal types (Settings redesign)
  await db.insert(segments).values(SEGMENTS).onConflictDoNothing();

  await db.insert(dealTypes).values(DEAL_TYPES).onConflictDoNothing();

  // Built-in automation rule template (Settings redesign)
  // Guarded by a presence check (automation rule templates have no unique constraint on name,
  // so onConflictDoNothing cannot dedupe by name).
  const existingTemplates = await db.select({ id: automationRuleTemplates.id }).from(automationRuleTemplates).limit(1);
  if (existingTemplates.length === 0) {
    await db
      .insert(automationRuleTemplates)
      .values(AUTOMATION_RULE_TEMPLATES)
      .onConflictDoNothing();
  } else {
    logger.info("Automation rule templates already present — skipping seed");
  }
}

// C4: stage-keyed playbooks with ordered steps. Guarded by a presence check
// (playbooks have no unique name column, so onConflictDoNothing cannot dedupe
// by name).
async function seedPlaybooks() {
  const existing = await db.select({ id: playbooks.id }).from(playbooks).limit(1);
  if (existing.length > 0) {
    logger.info("Playbooks already present — skipping playbook seed");
    return;
  }

  for (const pb of PLAYBOOK_SEEDS) {
    const [inserted] = await db
      .insert(playbooks)
      .values({
        playbookName: pb.playbookName,
        description: pb.description,
        applicableStage: pb.applicableStage,
        createdBy: "seed",
      })
      .returning({ id: playbooks.id });
    await db.insert(playbookSteps).values(
      pb.steps.map((s) => ({ playbookId: inserted.id, ...s })),
    );
  }
  logger.info({ count: PLAYBOOK_SEEDS.length }, "Seeded stage-keyed playbooks");
}

async function seedMeddpiccQuestions() {
  const existing = await db
    .select({ questionOrder: meddpiccQuestions.questionOrder })
    .from(meddpiccQuestions);
  const existingOrders = new Set(existing.map((r) => r.questionOrder));
  const catalogOrders = new Set(QUESTION_CATALOG.map((q) => q.questionOrder));
  const matches =
    existing.length === QUESTION_CATALOG.length &&
    [...catalogOrders].every((o) => existingOrders.has(o));

  if (matches) {
    logger.info("MEDDPICC questions already present and match the current catalog — skipping MEDDPICC seed");
    return;
  }

  if (existing.length > 0) {
    logger.warn(
      "MEDDPICC question catalog has changed — resetting deal_meddpicc_answers, deal_meddpicc_scores, and meddpicc_questions",
    );
    await db.delete(dealMeddpiccAnswers);
    await db.delete(dealMeddpiccScores);
    await db.delete(meddpiccQuestions);
  }

  await db.insert(meddpiccQuestions).values(
    QUESTION_CATALOG.map((q) => ({
      questionOrder: q.questionOrder,
      pillar: q.pillar,
      stageTag: q.stageTag,
      questionText: q.questionText,
      helpText: q.helpText ?? null,
    })),
  );
  logger.info(`Seeded ${QUESTION_CATALOG.length} MEDDPICC questions`);
}

async function seedCommander() {
  const username = process.env.COMMANDER_USERNAME ?? "commander";
  const password = process.env.COMMANDER_PASSWORD ?? "DealCommander!2026";
  const passwordHash = await bcrypt.hash(password, 10);
  // role must be explicit: the column default is 'reader' (fail-closed for
  // anything created outside the users API), so a fresh DB seeded without
  // this would have zero admins and no way in. onConflictDoNothing means
  // re-seeding an existing row won't repair its role — that's what the
  // migration's one-time promotion step is for.
  await db
    .insert(commanders)
    .values({
      username,
      displayName: "Deal Commander",
      passwordHash,
      role: "admin",
      isActive: true,
    })
    .onConflictDoNothing();
  logger.info({ username }, "Default commander ensured");
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function dateInDays(n: number): string {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function seedDeals() {
  const existing = await db.select({ id: enterpriseDeals.id }).from(enterpriseDeals).limit(1);
  if (existing.length > 0) {
    logger.info("Deals already present — skipping deal seed");
    return;
  }

  const stages = await db.select().from(pipelineStages);
  const pricing = await db.select().from(pricingModels);
  const tiers = await db.select().from(servicesTiers);
  const products = await db.select().from(productCatalog);
  const cats = await db.select().from(blockerCategories);
  const sevs = await db.select().from(blockerSeverities);
  const archetypes = await db.select().from(lossArchetypes);
  const comps = await db.select().from(competitors);
  const drivers = await db.select().from(complianceDrivers);

  const stageId = (name: string) => stages.find((s) => s.stageName === name)!.id;
  const pricingId = (name: string) => pricing.find((p) => p.modelName === name)!.id;
  const tierId = (name: string) => tiers.find((t) => t.tierName === name)!.id;
  const productId = (code: string) => products.find((p) => p.code === code)!.id;
  const catId = (name: string) => cats.find((c) => c.categoryName === name)!.id;
  const sevId = (name: string) => sevs.find((s) => s.severityName === name)!.id;
  const archetypeId = (name: string) => archetypes.find((a) => a.archetypeName === name)!.id;
  const competitorId = (name: string) => comps.find((c) => c.name === name)!.id;
  const driverId = (name: string) => drivers.find((d) => d.name === name)!.id;

  async function insertInterests(dealId: string, codes: string[]) {
    if (codes.length === 0) return;
    await db
      .insert(dealProductInterests)
      .values(codes.map((code) => ({ dealId, productId: productId(code) })));
  }

  async function insertGates(dealId: string, completed: string[]) {
    await db.insert(dealTechnicalGates).values(
      ALL_GATE_CODES.map((gateCode) => ({
        dealId,
        gateCode,
        isCompleted: completed.includes(gateCode),
        completedAt: completed.includes(gateCode) ? daysAgo(10) : null,
        completedBy: completed.includes(gateCode) ? "Deal Commander" : null,
      })),
    );
  }

  for (const seed of DEAL_SEEDS) {
    const [deal] = await db
      .insert(enterpriseDeals)
      .values({
        dealName: seed.dealName,
        accountName: seed.accountName,
        crmRecordUrl: seed.crmRecordUrl,
        accountManager: seed.accountManager,
        technicalLead: seed.technicalLead,
        salesStageId: stageId(seed.stageName),
        stageEnteredAt: daysAgo(seed.stageEnteredDaysAgo),
        productRevenue: seed.productRevenue,
        pricingModelId: pricingId(seed.pricingModelName),
        contractTermYears: seed.contractTermYears,
        dealCurrency: seed.dealCurrency,
        expectedCloseDate: dateInDays(seed.expectedCloseInDays),
        winProbabilityPct: seed.winProbabilityPct,
        servicesRevenue: seed.servicesRevenue,
        servicesTierId: tierId(seed.servicesTierName),
        managerStrategicBlueprint: seed.managerStrategicBlueprint,
        speakerNotes: seed.speakerNotes,
        lossReason: seed.lossReason,
        lossArchetypeId: seed.lossArchetypeName
          ? archetypeId(seed.lossArchetypeName)
          : undefined,
        competitorId: seed.competitorName ? competitorId(seed.competitorName) : null,
        complianceDriverId: seed.complianceDriverName
          ? driverId(seed.complianceDriverName)
          : undefined,
        complianceDeadline:
          seed.complianceDeadlineInDays === undefined
            ? undefined
            : dateInDays(seed.complianceDeadlineInDays),
        estimatedLogSources: seed.estimatedLogSources,
      })
      .returning({ id: enterpriseDeals.id });

    await insertGates(deal.id, seed.completedGateCodes);
    await insertInterests(deal.id, seed.productInterestCodes);

    // Multi-driver deals mirror their secondary drivers into the join table;
    // the primary one stays on enterprise_deals.compliance_driver_id.
    if (seed.extraComplianceDriverNames && seed.extraComplianceDriverNames.length > 0) {
      await db
        .insert(dealComplianceDrivers)
        .values(
          seed.extraComplianceDriverNames.map((name) => ({
            dealId: deal.id,
            complianceDriverId: driverId(name),
          })),
        )
        .onConflictDoNothing();
    }

    if (seed.crossSellCodes && seed.crossSellCodes.length > 0) {
      await db.insert(dealCrossSells).values(
        seed.crossSellCodes.map((code) => ({ dealId: deal.id, productId: productId(code) })),
      );
    }

    if (seed.blockers && seed.blockers.length > 0) {
      await db.insert(dealBlockers).values(
        seed.blockers.map((b) => ({
          dealId: deal.id,
          categoryId: catId(b.categoryName),
          severityId: sevId(b.severityName),
          description: b.description,
        })),
      );
    }

    if (seed.archiveAsLost) {
      await archiveLostDeal({
        dealId: deal.id,
        accountName: seed.accountName,
        dealName: seed.dealName,
        finalTcv: Number(seed.productRevenue),
        pricingModel: seed.pricingModelName,
        servicesTier: seed.servicesTierName,
        gatesCompleted: seed.completedGateCodes.length,
        daysActive: seed.stageEnteredDaysAgo,
        competitorName: seed.competitorName,
        competitorId: seed.competitorName ? competitorId(seed.competitorName) : null,
      });
    } else if (seed.competitorName) {
      // Mirror the incumbent competitor into the Competitive Landscape join table,
      // same as seedIncumbentCompetitor in routes/deals.ts does for real deal
      // create/update — without this, closing this deal archives an empty
      // competitorsFaced (post-mortem.ts only reads deal_competitors). Lost deals
      // get their own "Lost To" row from archiveLostDeal instead.
      await db
        .insert(dealCompetitors)
        .values({ dealId: deal.id, competitorId: competitorId(seed.competitorName), status: "Active" })
        .onConflictDoNothing();
    }
  }

  logger.info({ count: DEAL_SEEDS.length }, "Seeded demo deals");

  async function archiveLostDeal(params: {
    dealId: string;
    accountName: string;
    dealName: string;
    finalTcv: number;
    pricingModel: string | null;
    servicesTier: string | null;
    gatesCompleted: number;
    daysActive: number;
    competitorName: string | null;
    competitorId: number | null;
  }) {
    // The post-mortem subscriber (lib/subscribers/post-mortem.ts) only archives to
    // deal_memory on a live `deal.stage_changed` event; direct seed inserts never
    // fire that event, so we replicate its archive shape here for seeded losses.
    await db
      .insert(dealMemory)
      .values({
        dealId: params.dealId,
        accountName: params.accountName,
        dealName: params.dealName,
        outcome: "Lost",
        finalTcv: String(params.finalTcv),
        pricingModel: params.pricingModel,
        servicesTier: params.servicesTier,
        totalGatesCompleted: params.gatesCompleted,
        totalBlockersEncountered: 0,
        totalDaysActive: params.daysActive,
        competitorsFaced: params.competitorName ? [params.competitorName] : [],
      })
      .onConflictDoNothing();
    if (params.competitorId) {
      await db
        .insert(dealCompetitors)
        .values({
          dealId: params.dealId,
          competitorId: params.competitorId,
          status: "Lost To",
        })
        .onConflictDoNothing();
    }
  }
}

async function main() {
  logger.info("Seeding EDC database...");
  await seedLookups();
  await seedPlaybooks();
  await seedMeddpiccQuestions();
  await seedCommander();
  await seedDeals();
  const scored = await rescoreActiveDeals();
  logger.info({ scored }, "Predictive scores computed");
  logger.info("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "Seed failed");
  process.exit(1);
});
