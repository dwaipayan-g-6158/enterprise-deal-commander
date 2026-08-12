/**
 * Database-agnostic seed DATA.
 *
 * This module holds ONLY literal data — no Drizzle, no `@workspace/db`, no
 * bcrypt, no network, no `DATABASE_URL`. It must stay importable from any
 * runtime (the Postgres seed in `seed.ts`, the Catalyst Data Store seed, a
 * test fixture) without side effects.
 *
 * Two conventions make that possible:
 *   1. Foreign keys are expressed BY NAME/CODE (`stageName`, `competitorName`,
 *      `productInterestCodes`), never by resolved id — the consumer resolves
 *      them against whatever store it is writing to.
 *   2. Dates are expressed as RELATIVE OFFSETS IN DAYS (plain numbers), never
 *      as `Date` objects — the consumer converts them at seed time so the
 *      demo data is always anchored to "now".
 */

/* ------------------------------------------------------------------ Lookups */

export interface PipelineStageSeed {
  stageName: string;
  sortOrder: number;
  description: string;
}

export const PIPELINE_STAGES: PipelineStageSeed[] = [
  { stageName: "Discovery", sortOrder: 1, description: "Initial technical and business discovery" },
  { stageName: "Validation", sortOrder: 2, description: "PoC execution and technical proof points" },
  { stageName: "Commercial", sortOrder: 3, description: "Pricing negotiation and SOW drafting" },
  { stageName: "Procurement", sortOrder: 4, description: "Legal review, security questionnaire, redlines" },
  { stageName: "Closed-Won", sortOrder: 5, description: "Contract fully executed" },
  { stageName: "Closed-Lost", sortOrder: 6, description: "Deal did not close — reason captured in notes" },
];

export interface PricingModelSeed {
  modelName: string;
}

export const PRICING_MODELS: PricingModelSeed[] = [
  { modelName: "Annual Subscription" },
  { modelName: "Multi-Year Committed" },
  { modelName: "Perpetual License" },
  { modelName: "Usage-Based" },
];

export interface ServicesTierSeed {
  tierName: string;
}

export const SERVICES_TIERS: ServicesTierSeed[] = [
  { tierName: "None" },
  { tierName: "Professional Services Pitched" },
  { tierName: "Premium Support Pitched" },
  { tierName: "Combined SOW Shared" },
  { tierName: "Online Onboarding" },
  { tierName: "Onsite Onboarding" },
  { tierName: "Product Training" },
];

export interface TeamMemberSeed {
  name: string;
  canBeAm: boolean;
  canBeTl: boolean;
}

// B2: default team roster so the AM/TL dropdowns aren't empty. A person may be
// both an AM and a TL — flags are independent.
export const TEAM_MEMBERS: TeamMemberSeed[] = [
  { name: "Sarah Chen", canBeAm: true, canBeTl: false },
  { name: "David Park", canBeAm: true, canBeTl: false },
  { name: "Marcus Webb", canBeAm: false, canBeTl: true },
  { name: "Priya Natarajan", canBeAm: false, canBeTl: true },
  { name: "Alex Rivera", canBeAm: true, canBeTl: true },
];

export interface TagDefinitionSeed {
  tagName: string;
  color: string;
}

// Default deal-tag palette: the PRD §22.3 set plus a few extra commander tags,
// each with a distinct hue. Tag definitions are otherwise minted from the
// cockpit's "+ Tag" popover.
export const TAG_DEFINITIONS: TagDefinitionSeed[] = [
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
];

export interface ProductCatalogSeed {
  code: string;
  productName: string;
  productCategory: string;
  suite: string;
}

// ManageEngine AD360 (IAM) + Log360 (SIEM) component catalog.
export const PRODUCT_CATALOG: ProductCatalogSeed[] = [
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
  // User-based licensed AD360 bundle SKU — see lib/engine/src/index.ts
  // (deliberately excluded from SUITE_MEMBERS; treated as a platform SKU
  // like IDENTITY360/LOG360_CLOUD, not an à-la-carte component).
  { code: "AD360_ENTERPRISE", productName: "AD360 Enterprise", productCategory: "Integrated IAM Suite", suite: "AD360" },
];

export interface Ad360FeatureSeed {
  code: string;
  label: string;
  sortOrder: number;
}

// Predefined AD360 Enterprise platform-customization pick-list. Selected
// per deal via deal_ad360_features; free-text "other" notes live on
// enterprise_deals.ad360_feature_notes.
export const AD360_FEATURES: Ad360FeatureSeed[] = [
  { code: "CUSTOM_WORKFLOWS", label: "Custom Workflows", sortOrder: 1 },
  { code: "SSO_SAML", label: "SSO / SAML", sortOrder: 2 },
  { code: "API_AUTOMATION", label: "API & Automation", sortOrder: 3 },
  { code: "CUSTOM_REPORTS", label: "Custom Reports", sortOrder: 4 },
  { code: "WHITE_LABELING", label: "White-Labeling", sortOrder: 5 },
  { code: "ROLE_BASED_DELEGATION", label: "Role-Based Delegation", sortOrder: 6 },
];

export interface CompetitorSeed {
  name: string;
  category: string;
}

export const COMPETITORS: CompetitorSeed[] = [
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
];

export interface ComplianceDriverSeed {
  name: string;
}

export const COMPLIANCE_DRIVERS: ComplianceDriverSeed[] = [
  { name: "SOX" },
  { name: "HIPAA" },
  { name: "PCI-DSS" },
  { name: "GDPR" },
  { name: "NIS2" },
  { name: "ISO 27001" },
  { name: "Ransomware/Recovery" },
];

export interface BlockerCategorySeed {
  categoryName: string;
}

