// Pure, DB-free derivation of tunable engine parameters from the merged
// `engine_thresholds` object. No file here may import `@workspace/db` — the
// DB-touching orchestration files (intelligence.ts, scoring.ts, portfolio.ts,
// routes/v2/analytics.ts) load thresholds and call into these functions.
import type {
  EngineThresholds,
  RiskV2Weights,
  RiskLevelBoundaries,
} from "@workspace/engine";

/** Read a numeric tunable from the merged thresholds, falling back when absent/non-numeric. */
export function num(
  thresholds: EngineThresholds,
  key: string,
  fallback: number,
): number {
  const v = thresholds[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Derive the v2 risk dimension weights from the merged thresholds (all 7, DB-backed). */
export function deriveRiskWeights(thresholds: EngineThresholds): RiskV2Weights {
  return {
    technical: num(thresholds, "risk_weight_technical", 0.2),
    commercial: num(thresholds, "risk_weight_commercial", 0.15),
    stakeholder: num(thresholds, "risk_weight_stakeholder", 0.15),
    temporal: num(thresholds, "risk_weight_temporal", 0.15),
    financial: num(thresholds, "risk_weight_financial", 0.1),
    competitive: num(thresholds, "risk_weight_competitive", 0.1),
    engagement: num(thresholds, "risk_weight_engagement", 0.15),
  };
}

/** Derive the v2 risk-level boundaries from the merged thresholds. */
export function deriveRiskBoundaries(thresholds: EngineThresholds): RiskLevelBoundaries {
  return {
    lowMax: num(thresholds, "risk_level_low_max", 25),
    moderateMax: num(thresholds, "risk_level_moderate_max", 50),
    elevatedMax: num(thresholds, "risk_level_elevated_max", 75),
  };
}
