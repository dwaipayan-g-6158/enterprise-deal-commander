// Risk Engine v2.0 — shared types for the pure, isomorphic dimensional
// scoring (Layer 1) and synthesis (Layer 3) modules.
//
// These types contain NO behavior and NO temporal computation — every
// time-derived value (daysToClose, daysInStage, daysSinceLastGate, …) is a
// pre-computed number supplied by the caller, mirroring the rest of the engine.

export type RiskLevel = "LOW" | "MODERATE" | "ELEVATED" | "HIGH";

export type DimensionName =
  | "Technical Readiness"
  | "Commercial Alignment"
  | "Stakeholder Coverage"
  | "Temporal Pressure"
  | "Financial Structure"
  | "Competitive Exposure"
  | "Engagement Vitality";

export interface DimensionSignal {
  factor: string;
  rawScore: number;
  weight: number;
}

export interface DimensionFnResult {
  name: DimensionName;
  score: number;
  signals: DimensionSignal[];
  /**
   * `false` means **"there is no signal here at all"** — NOT "the signal is low"
   * and NOT "we could not assess it precisely". A non-assessable dimension is
   * dropped from BOTH the numerator and the denominator of `computeComposite`'s
   * weighted mean, gets its pattern amplification zeroed by `applyAmplification`,
   * and is filtered out of `topDrivers`. In other words: it contributes NOTHING,
   * and its `score` is a display-only placeholder.
   *
   * So a dimension that has measured a real gap must be `assessable: true` even
   * when the underlying record set is empty — an empty stakeholder roster past
   * Discovery IS a finding (score 60), not an absence of one. Marking such a
   * measurement `false` makes deleting risk-relevant data LOWER the composite
   * risk score (the C4 bug). Today only `scoreCompetitiveExposure` returns
   * `false`, for an untracked competitor set.
   */
  assessable: boolean;
}

export interface DimensionScore extends DimensionFnResult {
  baseScore: number;
  amplification: number;
  weight: number;
  contributingPatterns: string[];
}

export interface RiskDriver {
  dimension: DimensionName;
  factor: string;
  impact: number;
}

export type ActionPriority = "BLOCKER" | "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface RecommendedAction {
  source: "STAGE_GUARDRAIL" | "PATTERN" | "DIMENSION";
  priority: ActionPriority;
  action: string;
  patternCode: string | null;
  dimension: DimensionName | null;
}

export interface UnifiedRisk {
  compositeScore: number;
  riskLevel: RiskLevel;
  dimensions: DimensionScore[];
  topDrivers: RiskDriver[];
  recommendedActions: RecommendedAction[];
}

export interface StakeholderInput {
  name: string;
  sentiment: string;
  isDecisionMaker: boolean;
}

/** winRate is 0–1 and represents OUR historical win rate against this competitor. */
export interface CompetitorInput {
  name: string;
  status: string;
  winRate: number | null;
}

export interface RiskV2Weights {
  technical: number;
  commercial: number;
  stakeholder: number;
  temporal: number;
  financial: number;
  competitive: number;
  engagement: number;
}

export interface RiskLevelBoundaries {
  lowMax: number;
  moderateMax: number;
  elevatedMax: number;
}