export const BLOCKER_CATEGORIES: BlockerCategorySeed[] = [
  { categoryName: "Technical" },
  { categoryName: "Sales" },
  { categoryName: "Procurement" },
  { categoryName: "Legal" },
  { categoryName: "Executive" },
];

export interface BlockerSeveritySeed {
  severityName: string;
  sortOrder: number;
}

export const BLOCKER_SEVERITIES: BlockerSeveritySeed[] = [
  { severityName: "Low", sortOrder: 1 },
  { severityName: "Medium", sortOrder: 2 },
  { severityName: "High", sortOrder: 3 },
];

export interface LossArchetypeSeed {
  archetypeName: string;
}

export const LOSS_ARCHETYPES: LossArchetypeSeed[] = [
  { archetypeName: "Technical Disqualification" },
  { archetypeName: "Budget Freeze" },
  { archetypeName: "Loss to Incumbent" },
  { archetypeName: "Compliance Gap" },
  { archetypeName: "Champion Departure" },
  { archetypeName: "No Decision" },
];

export interface GateDefinitionSeed {
  gateGroup: number;
  gateCode: string;
  label: string;
  description: string;
  sortOrder: number;
  prerequisiteGateCodes: string[];
}

export const GATE_DEFINITIONS: GateDefinitionSeed[] = [
  { gateGroup: 1, gateCode: "G1_CRITERIA_LOCKED", label: "Minimum Viable Requirements Locked", description: "Technical success criteria agreed upon and documented with the customer", sortOrder: 1, prerequisiteGateCodes: [] },
  { gateGroup: 1, gateCode: "G1_EXECUTIVE_AGREED", label: "Executive Champion Agrees on Criteria", description: "Customer executive sponsor has formally signed off on evaluation criteria", sortOrder: 2, prerequisiteGateCodes: ["G1_CRITERIA_LOCKED"] },
  { gateGroup: 2, gateCode: "G2_WORKFLOW_VERIFIED", label: "Core Workflow Demonstration Verified", description: "Primary use case workflows demonstrated and validated in a controlled environment", sortOrder: 3, prerequisiteGateCodes: ["G1_EXECUTIVE_AGREED"] },
  { gateGroup: 2, gateCode: "G2_CHAMPION_DEFENSIBLE", label: "Champion Can Defend Internally", description: "Internal champion has the technical ammunition and political capital to advocate", sortOrder: 4, prerequisiteGateCodes: ["G2_WORKFLOW_VERIFIED"] },
  { gateGroup: 3, gateCode: "G3_PERFORMANCE_PASSED", label: "Load/Performance Stress Passed", description: "Platform performance validated under production-representative load conditions", sortOrder: 5, prerequisiteGateCodes: ["G2_CHAMPION_DEFENSIBLE"] },
  { gateGroup: 3, gateCode: "G3_INTEGRATIONS_MAPPED", label: "Integration Interfaces Mapped", description: "All required integrations identified, API contracts scoped, and data flows documented", sortOrder: 6, prerequisiteGateCodes: ["G3_PERFORMANCE_PASSED"] },
  { gateGroup: 4, gateCode: "G4_INFOSEC_CLEARED", label: "InfoSec Review Panel Approved", description: "Customer security team has reviewed and approved the platform architecture", sortOrder: 7, prerequisiteGateCodes: ["G3_INTEGRATIONS_MAPPED"] },
  { gateGroup: 4, gateCode: "G4_COMPLIANCE_VALIDATED", label: "Compliance Validated", description: "Regulatory and compliance requirements (SOC2, GDPR, HIPAA as applicable) confirmed met", sortOrder: 8, prerequisiteGateCodes: ["G4_INFOSEC_CLEARED"] },
  { gateGroup: 5, gateCode: "G5_CTO_SIGNED_OFF", label: "CTO/VP Engineering Win Signed-Off", description: "Technical decision-maker has formally approved the platform for procurement", sortOrder: 9, prerequisiteGateCodes: ["G4_COMPLIANCE_VALIDATED"] },
];

/**
 * Every gate code, in gate order. A `deal_technical_gates` row is written for
 * each of these on every seeded deal (completed or not) — see the seed's
 * per-deal gate expansion.
 */
export const ALL_GATE_CODES: string[] = [
  "G1_CRITERIA_LOCKED", "G1_EXECUTIVE_AGREED", "G2_WORKFLOW_VERIFIED",
  "G2_CHAMPION_DEFENSIBLE", "G3_PERFORMANCE_PASSED", "G3_INTEGRATIONS_MAPPED",
  "G4_INFOSEC_CLEARED", "G4_COMPLIANCE_VALIDATED", "G5_CTO_SIGNED_OFF",
];

export interface InterventionChecklistSeed {
  triggerPatternCode: string;
  name: string;
  steps: string[];
}

export const INTERVENTION_CHECKLISTS: InterventionChecklistSeed[] = [
  { triggerPatternCode: "PREMATURE_COMMERCIAL", name: "Premature Commercial Containment", steps: ["Pause quoting", "Schedule CTO sync", "Send architecture whitepaper", "Re-baseline close date after Gate 3"] },
  { triggerPatternCode: "DISCOUNT_TRAP", name: "Discount Trap Recovery", steps: ["Freeze discount approval", "Build services-attached business case", "Escalate to deal desk"] },
  { triggerPatternCode: "UNPROTECTED_ELEPHANT", name: "Elephant Protection", steps: ["Draft Professional Services SOW", "Confirm deployment ownership", "Add Premium Support line"] },
  { triggerPatternCode: "MISSING_STRUCTURAL_ANCHOR", name: "Anchor Reset", steps: ["Convene success-criteria workshop", "Lock Gate 1 criteria", "Obtain executive sign-off"] },
  { triggerPatternCode: "COMPETITIVE_DISPLACEMENT_STALL", name: "Displacement Acceleration", steps: ["Re-confirm the cost/pain of staying on the incumbent", "Lock a differentiated win-criterion the incumbent cannot meet", "Set a mutual close plan with a hard decision date", "Escalate to the executive sponsor"] },
];

