export type RiskLevel = "LOW" | "MODERATE" | "ELEVATED" | "HIGH";

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
  riskColor?: string;
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

export function classifyRisk(score: number): RiskLevel {
  if (score <= 25) return "LOW";
  if (score <= 50) return "MODERATE";
  if (score <= 75) return "ELEVATED";
  return "HIGH";
}

export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  LOW: "Low Risk", MODERATE: "Moderate Risk", ELEVATED: "Elevated Risk", HIGH: "High Risk",
};

/** Theme-aware Tailwind utility classes per level (named utilities + dark variants; no raw hex). */
export const RISK_LEVEL_CLASS: Record<RiskLevel, { text: string; bg: string; border: string; fill: string; dot: string }> = {
  LOW:      { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/12", border: "border-emerald-500/40", fill: "bg-emerald-500", dot: "bg-emerald-500" },
  MODERATE: { text: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-500/12",   border: "border-amber-500/40",   fill: "bg-amber-500",   dot: "bg-amber-500" },
  ELEVATED: { text: "text-orange-600 dark:text-orange-400",   bg: "bg-orange-500/12",  border: "border-orange-500/40",  fill: "bg-orange-500",  dot: "bg-orange-500" },
  HIGH:     { text: "text-red-600 dark:text-red-400",         bg: "bg-red-500/12",     border: "border-red-500/40",     fill: "bg-red-500",     dot: "bg-red-500" },
};

/** Legacy 3-state health → a risk level, for fallback rendering when `risk` is absent. */
export function healthToRiskLevel(h: "GREEN" | "YELLOW" | "RED"): RiskLevel {
  return h === "RED" ? "HIGH" : h === "YELLOW" ? "MODERATE" : "LOW";
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
