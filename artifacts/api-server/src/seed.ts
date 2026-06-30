import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
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
} from "@workspace/db";
import { logger } from "./lib/logger";
import { rescoreActiveDeals } from "./lib/scoring";

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
    ])
    .onConflictDoNothing();
  // B1: "Hybrid" retired — deactivate any pre-existing row so listPricingModels
  // (which filters isActive = true) hides it.
  await db
    .update(pricingModels)
    .set({ isActive: false })
    .where(eq(pricingModels.modelName, "Hybrid"));

  await db
    .insert(servicesTiers)
    .values([
      { tierName: "None" },
      { tierName: "Professional Services Pitched" },
      { tierName: "Premium Support Pitched" },
      { tierName: "Combined SOW Shared" },
      { tierName: "Online Onboarding" },
      { tierName: "Onsite Onboarding" },
      { tierName: "Product Training" },
    ])
    .onConflictDoNothing();
  // B3: "Managed Services Contract" retired — deactivate any pre-existing row so
  // listServicesTiers (which filters isActive = true) hides it.
  await db
    .update(servicesTiers)
    .set({ isActive: false })
    .where(eq(servicesTiers.tierName, "Managed Services Contract"));

  // B2: default team roster so the AM/TL dropdowns aren't empty. A person may be
  // both an AM and a TL — flags are independent.
  await db
    .insert(teamMembers)
    .values([
      { name: "Sarah Chen", canBeAm: true, canBeTl: false },
      { name: "David Park", canBeAm: true, canBeTl: false },
      { name: "Marcus Webb", canBeAm: false, canBeTl: true },
      { name: "Priya Natarajan", canBeAm: false, canBeTl: true },
      { name: "Alex Rivera", canBeAm: true, canBeTl: true },
    ])
    .onConflictDoNothing();

  // Default deal-tag palette: the PRD §22.3 set plus a few extra commander tags,
  // each with a distinct hue. Tag definitions are otherwise minted from the
  // cockpit's "+ Tag" popover.
  await db
    .insert(tagDefinitions)
    .values([
      // PRD §22.3
      { tagName: "Net-New", color: "#3B82F6" },
      { tagName: "Renewal", color: "#10B981" },
      { tagName: "Expansion", color: "#8B5CF6" },
      { tagName: "At-Risk", color: "#EF4444" },
      { tagName: "Strategic", color: "#F59E0B" },
      { tagName: "Compliance-Heavy", color: "#6366F1" },
      { tagName: "Multi-Region", color: "#EC4899" },
      { tagName: "First-Deal", color: "#14B8A6" },
      // Extras
      { tagName: "Land & Expand", color: "#06B6D4" },
      { tagName: "Fast Track", color: "#84CC16" },
      { tagName: "Executive Sponsor", color: "#A855F7" },
      { tagName: "Competitive", color: "#F97316" },
      { tagName: "POC", color: "#0EA5E9" },
    ])
    .onConflictDoNothing();

  // ManageEngine AD360 (IAM) + Log360 (SIEM) component catalog.
  await db
    .insert(productCatalog)
    .values([
      { code: "ADMANAGER_PLUS", productName: "ADManager Plus", productCategory: "Identity Management", suite: "AD360" },
      { code: "ADAUDIT_PLUS", productName: "ADAudit Plus", productCategory: "Auditing/UBA", suite: "AD360" },
      { code: "ADSELFSERVICE_PLUS", productName: "ADSelfService Plus", productCategory: "SSPR/MFA/SSO", suite: "AD360" },
      { code: "M365_MANAGER_PLUS", productName: "M365 Manager Plus", productCategory: "M365 Management", suite: "AD360" },
      { code: "SHAREPOINT_MANAGER_PLUS", productName: "SharePoint Manager Plus", productCategory: "SharePoint", suite: "AD360" },
      { code: "EXCHANGE_REPORTER_PLUS", productName: "Exchange Reporter Plus", productCategory: "Exchange", suite: "AD360" },
      { code: "RECOVERYMANAGER_PLUS", productName: "RecoveryManager Plus", productCategory: "Backup/Recovery", suite: "AD360" },
      { code: "EVENTLOG_ANALYZER", productName: "EventLog Analyzer", productCategory: "Log Management/SIEM", suite: "Log360" },
      { code: "DATA_SECURITY_PLUS", productName: "Data Security Plus", productCategory: "DLP/FIM", suite: "Log360" },
      { code: "CLOUD_SECURITY_PLUS", productName: "Cloud Security Plus", productCategory: "Cloud Log", suite: "Log360" },
      { code: "LOG360_CLOUD", productName: "Log360 Cloud", productCategory: "Cloud SIEM", suite: "Log360" },
      { code: "IDENTITY360", productName: "Identity360", productCategory: "Identity Platform", suite: "AD360" },
    ])
    .onConflictDoNothing();

  await db
    .insert(competitors)
    .values([
      { name: "Quest", category: "IAM" },
      { name: "Netwrix", category: "IAM" },
      { name: "Microsoft Entra", category: "IAM" },
      { name: "Okta", category: "IAM" },
      { name: "SailPoint", category: "IAM" },
      { name: "One Identity", category: "IAM" },
      { name: "Semperis", category: "IAM" },
      { name: "Splunk", category: "SIEM" },
      { name: "IBM QRadar", category: "SIEM" },
      { name: "Microsoft Sentinel", category: "SIEM" },
      { name: "LogRhythm", category: "SIEM" },
      { name: "Securonix", category: "SIEM" },
      // B4: named competitive tools by category (category column is varchar(10)).
      { name: "Quest Active Roles", category: "IAM" },
      { name: "SolarWinds Access Rights Manager (ARM)", category: "IAM" },
      { name: "Cayosoft Administrator", category: "IAM" },
      { name: "Softerra Adaxes", category: "IAM" },
      { name: "Imanami GroupID", category: "IAM" },
      { name: "Quest Change Auditor for Active Directory", category: "Audit" },
      { name: "Netwrix Auditor", category: "Audit" },
      { name: "Lepide Active Directory Auditor", category: "Audit" },
      { name: "Varonis DatAdvantage", category: "Audit" },
      { name: "Lepide Office 365 Auditor", category: "Audit" },
      { name: "CoreView", category: "M365" },
      { name: "AdminDroid", category: "M365" },
      { name: "Syskit Point", category: "M365" },
      { name: "Specops uReset", category: "SSPR" },
      { name: "Microsoft Entra ID SSPR (with password writeback)", category: "SSPR" },
      { name: "Tools4ever Self Service Reset Password Management (SSRPM)", category: "SSPR" },
      { name: "Quickpass", category: "SSPR" },
      { name: "PingID (Ping Identity MFA)", category: "MFA" },
      { name: "Okta MFA + SSO", category: "MFA" },
      { name: "Cisco Duo", category: "MFA" },
    ])
    .onConflictDoNothing();

  await db
    .insert(complianceDrivers)
    .values([
      { name: "SOX" },
      { name: "HIPAA" },
      { name: "PCI-DSS" },
      { name: "GDPR" },
      { name: "NIS2" },
      { name: "ISO 27001" },
      { name: "Ransomware/Recovery" },
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
      { triggerPatternCode: "COMPETITIVE_DISPLACEMENT_STALL", name: "Displacement Acceleration", steps: ["Re-confirm the cost/pain of staying on the incumbent", "Lock a differentiated win-criterion the incumbent cannot meet", "Set a mutual close plan with a hard decision date", "Escalate to the executive sponsor"] },
    ])
    .onConflictDoNothing();

  // Competitor battlecards (talking points surfaced in the Next-Best-Action panel).
  const competitorRows = await db.select().from(competitors);
  const competitorIdByName = (name: string) =>
    competitorRows.find((c) => c.name === name)?.id;
  const battlecardData: { name: string; talkingPoints: string[] }[] = [
    { name: "Quest", talkingPoints: ["Single integrated AD360 console vs Quest's stitched-together GPOADmin / Change Auditor / Recovery Manager line-up.", "Faster time-to-value and a materially lower TCO at comparable scale.", "Unified AD + M365 + Exchange auditing under one license."] },
    { name: "Netwrix", talkingPoints: ["ADManager Plus adds delegated management & provisioning — Netwrix Auditor is read-only auditing.", "Real-time alerting and automated remediation, not just after-the-fact reports.", "One vendor for management, auditing, and recovery."] },
    { name: "Microsoft Entra", talkingPoints: ["Deep on-prem AD management & granular auditing that native Entra tooling leaves thin.", "Works across hybrid AD + M365, not cloud-only.", "Pre-built compliance reports (SOX/HIPAA/PCI) out of the box."] },
    { name: "Splunk", talkingPoints: ["Predictable per-device licensing vs Splunk's volume-based bill shock.", "Security-first SIEM with built-in compliance packs — no app sprawl to buy.", "Faster deployment and a far lower entry price for mid-market."] },
    { name: "IBM QRadar", talkingPoints: ["Lower operational overhead and a gentler learning curve.", "Integrated AD threat detection via ADAudit Plus feeding Log360.", "Predictable licensing without QRadar's EPS cliff."] },
    { name: "Microsoft Sentinel", talkingPoints: ["No metered cloud ingestion costs that scale unpredictably with log volume.", "On-prem and hybrid coverage, not Azure-centric.", "Bundled file-integrity & DLP via Data Security Plus."] },
  ];
  const battlecardValues = battlecardData
    .map((b) => {
      const competitorId = competitorIdByName(b.name);
      return competitorId
        ? { competitorId, talkingPoints: b.talkingPoints }
        : null;
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
  if (battlecardValues.length > 0) {
    await db.insert(competitorBattlecards).values(battlecardValues).onConflictDoNothing();
  }

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
      { parameterKey: "competitive_stall_days", parameterValue: "21", dataType: "number", description: "Days in Validation/Commercial against an incumbent before COMPETITIVE_DISPLACEMENT_STALL fires" },
      { parameterKey: "suite_bundle_min_components", parameterValue: "3", dataType: "number", description: "À-la-carte components in one suite at or above which a bundle upsell is recommended" },
      { parameterKey: "poc_max_validation_days", parameterValue: "30", dataType: "number", description: "Days a PoC can sit in Validation without locked criteria before POC_DEATH_MARCH fires" },
      { parameterKey: "siem_high_volume_log_sources", parameterValue: "500", dataType: "number", description: "Estimated log sources at or above which an undersized Log360 deal fires SIEM_UNDERSCOPED" },
      // Risk Engine v2.0 dimension weights + level boundaries
      { parameterKey: "risk_weight_technical", parameterValue: "0.20", dataType: "number", description: "Weight of the technical risk dimension in the composite risk score (Risk Engine v2)" },
      { parameterKey: "risk_weight_commercial", parameterValue: "0.15", dataType: "number", description: "Weight of the commercial risk dimension in the composite risk score (Risk Engine v2)" },
      { parameterKey: "risk_weight_stakeholder", parameterValue: "0.15", dataType: "number", description: "Weight of the stakeholder risk dimension in the composite risk score (Risk Engine v2)" },
      { parameterKey: "risk_weight_temporal", parameterValue: "0.15", dataType: "number", description: "Weight of the temporal risk dimension in the composite risk score (Risk Engine v2)" },
      { parameterKey: "risk_weight_financial", parameterValue: "0.10", dataType: "number", description: "Weight of the financial risk dimension in the composite risk score (Risk Engine v2)" },
      { parameterKey: "risk_weight_competitive", parameterValue: "0.10", dataType: "number", description: "Weight of the competitive risk dimension in the composite risk score (Risk Engine v2)" },
      { parameterKey: "risk_weight_engagement", parameterValue: "0.15", dataType: "number", description: "Weight of the engagement risk dimension in the composite risk score (Risk Engine v2)" },
      { parameterKey: "risk_level_low_max", parameterValue: "25", dataType: "number", description: "Composite risk score at or below which a deal is classified as Low risk (Risk Engine v2)" },
      { parameterKey: "risk_level_moderate_max", parameterValue: "50", dataType: "number", description: "Composite risk score at or below which a deal is classified as Moderate risk (Risk Engine v2)" },
      { parameterKey: "risk_level_elevated_max", parameterValue: "75", dataType: "number", description: "Composite risk score at or below which a deal is classified as Elevated risk; above this is High (Risk Engine v2)" },
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

// C4: stage-keyed playbooks with ordered steps. The auto-assign engine keys off
// playbooks.applicableStage (the pipeline stage *name*) and orders steps by
// stepOrder. Guarded by a presence check (playbooks have no unique name column,
// so onConflictDoNothing cannot dedupe by name).
async function seedPlaybooks() {
  const existing = await db.select({ id: playbooks.id }).from(playbooks).limit(1);
  if (existing.length > 0) {
    logger.info("Playbooks already present — skipping playbook seed");
    return;
  }

  const playbookData: {
    playbookName: string;
    description: string;
    applicableStage: string;
    steps: {
      stepOrder: number;
      stepName: string;
      recommendedAction: string;
      expectedDurationDays: number;
      isCritical: boolean;
    }[];
  }[] = [
    {
      playbookName: "POC / Evaluation Playbook",
      description:
        "Drive a proof-of-concept to a clean go/no-go with locked success criteria.",
      applicableStage: "Validation",
      steps: [
        { stepOrder: 1, stepName: "Lock success criteria", recommendedAction: "Run a success-criteria workshop and get written sign-off on the PoC exit criteria (Gate 1).", expectedDurationDays: 3, isCritical: true },
        { stepOrder: 2, stepName: "Secure executive sponsor", recommendedAction: "Confirm an executive sponsor agrees on the evaluation criteria and timeline.", expectedDurationDays: 5, isCritical: true },
        { stepOrder: 3, stepName: "Demonstrate core workflow", recommendedAction: "Validate the primary use-case workflows in the customer's environment.", expectedDurationDays: 7, isCritical: false },
        { stepOrder: 4, stepName: "Run performance / scale test", recommendedAction: "Stress the platform under production-representative load and capture the results.", expectedDurationDays: 5, isCritical: false },
        { stepOrder: 5, stepName: "Go/no-go decision", recommendedAction: "Hold a decision review against the locked criteria and set the next-stage plan.", expectedDurationDays: 2, isCritical: true },
      ],
    },
    {
      playbookName: "Negotiation / Commercial Playbook",
      description:
        "Protect price integrity and attach services while closing the commercial.",
      applicableStage: "Commercial",
      steps: [
        { stepOrder: 1, stepName: "Confirm technical win", recommendedAction: "Verify Gate 3 (performance) is passed before opening commercial discussions.", expectedDurationDays: 2, isCritical: true },
        { stepOrder: 2, stepName: "Build services-attached business case", recommendedAction: "Draft a Professional Services / Premium Support SOW to protect the deployment.", expectedDurationDays: 4, isCritical: false },
        { stepOrder: 3, stepName: "Present pricing & anchor value", recommendedAction: "Walk the customer through the value-anchored pricing model and ROI.", expectedDurationDays: 3, isCritical: false },
        { stepOrder: 4, stepName: "Lock mutual close plan", recommendedAction: "Agree a mutual action plan with a hard decision date and procurement owners.", expectedDurationDays: 3, isCritical: true },
      ],
    },
    {
      playbookName: "Procurement / Legal Playbook",
      description: "Clear legal and security review to a signed contract.",
      applicableStage: "Procurement",
      steps: [
        { stepOrder: 1, stepName: "Submit security questionnaire", recommendedAction: "Provide the completed security questionnaire and architecture docs to InfoSec.", expectedDurationDays: 5, isCritical: false },
        { stepOrder: 2, stepName: "Resolve legal redlines", recommendedAction: "Work counsel through liability, data-processing, and SLA redlines.", expectedDurationDays: 7, isCritical: true },
        { stepOrder: 3, stepName: "Obtain final sign-off", recommendedAction: "Secure CTO/VP Engineering and procurement sign-off for execution.", expectedDurationDays: 3, isCritical: true },
      ],
    },
  ];

  for (const pb of playbookData) {
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
  logger.info({ count: playbookData.length }, "Seeded stage-keyed playbooks");
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
      managerStrategicBlueprint: "Land ADAudit Plus for the SOX audit, expand into the AD360 suite next year.",
      speakerNotes: "Champion is nervous about the SOX timeline — do not share.",
      competitorId: competitorId("Quest"),
      complianceDriverId: driverId("SOX"),
      complianceDeadline: dateInDays(25),
    })
    .returning({ id: enterpriseDeals.id });
  await insertGates(d1.id, ["G1_CRITERIA_LOCKED"]);
  await insertInterests(d1.id, ["ADAUDIT_PLUS"]);
  await db.insert(dealCrossSells).values([
    { dealId: d1.id, productId: productId("ADMANAGER_PLUS") },
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
      competitorId: competitorId("Splunk"),
      complianceDriverId: driverId("PCI-DSS"),
      complianceDeadline: dateInDays(75),
      estimatedLogSources: 1500,
    })
    .returning({ id: enterpriseDeals.id });
  await insertGates(d2.id, ["G1_CRITERIA_LOCKED", "G1_EXECUTIVE_AGREED", "G2_WORKFLOW_VERIFIED"]);
  await insertInterests(d2.id, ["EVENTLOG_ANALYZER"]);
  // Multi-driver demo: Beacon is also driven by GDPR alongside its primary PCI-DSS.
  await db
    .insert(dealComplianceDrivers)
    .values([{ dealId: d2.id, complianceDriverId: driverId("GDPR") }])
    .onConflictDoNothing();
  await db.insert(dealCrossSells).values([
    { dealId: d2.id, productId: productId("EVENTLOG_ANALYZER") },
    { dealId: d2.id, productId: productId("DATA_SECURITY_PLUS") },
    { dealId: d2.id, productId: productId("CLOUD_SECURITY_PLUS") },
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
      competitorId: competitorId("Microsoft Entra"),
      complianceDriverId: driverId("ISO 27001"),
      complianceDeadline: dateInDays(60),
    })
    .returning({ id: enterpriseDeals.id });
  await insertGates(d3.id, [
    "G1_CRITERIA_LOCKED", "G1_EXECUTIVE_AGREED", "G2_WORKFLOW_VERIFIED",
    "G2_CHAMPION_DEFENSIBLE", "G3_PERFORMANCE_PASSED",
  ]);
  await insertInterests(d3.id, ["ADMANAGER_PLUS"]);
  await db.insert(dealCrossSells).values([
    { dealId: d3.id, productId: productId("ADAUDIT_PLUS") },
    { dealId: d3.id, productId: productId("ADSELFSERVICE_PLUS") },
    { dealId: d3.id, productId: productId("M365_MANAGER_PLUS") },
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
      competitorId: competitorId("Okta"),
    })
    .returning({ id: enterpriseDeals.id });
  await insertGates(d4.id, ["G1_CRITERIA_LOCKED", "G1_EXECUTIVE_AGREED"]);
  await insertInterests(d4.id, ["ADSELFSERVICE_PLUS"]);

  logger.info("Seeded 4 demo deals");
}

async function main() {
  logger.info("Seeding EDC database...");
  await seedLookups();
  await seedPlaybooks();
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
