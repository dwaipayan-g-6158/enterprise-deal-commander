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