export interface CompetitorBattlecardSeed {
  competitorName: string;
  talkingPoints: string[];
}

// Competitor battlecards (talking points surfaced in the Next-Best-Action panel).
export const COMPETITOR_BATTLECARDS: CompetitorBattlecardSeed[] = [
  { competitorName: "Quest", talkingPoints: ["Single integrated AD360 console vs Quest's stitched-together GPOADmin / Change Auditor / Recovery Manager line-up.", "Faster time-to-value and a materially lower TCO at comparable scale.", "Unified AD + M365 + Exchange auditing under one license."] },
  { competitorName: "Netwrix", talkingPoints: ["ADManager Plus adds delegated management & provisioning — Netwrix Auditor is read-only auditing.", "Real-time alerting and automated remediation, not just after-the-fact reports.", "One vendor for management, auditing, and recovery."] },
  { competitorName: "Microsoft Entra", talkingPoints: ["Deep on-prem AD management & granular auditing that native Entra tooling leaves thin.", "Works across hybrid AD + M365, not cloud-only.", "Pre-built compliance reports (SOX/HIPAA/PCI) out of the box."] },
  { competitorName: "Splunk", talkingPoints: ["Predictable per-device licensing vs Splunk's volume-based bill shock.", "Security-first SIEM with built-in compliance packs — no app sprawl to buy.", "Faster deployment and a far lower entry price for mid-market."] },
  { competitorName: "IBM QRadar", talkingPoints: ["Lower operational overhead and a gentler learning curve.", "Integrated AD threat detection via ADAudit Plus feeding Log360.", "Predictable licensing without QRadar's EPS cliff."] },
  { competitorName: "Microsoft Sentinel", talkingPoints: ["No metered cloud ingestion costs that scale unpredictably with log volume.", "On-prem and hybrid coverage, not Azure-centric.", "Bundled file-integrity & DLP via Data Security Plus."] },
];

export interface EngineThresholdSeed {
  parameterKey: string;
  parameterValue: string;
  dataType: string;
  description: string;
}

export const ENGINE_THRESHOLDS: EngineThresholdSeed[] = [
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
  { parameterKey: "playbook_overdue_grace_days", parameterValue: "3", dataType: "number", description: "Grace days added to a playbook step's expected-duration deadline before it counts as overdue (feeds PLAYBOOK_EXECUTION_GAP + the playbook_adherence score factor)" },
  // Deal Revival watch: which Closed-Lost deals are worth re-engaging
  { parameterKey: "revival_min_win_back", parameterValue: "3", dataType: "number", description: "Minimum win-back potential (1-5) for a Lost deal to be a revival candidate" },
  { parameterKey: "revival_cooloff_days", parameterValue: "60", dataType: "number", description: "Days a Lost deal must age before it surfaces as a revival candidate" },
  { parameterKey: "revival_max_age_days", parameterValue: "365", dataType: "number", description: "Days after which a Lost deal is too stale to bother reviving" },
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
  // Pipeline Flow health-score weights (Settings redesign — previously hardcoded DEFAULT_HEALTH_WEIGHTS)
  { parameterKey: "health_weight_coverage", parameterValue: "0.1667", dataType: "number", description: "Weight of the coverage component in the pipeline health score" },
  { parameterKey: "health_weight_velocity", parameterValue: "0.1667", dataType: "number", description: "Weight of the velocity component in the pipeline health score" },
  { parameterKey: "health_weight_conversion", parameterValue: "0.1667", dataType: "number", description: "Weight of the conversion component in the pipeline health score" },
  { parameterKey: "health_weight_generation", parameterValue: "0.1667", dataType: "number", description: "Weight of the generation component in the pipeline health score" },
  { parameterKey: "health_weight_age", parameterValue: "0.1667", dataType: "number", description: "Weight of the age component in the pipeline health score" },
  { parameterKey: "health_weight_attrition", parameterValue: "0.1665", dataType: "number", description: "Weight of the attrition component in the pipeline health score" },
  // Portfolio Risk Analysis constants (Settings redesign — previously hardcoded in portfolio-metrics.ts)
  { parameterKey: "portfolio_health_base_green", parameterValue: "10", dataType: "number", description: "Baseline composite risk score for a GREEN-health deal" },
  { parameterKey: "portfolio_health_base_yellow", parameterValue: "45", dataType: "number", description: "Baseline composite risk score for a YELLOW-health deal" },
  { parameterKey: "portfolio_health_base_red", parameterValue: "75", dataType: "number", description: "Baseline composite risk score for a RED-health deal" },
  { parameterKey: "portfolio_alert_bump_cap", parameterValue: "25", dataType: "number", description: "Maximum bump to a deal's composite risk score from its strongest active alert" },
  { parameterKey: "portfolio_alert_bump_per_weight", parameterValue: "0.25", dataType: "number", description: "Multiplier applied to the strongest active alert's weight to compute the risk bump" },
  { parameterKey: "portfolio_min_confidence_deals", parameterValue: "3", dataType: "number", description: "Minimum deals in a heatmap cell before it is flagged low-confidence" },
  { parameterKey: "portfolio_significant_lift", parameterValue: "1.5", dataType: "number", description: "Minimum lift over baseline for an alert-code correlation to be treated as significant" },
  { parameterKey: "portfolio_cluster_min_share", parameterValue: "0.5", dataType: "number", description: "Minimum share of a group's deals carrying a code for it to count toward a correlation cluster" },
  { parameterKey: "portfolio_cluster_min_deals", parameterValue: "3", dataType: "number", description: "Minimum deals in a group before its correlations are considered for clustering" },
  { parameterKey: "meddpicc_red_max", parameterValue: "40", dataType: "number", description: "MEDDPICC overall % below which the qualification RAG badge shows Red" },
  { parameterKey: "meddpicc_green_min", parameterValue: "75", dataType: "number", description: "MEDDPICC overall % above which the qualification RAG badge shows Green" },
];

