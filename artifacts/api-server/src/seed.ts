import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import {
  db,
  commanders,
  pipelineStages,
  pricingModels,
  servicesTiers,
  productCatalog,
  blockerCategories,
  blockerSeverities,
  lossArchetypes,
  gateDefinitions,
  interventionChecklists,
  engineThresholds,
  fxRates,
  enterpriseDeals,
  dealTechnicalGates,
  dealCrossSells,
  dealBlockers,
} from "@workspace/db";
import { logger } from "./lib/logger";

async function seedLookups() {
  await db
    .insert(pipelineStages)
    .values([
      { stageName: "Discovery", sortOrder: 1, description: "Initial technical and business discovery" },
      { stageName: "Validation", sortOrder: 2, description: "PoC execution and technical proof points" },
      { stageName: "Commercial", sortOrder: 3, description: "Pricing negotiation and SOW drafting" },
      { stageName: "Procurement", sortOrder: 4, description: "Legal review, security questionnaire, redlines" },
      { stageName: "Closed-Won", sortOrder: 5, description: "Contract fully executed" },
      { stageName: "Closed-Lost", sortOrder: 6, description: "Deal did not close — reason captured in notes" },
    ])
    .onConflictDoNothing();

  await db
    .insert(pricingModels)
    .values([
      { modelName: "Annual Subscription" },
      { modelName: "Multi-Year Committed" },
      { modelName: "Perpetual License" },
      { modelName: "Usage-Based" },
      { modelName: "Hybrid" },
    ])
    .onConflictDoNothing();

  await db
    .insert(servicesTiers)
    .values([
      { tierName: "None" },
      { tierName: "Professional Services Pitched" },
      { tierName: "Premium Support Pitched" },
      { tierName: "Combined SOW Shared" },
      { tierName: "Managed Services Contract" },
    ])
    .onConflictDoNothing();

  await db
    .insert(productCatalog)
    .values([
      { productName: "Core Platform License", productCategory: "Platform" },
      { productName: "Advanced Analytics Package", productCategory: "Analytics" },
      { productName: "Dedicated Edge Node Gateway", productCategory: "Infrastructure" },
      { productName: "Threat Detection Engine", productCategory: "Security" },
      { productName: "API Management Suite", productCategory: "Integration" },
      { productName: "Data Residency Module", productCategory: "Compliance" },
    ])
    .onConflictDoNothing();

  await db
    .insert(blockerCategories)
    .values([
      { categoryName: "Technical" },
      { categoryName: "Sales" },
      { categoryName: "Procurement" },
      { categoryName: "Legal" },
      { categoryName: "Executive" },
    ])
    .onConflictDoNothing();

  await db
    .insert(blockerSeverities)
    .values([
      { severityName: "Low", sortOrder: 1 },
      { severityName: "Medium", sortOrder: 2 },
      { severityName: "High", sortOrder: 3 },
    ])
    .onConflictDoNothing();

  await db
    .insert(lossArchetypes)
    .values([
      { archetypeName: "Technical Disqualification" },
      { archetypeName: "Budget Freeze" },
      { archetypeName: "Loss to Incumbent" },
      { archetypeName: "Compliance Gap" },
      { archetypeName: "Champion Departure" },
      { archetypeName: "No Decision" },
    ])
    .onConflictDoNothing();

  await db
    .insert(gateDefinitions)
    .values([
      { gateGroup: 1, gateCode: "G1_CRITERIA_LOCKED", label: "Minimum Viable Requirements Locked", description: "Technical success criteria agreed upon and documented with the customer", sortOrder: 1, prerequisiteGateCodes: [] },
      { gateGroup: 1, gateCode: "G1_EXECUTIVE_AGREED", label: "Executive Champion Agrees on Criteria", description: "Customer executive sponsor has formally signed off on evaluation criteria", sortOrder: 2, prerequisiteGateCodes: ["G1_CRITERIA_LOCKED"] },
      { gateGroup: 2, gateCode: "G2_WORKFLOW_VERIFIED", label: "Core Workflow Demonstration Verified", description: "Primary use case workflows demonstrated and validated in a controlled environment", sortOrder: 3, prerequisiteGateCodes: ["G1_EXECUTIVE_AGREED"] },
      { gateGroup: 2, gateCode: "G2_CHAMPION_DEFENSIBLE", label: "Champion Can Defend Internally", description: "Internal champion has the technical ammunition and political capital to advocate", sortOrder: 4, prerequisiteGateCodes: ["G2_WORKFLOW_VERIFIED"] },
      { gateGroup: 3, gateCode: "G3_PERFORMANCE_PASSED", label: "Load/Performance Stress Passed", description: "Platform performance validated under production-representative load conditions", sortOrder: 5, prerequisiteGateCodes: ["G2_CHAMPION_DEFENSIBLE"] },
      { gateGroup: 3, gateCode: "G3_INTEGRATIONS_MAPPED", label: "Integration Interfaces Mapped", description: "All required integrations identified, API contracts scoped, and data flows documented", sortOrder: 6, prerequisiteGateCodes: ["G3_PERFORMANCE_PASSED"] },
      { gateGroup: 4, gateCode: "G4_INFOSEC_CLEARED", label: "InfoSec Review Panel Approved", description: "Customer security team has reviewed and approved the platform architecture", sortOrder: 7, prerequisiteGateCodes: ["G3_INTEGRATIONS_MAPPED"] },
      { gateGroup: 4, gateCode: "G4_COMPLIANCE_VALIDATED", label: "Compliance Validated", description: "Regulatory and compliance requirements (SOC2, GDPR, HIPAA as applicable) confirmed met", sortOrder: 8, prerequisiteGateCodes: ["G4_INFOSEC_CLEARED"] },
      { gateGroup: 5, gateCode: "G5_CTO_SIGNED_OFF", label: "CTO/VP Engineering Win Signed-Off", description: "Technical decision-maker has formally approved the platform for procurement", sortOrder: 9, prerequisiteGateCodes: ["G4_COMPLIANCE_VALIDATED"] },
    ])
    .onConflictDoNothing();

  await db
    .insert(interventionChecklists)
    .values([
      { triggerPatternCode: "PREMATURE_COMMERCIAL", name: "Premature Commercial Containment", steps: ["Pause quoting", "Schedule CTO sync", "Send architecture whitepaper", "Re-baseline close date after Gate 3"] },
      { triggerPatternCode: "DISCOUNT_TRAP", name: "Discount Trap Recovery", steps: ["Freeze discount approval", "Build services-attached business case", "Escalate to deal desk"] },
      { triggerPatternCode: "UNPROTECTED_ELEPHANT", name: "Elephant Protection", steps: ["Draft Professional Services SOW", "Confirm deployment ownership", "Add Premium Support line"] },
      { triggerPatternCode: "MISSING_STRUCTURAL_ANCHOR", name: "Anchor Reset", steps: ["Convene success-criteria workshop", "Lock Gate 1 criteria", "Obtain executive sign-off"] },
    ])
    .onConflictDoNothing();

  await db
    .insert(engineThresholds)
    .values([
      { parameterKey: "elephant_tcv_threshold", parameterValue: "500000", dataType: "number", description: "TCV above which a deal is classified as an elephant deal" },
      { parameterKey: "mega_deal_tcv_threshold", parameterValue: "1000000", dataType: "number", description: "TCV above which a deal is classified as a mega deal" },
      { parameterKey: "stale_stage_days", parameterValue: "21", dataType: "number", description: "Days in current stage before a staleness alert fires" },
      { parameterKey: "ghost_pipeline_days", parameterValue: "14", dataType: "number", description: "Days without updates before a ghost pipeline alert fires" },
      { parameterKey: "phantom_champion_days", parameterValue: "30", dataType: "number", description: "Days active without executive agreement before phantom champion alert fires" },
      { parameterKey: "close_date_warning_days", parameterValue: "30", dataType: "number", description: "Days before expected close date to trigger proximity alert" },
      { parameterKey: "gate_completion_warn_pct", parameterValue: "50", dataType: "number", description: "Minimum gate completion percentage expected when within close_date_warning_days" },
      { parameterKey: "reporting_currency", parameterValue: "USD", dataType: "string", description: "Currency used for all portfolio rollups and threshold comparisons" },
      { parameterKey: "momentum_drop_pct", parameterValue: "50", dataType: "number", description: "Pct drop in the deal's own gate-completion velocity that signals deceleration" },
      { parameterKey: "momentum_window_days", parameterValue: "30", dataType: "number", description: "Window size in days to split the deal's own history into recent vs earlier rates" },
      { parameterKey: "momentum_min_gate_pct", parameterValue: "60", dataType: "number", description: "Gate-completion pct below which a decelerating deal nearing close fires SLOW_MOTION_COLLISION" },
      { parameterKey: "low_attach_rate_threshold", parameterValue: "0.34", dataType: "number", description: "Attach rate at or below which a large deal fires LOW_ATTACH_ELEPHANT" },
    ])
    .onConflictDoNothing();

  const today = new Date().toISOString().slice(0, 10);
  await db
    .insert(fxRates)
    .values([
      { baseCurrency: "EUR", quoteCurrency: "USD", rate: "1.08000000", asOf: today },
      { baseCurrency: "GBP", quoteCurrency: "USD", rate: "1.27000000", asOf: today },
      { baseCurrency: "USD", quoteCurrency: "USD", rate: "1.00000000", asOf: today },
    ])
    .onConflictDoNothing();
}

