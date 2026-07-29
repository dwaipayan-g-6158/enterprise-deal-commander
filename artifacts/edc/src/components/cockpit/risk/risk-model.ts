// RiskLevel, classifyRisk, RISK_LEVEL_LABEL, RISK_LEVEL_CLASS and
// healthToRiskLevel moved to lib/semantic-colors.ts (the single source of
// truth for risk/health/outcome colour, alongside the terminal-outcome and
// chart-form representations) and re-exported here so existing importers of
// this module keep their import path unchanged.
//
// Relative, not "@/" — this module is value-imported by risk-model.test.ts,
// which runs under vitest's standalone config (no resolve.alias); see the
// same note in close-timeline-model.ts.
export {
  classifyRisk,
  RISK_LEVEL_LABEL,
  RISK_LEVEL_CLASS,
  healthToRiskLevel,
} from "../../../lib/semantic-colors";
import type { RiskLevel } from "../../../lib/semantic-colors";
export type { RiskLevel };

export interface RiskDimension {
  name: string;
  score: number;
  baseScore?: number;
  amplification?: number;
  weight?: number;
  assessable?: boolean;
  contributingPatterns?: string[];
}
export interface RiskDriver { dimension: string; factor: string; impact: number }
export type RiskActionPriority = "BLOCKER" | "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export interface RiskAction {
  source?: "STAGE_GUARDRAIL" | "PATTERN" | "DIMENSION";
  priority: RiskActionPriority;
  action: string;
  dimension?: string | null;
  patternCode?: string | null;
}
export interface DealRisk {
  compositeScore: number;
  riskLevel: RiskLevel;
  riskLabel?: string;
  dimensions?: RiskDimension[];
  topDrivers?: RiskDriver[];
  recommendedActions?: RiskAction[];
}

/** Tolerant accessor: reads top-level `risk` or `governance.risk`; null if absent/malformed. */
export function extractDealRisk(intel: unknown): DealRisk | null {
  if (!intel || typeof intel !== "object") return null;
  const obj = intel as { risk?: unknown; governance?: { risk?: unknown } };
  const raw = obj.risk ?? obj.governance?.risk;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<DealRisk>;
  if (typeof r.compositeScore !== "number" || !r.riskLevel) return null;
  return r as DealRisk;
}

export const ACTION_PRIORITY_RANK: Record<RiskActionPriority, number> = {
  BLOCKER: 0, CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4,
};

export function sortDimensionsDesc(dims: RiskDimension[]): RiskDimension[] {
  return [...dims].sort((a, b) => b.score - a.score);
}
export function sortActions(actions: RiskAction[]): RiskAction[] {
  return [...actions].sort((a, b) => ACTION_PRIORITY_RANK[a.priority] - ACTION_PRIORITY_RANK[b.priority]);
}