export interface FxRateSeed {
  baseCurrency: string;
  quoteCurrency: string;
  rate: string;
}

// `asOf` is deliberately absent: it is always "today" at seed time.
export const FX_RATES: FxRateSeed[] = [
  { baseCurrency: "EUR", quoteCurrency: "USD", rate: "1.08000000" },
  { baseCurrency: "GBP", quoteCurrency: "USD", rate: "1.27000000" },
  { baseCurrency: "USD", quoteCurrency: "USD", rate: "1.00000000" },
];

export interface ScoringModelWeightSeed {
  featureId: string;
  calibratedWeight: string;
}

// Predictive scoring model calibrated weights (Settings redesign)
// All weights are stored as fractions of 1.0 (numeric(5,4) constraint) and sum to 1.0000.
export const SCORING_MODEL_WEIGHTS: ScoringModelWeightSeed[] = [
  { featureId: "gate_momentum", calibratedWeight: "0.2200" },
  { featureId: "stage_velocity", calibratedWeight: "0.1300" },
  { featureId: "services_attachment", calibratedWeight: "0.1000" },
  { featureId: "executive_alignment", calibratedWeight: "0.1300" },
  { featureId: "blocker_load", calibratedWeight: "0.0900" },
  { featureId: "deal_size_confidence", calibratedWeight: "0.0500" },
  { featureId: "close_pressure", calibratedWeight: "0.1000" },
  { featureId: "historical_win_rate", calibratedWeight: "0.0800" },
  { featureId: "playbook_adherence", calibratedWeight: "0.1000" },
];

export interface SegmentSeed {
  name: string;
  sortOrder: number;
}

export const SEGMENTS: SegmentSeed[] = [
  { name: "Enterprise", sortOrder: 1 },
  { name: "Mid-Market", sortOrder: 2 },
  { name: "Commercial", sortOrder: 3 },
];

export interface DealTypeSeed {
  name: string;
  sortOrder: number;
}

export const DEAL_TYPES: DealTypeSeed[] = [
  { name: "New Business", sortOrder: 1 },
  { name: "Expansion", sortOrder: 2 },
  { name: "Renewal", sortOrder: 3 },
  { name: "Migration", sortOrder: 4 },
];

export interface AutomationRuleTemplateSeed {
  name: string;
  description: string;
  category: string;
  triggerEvent: string;
  conditions: { field: string; operator: string; value: string }[];
  actions: { actionType: string; config: Record<string, unknown> }[];
  isBuiltin: boolean;
}

// Built-in automation rule template (Settings redesign)
export const AUTOMATION_RULE_TEMPLATES: AutomationRuleTemplateSeed[] = [
  {
    name: "Critical anomaly alert",
    description: "Notify the deal owner when a Critical-severity anomaly is detected on a deal above $50K.",
    category: "risk",
    triggerEvent: "health_changed",
    conditions: [{ field: "toStatus", operator: "eq", value: "RED" }],
    actions: [{ actionType: "in_app_notify", config: { message: "Deal health changed to RED — review immediately." } }],
    isBuiltin: true,
  },
];

/* ---------------------------------------------------------------- Playbooks */

export interface PlaybookStepSeed {
  stepOrder: number;
  stepName: string;
  recommendedAction: string;
  expectedDurationDays: number;
  isCritical: boolean;
}

export interface PlaybookSeed {
  playbookName: string;
  description: string;
  applicableStage: string;
  steps: PlaybookStepSeed[];
}