async function seedCommander() {
  const username = process.env.COMMANDER_USERNAME ?? "commander";
  const password = process.env.COMMANDER_PASSWORD ?? "DealCommander!2026";
  const passwordHash = await bcrypt.hash(password, 10);
  await db
    .insert(commanders)
    .values({ username, displayName: "Deal Commander", passwordHash })
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

  const stageId = (name: string) => stages.find((s) => s.stageName === name)!.id;
  const pricingId = (name: string) => pricing.find((p) => p.modelName === name)!.id;
  const tierId = (name: string) => tiers.find((t) => t.tierName === name)!.id;
  const productId = (name: string) => products.find((p) => p.productName === name)!.id;
  const catId = (name: string) => cats.find((c) => c.categoryName === name)!.id;
  const sevId = (name: string) => sevs.find((s) => s.severityName === name)!.id;
  const archetypeId = (name: string) => archetypes.find((a) => a.archetypeName === name)!.id;

  async function insertGates(dealId: string, completed: string[]) {
    const codes = [
      "G1_CRITERIA_LOCKED", "G1_EXECUTIVE_AGREED", "G2_WORKFLOW_VERIFIED",
      "G2_CHAMPION_DEFENSIBLE", "G3_PERFORMANCE_PASSED", "G3_INTEGRATIONS_MAPPED",
      "G4_INFOSEC_CLEARED", "G4_COMPLIANCE_VALIDATED", "G5_CTO_SIGNED_OFF",
    ];
    await db.insert(dealTechnicalGates).values(
      codes.map((gateCode) => ({
        dealId,
        gateCode,
        isCompleted: completed.includes(gateCode),
        completedAt: completed.includes(gateCode) ? daysAgo(10) : null,
        completedBy: completed.includes(gateCode) ? "Deal Commander" : null,
      })),
    );
  }

  // Deal 1: Premature Commercial elephant, low gate completion, no services
  const [d1] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: "Project Atlas",
      accountName: "Globex Corporation",
      crmRecordUrl: "https://crm.example.com/deals/atlas",
      accountManager: "Sarah Chen",
      technicalLead: "Marcus Webb",
      salesStageId: stageId("Commercial"),
      stageEnteredAt: daysAgo(28),
      productRevenue: "780000",
      pricingModelId: pricingId("Annual Subscription"),
      contractTermYears: 2,
      dealCurrency: "USD",
      expectedCloseDate: dateInDays(20),
      winProbabilityPct: 60,
      servicesRevenue: "0",
      servicesTierId: tierId("None"),
      managerStrategicBlueprint: "Land the platform deal, expand into analytics in year two.",
      speakerNotes: "Champion is nervous about InfoSec timeline — do not share.",
    })
    .returning({ id: enterpriseDeals.id });
  await insertGates(d1.id, ["G1_CRITERIA_LOCKED"]);
  await db.insert(dealCrossSells).values([
    { dealId: d1.id, productId: productId("Core Platform License") },
  ]);
  await db.insert(dealBlockers).values([
    { dealId: d1.id, categoryId: catId("Technical"), severityId: sevId("High"), description: "Performance benchmark not yet scheduled with customer infra team." },
  ]);

  // Deal 2: Healthy validation-stage deal (EUR) with services
  const [d2] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: "Project Beacon",
      accountName: "Initech Industries",
      crmRecordUrl: "https://crm.example.com/deals/beacon",
      accountManager: "David Park",
      technicalLead: "Priya Natarajan",
      salesStageId: stageId("Validation"),
      stageEnteredAt: daysAgo(9),
      productRevenue: "240000",
      pricingModelId: pricingId("Multi-Year Committed"),
      contractTermYears: 3,
      dealCurrency: "EUR",
      expectedCloseDate: dateInDays(75),
      winProbabilityPct: 45,
      servicesRevenue: "60000",
      servicesTierId: tierId("Professional Services Pitched"),
      managerStrategicBlueprint: "Technical win first; commercial follows once Gate 3 passes.",
    })
    .returning({ id: enterpriseDeals.id });
  await insertGates(d2.id, ["G1_CRITERIA_LOCKED", "G1_EXECUTIVE_AGREED", "G2_WORKFLOW_VERIFIED"]);
  await db.insert(dealCrossSells).values([
    { dealId: d2.id, productId: productId("Core Platform License") },
    { dealId: d2.id, productId: productId("Advanced Analytics Package") },
    { dealId: d2.id, productId: productId("API Management Suite") },
  ]);

  // Deal 3: Procurement stage, near close, mega deal, stale
  const [d3] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: "Project Cobalt",
      accountName: "Umbrella Holdings",
      crmRecordUrl: "https://crm.example.com/deals/cobalt",
      accountManager: "Sarah Chen",
      technicalLead: "Marcus Webb",
      salesStageId: stageId("Procurement"),
      stageEnteredAt: daysAgo(34),
      productRevenue: "1200000",
      pricingModelId: pricingId("Multi-Year Committed"),
      contractTermYears: 3,
      dealCurrency: "USD",
      expectedCloseDate: dateInDays(12),
      winProbabilityPct: 80,
      servicesRevenue: "180000",
      servicesTierId: tierId("Combined SOW Shared"),
      managerStrategicBlueprint: "Close before quarter end; legal redlines are the last gate.",
    })
    .returning({ id: enterpriseDeals.id });
  await insertGates(d3.id, [
    "G1_CRITERIA_LOCKED", "G1_EXECUTIVE_AGREED", "G2_WORKFLOW_VERIFIED",
    "G2_CHAMPION_DEFENSIBLE", "G3_PERFORMANCE_PASSED",
  ]);
  await db.insert(dealCrossSells).values([
    { dealId: d3.id, productId: productId("Core Platform License") },
    { dealId: d3.id, productId: productId("Threat Detection Engine") },
    { dealId: d3.id, productId: productId("Data Residency Module") },
  ]);
  await db.insert(dealBlockers).values([
    { dealId: d3.id, categoryId: catId("Legal"), severityId: sevId("Medium"), description: "Liability cap redline pending customer counsel review." },
  ]);

  // Deal 4: Closed-Lost with archetype
  const [d4] = await db
    .insert(enterpriseDeals)
    .values({
      dealName: "Project Delta",
      accountName: "Soylent Systems",
      crmRecordUrl: "https://crm.example.com/deals/delta",
      accountManager: "David Park",
      technicalLead: "Priya Natarajan",
      salesStageId: stageId("Closed-Lost"),
      stageEnteredAt: daysAgo(60),
      productRevenue: "420000",
      pricingModelId: pricingId("Annual Subscription"),
      contractTermYears: 1,
      dealCurrency: "USD",
      expectedCloseDate: dateInDays(-30),
      winProbabilityPct: 0,
      servicesRevenue: "0",
      servicesTierId: tierId("None"),
      managerStrategicBlueprint: "Lost momentum after champion left mid-evaluation.",
      lossReason: "Customer champion departed; replacement favored incumbent.",
      lossArchetypeId: archetypeId("Champion Departure"),
    })
    .returning({ id: enterpriseDeals.id });
  await insertGates(d4.id, ["G1_CRITERIA_LOCKED", "G1_EXECUTIVE_AGREED"]);

  logger.info("Seeded 4 demo deals");
}

async function main() {
  logger.info("Seeding EDC database...");
  await seedLookups();
  await seedCommander();
  await seedDeals();
  logger.info("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "Seed failed");
  process.exit(1);
});
