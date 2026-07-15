// Pure, DB-free derivation of tunable engine parameters from the merged
// `engine_thresholds` object. No file here may import `@workspace/db` — the
// DB-touching orchestration files (intelligence.ts, scoring.ts, portfolio.ts,
// routes/v2/analytics.ts) load thresholds and call into these functions.
import type {
  EngineThresholds,
  RiskV2Weights,
  RiskLevelBoundaries,
  HealthWeights,
} from "@workspace/engine";
import { DEFAULT_SCORING_WEIGHTS } from "@workspace/engine";
import { DEFAULT_PORTFOLIO_CONFIG, type PortfolioMetricsConfig } from "./portfolio-metrics";

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

/** Derive the Pipeline Flow health-score weights from the merged thresholds. */
export function deriveHealthWeights(thresholds: EngineThresholds): HealthWeights {
  return {
    coverage: num(thresholds, "health_weight_coverage", 1 / 6),
    velocity: num(thresholds, "health_weight_velocity", 1 / 6),
    conversion: num(thresholds, "health_weight_conversion", 1 / 6),
    generation: num(thresholds, "health_weight_generation", 1 / 6),
    age: num(thresholds, "health_weight_age", 1 / 6),
    attrition: num(thresholds, "health_weight_attrition", 1 / 6),
  };
}

/** Derive the Portfolio Risk Analysis constants from the merged thresholds. */
export function derivePortfolioConfig(thresholds: EngineThresholds): PortfolioMetricsConfig {
  return {
    healthBase: {
      GREEN: num(thresholds, "portfolio_health_base_green", DEFAULT_PORTFOLIO_CONFIG.healthBase.GREEN),
      YELLOW: num(thresholds, "portfolio_health_base_yellow", DEFAULT_PORTFOLIO_CONFIG.healthBase.YELLOW),
      RED: num(thresholds, "portfolio_health_base_red", DEFAULT_PORTFOLIO_CONFIG.healthBase.RED),
    },
    alertBumpCap: num(thresholds, "portfolio_alert_bump_cap", DEFAULT_PORTFOLIO_CONFIG.alertBumpCap),
    alertBumpPerWeight: num(thresholds, "portfolio_alert_bump_per_weight", DEFAULT_PORTFOLIO_CONFIG.alertBumpPerWeight),
    minConfidenceDeals: num(thresholds, "portfolio_min_confidence_deals", DEFAULT_PORTFOLIO_CONFIG.minConfidenceDeals),
    significantLift: num(thresholds, "portfolio_significant_lift", DEFAULT_PORTFOLIO_CONFIG.significantLift),
    clusterMinShare: num(thresholds, "portfolio_cluster_min_share", DEFAULT_PORTFOLIO_CONFIG.clusterMinShare),
    clusterMinDeals: num(thresholds, "portfolio_cluster_min_deals", DEFAULT_PORTFOLIO_CONFIG.clusterMinDeals),
  };
}

/**
 * Merge calibrated scoring weights (from `scoring_model_weights`, stored as
 * fractions of 1 — see Task 2's seed) over the engine's default weights
 * (which are on a 0-100 scale — see DEFAULT_SCORING_WEIGHTS). Only known
 * factor ids are honored; anything else is ignored so a stray/misspelled row
 * can never silently vanish a factor from scoring.
 */
export function mergeScoringWeights(
  rows: { featureId: string; calibratedWeight: number }[],
): Record<string, number> {
  const scaledDefaults: Record<string, number> = Object.fromEntries(
    Object.entries(DEFAULT_SCORING_WEIGHTS).map(([id, w]) => [id, w / 100]),
  );
  const merged: Record<string, number> = { ...scaledDefaults };
  for (const row of rows) {
    if (row.featureId in merged && Number.isFinite(row.calibratedWeight)) {
      merged[row.featureId] = row.calibratedWeight;
    }
  }
  return merged;
}