// C4: stage-keyed playbooks with ordered steps. The auto-assign engine keys off
// playbooks.applicableStage (the pipeline stage *name*) and orders steps by
// stepOrder.
export const PLAYBOOK_SEEDS: PlaybookSeed[] = [
  {
    playbookName: "Discovery / Qualification Playbook",
    description:
      "Qualify hard and confirm a champion before investing SE and deal resources.",
    applicableStage: "Discovery",
    steps: [
      { stepOrder: 1, stepName: "MEDDPICC qualification scored", recommendedAction: "Complete a MEDDPICC qualification (metrics, economic buyer, decision criteria/process, paper process, pain, champion, competition) and record the score.", expectedDurationDays: 3, isCritical: true },
      { stepOrder: 2, stepName: "Champion validated", recommendedAction: "Confirm a named internal advocate with power, access, and willingness to sell on your behalf.", expectedDurationDays: 3, isCritical: true },
      { stepOrder: 3, stepName: "Economic buyer identified & engaged", recommendedAction: "Identify who controls budget/final authority and confirm direct engagement has occurred.", expectedDurationDays: 4, isCritical: false },
      { stepOrder: 4, stepName: "Technical decision criteria mapped", recommendedAction: "Document the prospect's technical requirements, evaluation criteria, and scoring rubric.", expectedDurationDays: 4, isCritical: false },
    ],
  },
  {
    playbookName: "POC / Evaluation Playbook",
    description:
      "Drive a proof-of-concept to a clean go/no-go with locked success criteria.",
    applicableStage: "Validation",
    steps: [
      { stepOrder: 1, stepName: "Lock success criteria", recommendedAction: "Run a success-criteria workshop and get written sign-off on the PoC exit criteria (Gate 1).", expectedDurationDays: 3, isCritical: true },
      { stepOrder: 2, stepName: "Secure executive sponsor", recommendedAction: "Confirm an executive sponsor agrees on the evaluation criteria and timeline.", expectedDurationDays: 5, isCritical: true },
      { stepOrder: 3, stepName: "Demonstrate core workflow", recommendedAction: "Validate the primary use-case workflows in the customer's environment.", expectedDurationDays: 7, isCritical: false },
      { stepOrder: 4, stepName: "Demo delivered & feedback captured", recommendedAction: "Deliver a formal demo and capture structured feedback from all stakeholders.", expectedDurationDays: 3, isCritical: false },
      { stepOrder: 5, stepName: "Architecture review & sign-off", recommendedAction: "Run a technical architecture review with the prospect's infra/DevOps team (deployment design, integrations, data flows, scalability) and capture documented sign-off.", expectedDurationDays: 5, isCritical: false },
      { stepOrder: 6, stepName: "Run performance / scale test", recommendedAction: "Stress the platform under production-representative load and capture the results.", expectedDurationDays: 5, isCritical: false },
      { stepOrder: 7, stepName: "Go/no-go decision", recommendedAction: "Hold a decision review against the locked criteria and set the next-stage plan.", expectedDurationDays: 2, isCritical: true },
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
      { stepOrder: 3, stepName: "Business case / ROI delivered", recommendedAction: "Deliver a quantified business case showing the prospect's expected return, savings, or revenue impact.", expectedDurationDays: 4, isCritical: false },
      { stepOrder: 4, stepName: "Present pricing & anchor value", recommendedAction: "Walk the customer through the value-anchored pricing model and ROI.", expectedDurationDays: 3, isCritical: false },
      { stepOrder: 5, stepName: "Formal proposal / price quote delivered", recommendedAction: "Deliver the official pricing document: SKU breakdown, discount justification, term length, and payment schedule.", expectedDurationDays: 2, isCritical: true },
      { stepOrder: 6, stepName: "Lock mutual close plan", recommendedAction: "Agree a mutual action plan with a hard decision date and procurement owners.", expectedDurationDays: 3, isCritical: true },
    ],
  },
  {
    playbookName: "Procurement / Legal Playbook",
    description: "Clear legal and security review to a signed contract.",
    applicableStage: "Procurement",
    steps: [
      { stepOrder: 1, stepName: "Submit security questionnaire", recommendedAction: "Provide the completed security questionnaire and architecture docs to InfoSec.", expectedDurationDays: 5, isCritical: false },
      { stepOrder: 2, stepName: "NDA, DPA & compliance evidence provided", recommendedAction: "Ensure NDA and (for personal/regulated data) a DPA are signed, and deliver required compliance evidence (SOC 2, ISO 27001, HIPAA BAA) for InfoSec acceptance.", expectedDurationDays: 4, isCritical: false },
      { stepOrder: 3, stepName: "Resolve legal redlines", recommendedAction: "Work counsel through liability, data-processing, and SLA redlines.", expectedDurationDays: 7, isCritical: true },
      { stepOrder: 4, stepName: "Vendor registration / procurement onboarding", recommendedAction: "Complete vendor registration in the buyer's procurement system (Ariba/Coupa/Oracle) so a PO can be issued.", expectedDurationDays: 5, isCritical: false },
      { stepOrder: 5, stepName: "Purchase order received", recommendedAction: "Confirm a formal PO matching the order form/quote has been received.", expectedDurationDays: 3, isCritical: true },
      { stepOrder: 6, stepName: "Obtain final sign-off", recommendedAction: "Secure CTO/VP Engineering and procurement sign-off for execution.", expectedDurationDays: 3, isCritical: true },
    ],
  },
  {
    playbookName: "Onboarding / Handoff Playbook",
    description:
      "Convert a signed deal into a clean sales-to-delivery handoff and a confirmed go-live.",
    applicableStage: "Closed-Won",
    steps: [
      { stepOrder: 1, stepName: "Customer success handoff prepared", recommendedAction: "Complete a structured sales-to-CS handoff: deal context, key contacts, technical requirements, promised deliverables.", expectedDurationDays: 3, isCritical: true },
      { stepOrder: 2, stepName: "Onboarding kickoff scheduled", recommendedAction: "Calendar the implementation kickoff with the right attendees from both sides.", expectedDurationDays: 2, isCritical: false },
      { stepOrder: 3, stepName: "Go-live date confirmed", recommendedAction: "Confirm the go-live date explicitly with the customer, not just inferred from a timeline.", expectedDurationDays: 3, isCritical: false },
    ],
  },
];

/* -------------------------------------------------------------- Demo deals */

export interface DealBlockerSeed {
  categoryName: string;
  severityName: string;
  description: string;
}

/**
 * One row of the Decision Log — what a meeting produced, and who owes what by
 * when.
 *
 * Seeded because nothing else writes this table. The desktop Decision Log form
 * was the only creator in the whole app, so on freshly seeded data the panel
 * was permanently empty on both shells and read as broken rather than as empty.
 */
export interface DealDecisionSeed {
  decisionText: string;
  rationale?: string;
  owner: string;
  /** Defaults to `DECISION_STATUS.pending` when omitted. */
  status?: "Pending" | "In Progress" | "Completed" | "Overridden";
  /** `decided_at` = now − this many days. */
  decidedDaysAgo: number;
  /** `due_date` = today + this many days (negative = overdue, which the UI marks). */
  dueInDays?: number;
  /** `completed_at` = now − this many days. Only meaningful with status "Completed". */
  completedDaysAgo?: number;
}

/**
 * One demo deal, fully declarative.
 *
 * All lookups are by name/code; all dates are day offsets relative to seed
 * time (positive = future, negative = past). The consumer is responsible for
 * resolving ids and converting offsets to dates.
 */
export interface DealSeed {
  dealName: string;
  accountName: string;
  crmRecordUrl?: string;
  accountManager: string;
  technicalLead: string;
  stageName: string;
  /** `stage_entered_at` = now − this many days. */
  stageEnteredDaysAgo: number;
  productRevenue: string;
  pricingModelName: string;
  contractTermYears: number;
  dealCurrency: string;
  /** `expected_close_date` = today + this many days (negative = in the past). */
  expectedCloseInDays: number;
  winProbabilityPct: number;
  servicesRevenue: string;
  servicesTierName: string;
  managerStrategicBlueprint: string;
  speakerNotes?: string;
  /** Incumbent competitor; `null` where the deal faced none. */
  competitorName: string | null;
  /** Primary compliance driver (`enterprise_deals.compliance_driver_id`). */
  complianceDriverName?: string;
  /** `compliance_deadline` = today + this many days. */
  complianceDeadlineInDays?: number;
  estimatedLogSources?: number;
  lossReason?: string;
  lossArchetypeName?: string;
  /** Gate codes marked complete; every other code in ALL_GATE_CODES is written incomplete. */
  completedGateCodes: string[];
  productInterestCodes: string[];
  crossSellCodes?: string[];
  /** Extra drivers mirrored into `deal_compliance_drivers` beyond the primary one. */
  extraComplianceDriverNames?: string[];
  blockers?: DealBlockerSeed[];
  decisions?: DealDecisionSeed[];
  /** Replicate the post-mortem subscriber's `deal_memory` archive for this loss. */
  archiveAsLost?: boolean;
}

/**
 * Deals 1-4 are the hand-authored demo scenarios; deals 5-12 are additional
 * Closed-Lost deals spread across the remaining loss archetypes and several
 * competitors, so the Closed-Lost Autopsy analytics (archetype breakdown,
 * competitive-loss aggregation, loss-risk lethality map) have more than a
 * single data point to work with.
 */
export const DEAL_SEEDS: DealSeed[] = [
  // Deal 1: Premature Commercial elephant, low gate completion, no services
  {
    dealName: "Project Atlas",
    accountName: "Globex Corporation",
    crmRecordUrl: "https://crm.example.com/deals/atlas",
    accountManager: "Sarah Chen",
    technicalLead: "Marcus Webb",
    stageName: "Commercial",
    stageEnteredDaysAgo: 28,
    productRevenue: "780000",
    pricingModelName: "Annual Subscription",
    contractTermYears: 2,
    dealCurrency: "USD",
    expectedCloseInDays: 20,
    winProbabilityPct: 60,
    servicesRevenue: "0",
    servicesTierName: "None",
    managerStrategicBlueprint: "Land ADAudit Plus for the SOX audit, expand into the AD360 suite next year.",
    speakerNotes: "Champion is nervous about the SOX timeline — do not share.",
    competitorName: "Quest",
    complianceDriverName: "SOX",
    complianceDeadlineInDays: 25,
    completedGateCodes: ["G1_CRITERIA_LOCKED"],
    productInterestCodes: ["ADAUDIT_PLUS"],
    crossSellCodes: ["ADMANAGER_PLUS"],
    blockers: [
      { categoryName: "Technical", severityName: "High", description: "Performance benchmark not yet scheduled with customer infra team." },
    ],
    decisions: [
      {
        decisionText: "Scope the first phase to ADAudit Plus only.",
        rationale: "The SOX deadline will not survive a suite-wide rollout, and the audit only needs AD change reporting.",
        owner: "Sarah Chen",
        status: "Completed",
        decidedDaysAgo: 21,
        completedDaysAgo: 14,
      },
      {
        decisionText: "Book the performance benchmark with the customer's infra team.",
        rationale: "Gate 3 cannot pass without it, and it is the blocker holding the technical track.",
        owner: "Marcus Webb",
        decidedDaysAgo: 9,
        // Overdue on purpose: exercises the red past-due tone in the mobile panel.
        dueInDays: -3,
      },
    ],
  },
  // Deal 2: Healthy validation-stage deal (EUR) with services. EUR is
  // deliberate, not a stray inconsistency with the other seeded deals' USD:
  // this is the only seeded deal whose fxRate != 1, so it's the sole
  // end-to-end exercise of the EUR->USD normalization and MISSING_FX_RATE
  // paths in lib/engine/src/index.ts (see FX_RATES above and getFxRate in
  // lib/intelligence.ts). Do not flip this to USD.
  {
    dealName: "Project Beacon",
    accountName: "Initech Industries",
    crmRecordUrl: "https://crm.example.com/deals/beacon",
    accountManager: "David Park",
    technicalLead: "Priya Natarajan",
    stageName: "Validation",
    stageEnteredDaysAgo: 9,
    productRevenue: "240000",
    pricingModelName: "Multi-Year Committed",
    contractTermYears: 3,
    dealCurrency: "EUR",
    expectedCloseInDays: 75,
    winProbabilityPct: 45,
    servicesRevenue: "60000",
    servicesTierName: "Professional Services Pitched",
    managerStrategicBlueprint: "Technical win first; commercial follows once Gate 3 passes.",
    competitorName: "Splunk",
    complianceDriverName: "PCI-DSS",
    complianceDeadlineInDays: 75,
    estimatedLogSources: 1500,
    completedGateCodes: ["G1_CRITERIA_LOCKED", "G1_EXECUTIVE_AGREED", "G2_WORKFLOW_VERIFIED"],
    productInterestCodes: ["EVENTLOG_ANALYZER"],
    // Multi-driver demo: Beacon is also driven by GDPR alongside its primary PCI-DSS.
    extraComplianceDriverNames: ["GDPR"],
    crossSellCodes: ["EVENTLOG_ANALYZER", "DATA_SECURITY_PLUS", "CLOUD_SECURITY_PLUS"],
    decisions: [
      {
        decisionText: "Size the deployment for 1,500 log sources, not the 800 originally quoted.",
        rationale: "The customer's own inventory came back higher after the GDPR scope was added.",
        owner: "Priya Natarajan",
        status: "Completed",
        decidedDaysAgo: 12,
        completedDaysAgo: 8,
      },
      {
        decisionText: "Hold commercial terms until Gate 3 passes.",
        rationale: "Blueprint is technical-win-first; pricing before the workflow proof invites a discount conversation with nothing to anchor it.",
        owner: "David Park",
        status: "In Progress",
        decidedDaysAgo: 6,
        dueInDays: 14,
      },
    ],
  },
  // Deal 3: Procurement stage, near close, mega deal, stale
  {
    dealName: "Project Cobalt",
    accountName: "Umbrella Holdings",
    crmRecordUrl: "https://crm.example.com/deals/cobalt",
    accountManager: "Sarah Chen",
    technicalLead: "Marcus Webb",
    stageName: "Procurement",
    stageEnteredDaysAgo: 34,
    productRevenue: "1200000",
    pricingModelName: "Multi-Year Committed",
    contractTermYears: 3,
    dealCurrency: "USD",
    expectedCloseInDays: 12,
    winProbabilityPct: 80,
    servicesRevenue: "180000",
    servicesTierName: "Combined SOW Shared",
    managerStrategicBlueprint: "Close before quarter end; legal redlines are the last gate.",
    competitorName: "Microsoft Entra",
    complianceDriverName: "ISO 27001",
    complianceDeadlineInDays: 60,
    completedGateCodes: [
      "G1_CRITERIA_LOCKED", "G1_EXECUTIVE_AGREED", "G2_WORKFLOW_VERIFIED",
      "G2_CHAMPION_DEFENSIBLE", "G3_PERFORMANCE_PASSED",
    ],
    productInterestCodes: ["ADMANAGER_PLUS"],
    crossSellCodes: ["ADAUDIT_PLUS", "ADSELFSERVICE_PLUS", "M365_MANAGER_PLUS"],
    blockers: [
      { categoryName: "Legal", severityName: "Medium", description: "Liability cap redline pending customer counsel review." },
    ],
  },
  // Deal 4: Closed-Lost with archetype
  {
    dealName: "Project Delta",
    accountName: "Soylent Systems",
    crmRecordUrl: "https://crm.example.com/deals/delta",
    accountManager: "David Park",
    technicalLead: "Priya Natarajan",
    stageName: "Closed-Lost",
    stageEnteredDaysAgo: 60,
    productRevenue: "420000",
    pricingModelName: "Annual Subscription",
    contractTermYears: 1,
    dealCurrency: "USD",
    expectedCloseInDays: -30,
    winProbabilityPct: 0,
    servicesRevenue: "0",
    servicesTierName: "None",
    managerStrategicBlueprint: "Lost momentum after champion left mid-evaluation.",
    lossReason: "Customer champion departed; replacement favored incumbent.",
    lossArchetypeName: "Champion Departure",
    competitorName: "Okta",
    completedGateCodes: ["G1_CRITERIA_LOCKED", "G1_EXECUTIVE_AGREED"],
    productInterestCodes: ["ADSELFSERVICE_PLUS"],
    archiveAsLost: true,
  },
  // Deals 5-12: additional Closed-Lost deals
  {
    dealName: "Project Sentinel",
    accountName: "Meridian Health",
    accountManager: "Sarah Chen",
    technicalLead: "Marcus Webb",
    stageName: "Closed-Lost",
    stageEnteredDaysAgo: 45,
    productRevenue: "350000",
    pricingModelName: "Annual Subscription",
    contractTermYears: 1,
    dealCurrency: "USD",
    expectedCloseInDays: -40,
    winProbabilityPct: 0,
    servicesRevenue: "0",
    servicesTierName: "None",
    managerStrategicBlueprint: "PoC failed the log-ingestion performance benchmark.",
    lossReason: "PoC failed the log-ingestion performance benchmark.",
    lossArchetypeName: "Technical Disqualification",
    competitorName: "Splunk",
    completedGateCodes: [],
    productInterestCodes: ["EVENTLOG_ANALYZER"],
    archiveAsLost: true,
  },
  {
    dealName: "Project Vantage",
    accountName: "Bluewave Logistics",
    accountManager: "Sarah Chen",
    technicalLead: "Marcus Webb",
    stageName: "Closed-Lost",
    stageEnteredDaysAgo: 52,
    productRevenue: "610000",
    pricingModelName: "Annual Subscription",
    contractTermYears: 1,
    dealCurrency: "USD",
    expectedCloseInDays: -47,
    winProbabilityPct: 0,
    servicesRevenue: "0",
    servicesTierName: "Professional Services Pitched",
    managerStrategicBlueprint: "Customer froze all new software spend for the fiscal year.",
    lossReason: "Customer froze all new software spend for the fiscal year.",
    lossArchetypeName: "Budget Freeze",
    competitorName: "Netwrix",
    completedGateCodes: ["G1_CRITERIA_LOCKED", "G1_EXECUTIVE_AGREED", "G2_WORKFLOW_VERIFIED"],
    productInterestCodes: ["ADMANAGER_PLUS"],
    archiveAsLost: true,
  },
  {
    dealName: "Project Halcyon",
    accountName: "Ferrous Metals Co",
    accountManager: "Sarah Chen",
    technicalLead: "Marcus Webb",
    stageName: "Closed-Lost",
    stageEnteredDaysAgo: 38,
    productRevenue: "275000",
    pricingModelName: "Annual Subscription",
    contractTermYears: 1,
    dealCurrency: "USD",
    expectedCloseInDays: -33,
    winProbabilityPct: 0,
    servicesRevenue: "0",
    servicesTierName: "None",
    managerStrategicBlueprint: "Renewed the incumbent Entra ID contract instead of switching.",
    lossReason: "Renewed the incumbent Entra ID contract instead of switching.",
    lossArchetypeName: "Loss to Incumbent",
    competitorName: "Microsoft Entra",
    completedGateCodes: ["G1_CRITERIA_LOCKED"],
    productInterestCodes: ["ADSELFSERVICE_PLUS"],
    archiveAsLost: true,
  },
  {
    dealName: "Project Ember",
    accountName: "Coral Bay Retail",
    accountManager: "Sarah Chen",
    technicalLead: "Marcus Webb",
    stageName: "Closed-Lost",
    stageEnteredDaysAgo: 21,
    productRevenue: "190000",
    pricingModelName: "Annual Subscription",
    contractTermYears: 1,
    dealCurrency: "USD",
    expectedCloseInDays: -16,
    winProbabilityPct: 0,
    servicesRevenue: "0",
    servicesTierName: "None",
    managerStrategicBlueprint: "Missing SOC 2 Type II attestation disqualified us in security review.",
    lossReason: "Missing SOC 2 Type II attestation disqualified us in security review.",
    lossArchetypeName: "Compliance Gap",
    competitorName: "SailPoint",
    completedGateCodes: [],
    productInterestCodes: ["ADAUDIT_PLUS"],
    archiveAsLost: true,
  },
  {
    dealName: "Project Wraith",
    accountName: "Nimbus Cloud Services",
    accountManager: "Sarah Chen",
    technicalLead: "Marcus Webb",
    stageName: "Closed-Lost",
    stageEnteredDaysAgo: 70,
    productRevenue: "500000",
    pricingModelName: "Annual Subscription",
    contractTermYears: 1,
    dealCurrency: "USD",
    expectedCloseInDays: -65,
    winProbabilityPct: 0,
    servicesRevenue: "0",
    servicesTierName: "None",
    managerStrategicBlueprint: "Customer indefinitely deferred the initiative; no vendor selected.",
    lossReason: "Customer indefinitely deferred the initiative; no vendor selected.",
    lossArchetypeName: "No Decision",
    competitorName: null,
    completedGateCodes: ["G1_CRITERIA_LOCKED", "G1_EXECUTIVE_AGREED"],
    productInterestCodes: ["DATA_SECURITY_PLUS"],
    archiveAsLost: true,
  },
  {
    dealName: "Project Solace",
    accountName: "Ironclad Manufacturing",
    accountManager: "Sarah Chen",
    technicalLead: "Marcus Webb",
    stageName: "Closed-Lost",
    stageEnteredDaysAgo: 33,
    productRevenue: "430000",
    pricingModelName: "Annual Subscription",
    contractTermYears: 1,
    dealCurrency: "USD",
    expectedCloseInDays: -28,
    winProbabilityPct: 0,
    servicesRevenue: "0",
    servicesTierName: "None",
    managerStrategicBlueprint: "Failed to demonstrate required OT-network log coverage.",
    lossReason: "Failed to demonstrate required OT-network log coverage.",
    lossArchetypeName: "Technical Disqualification",
    competitorName: "IBM QRadar",
    completedGateCodes: [],
    productInterestCodes: ["CLOUD_SECURITY_PLUS"],
    archiveAsLost: true,
  },
  {
    dealName: "Project Meridian Rise",
    accountName: "Northgate Financial",
    accountManager: "Sarah Chen",
    technicalLead: "Marcus Webb",
    stageName: "Closed-Lost",
    stageEnteredDaysAgo: 95,
    productRevenue: "720000",
    pricingModelName: "Annual Subscription",
    contractTermYears: 1,
    dealCurrency: "USD",
    expectedCloseInDays: -90,
    winProbabilityPct: 0,
    servicesRevenue: "0",
    servicesTierName: "Combined SOW Shared",
    managerStrategicBlueprint: "Long-standing Quest relationship made switching too costly to justify.",
    lossReason: "Long-standing Quest relationship made switching too costly to justify.",
    lossArchetypeName: "Loss to Incumbent",
    competitorName: "Quest",
    completedGateCodes: ["G1_CRITERIA_LOCKED", "G1_EXECUTIVE_AGREED", "G2_WORKFLOW_VERIFIED", "G2_CHAMPION_DEFENSIBLE"],
    productInterestCodes: ["ADMANAGER_PLUS"],
    archiveAsLost: true,
  },
  {
    dealName: "Project Tundra",
    accountName: "Alpine Freight",
    accountManager: "Sarah Chen",
    technicalLead: "Marcus Webb",
    stageName: "Closed-Lost",
    stageEnteredDaysAgo: 40,
    productRevenue: "260000",
    pricingModelName: "Annual Subscription",
    contractTermYears: 1,
    dealCurrency: "USD",
    expectedCloseInDays: -35,
    winProbabilityPct: 0,
    servicesRevenue: "0",
    servicesTierName: "None",
    managerStrategicBlueprint: "Internal champion left the company; successor restarted the evaluation with Okta.",
    lossReason: "Internal champion left the company; successor restarted the evaluation with Okta.",
    lossArchetypeName: "Champion Departure",
    competitorName: "Okta",
    completedGateCodes: ["G1_CRITERIA_LOCKED"],
    productInterestCodes: ["ADSELFSERVICE_PLUS"],
    archiveAsLost: true,
  },
];
