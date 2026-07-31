// Pure, DB-free bounded validation for PUT /lookups/engine-thresholds writes.
// No file here may import `@workspace/db` — this must be unit-testable
// without a database (matches the convention documented in
// engine-config.ts's docstring). Scope is deliberately narrow: five named
// rule categories, not a general schema rewrite. See task-12-brief.md.
export interface ThresholdUpdateItem {
  parameter_key: string;
  parameter_value: string;
}
export interface CurrentThresholdRow {
  parameterValue: string;
  dataType: string;
}
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const POSITIVE_WEIGHT_KEYS = [
  "risk_weight_technical", "risk_weight_commercial", "risk_weight_stakeholder",
  "risk_weight_temporal", "risk_weight_financial", "risk_weight_competitive",
  "risk_weight_engagement",
];
const UNIT_FRACTION_KEYS = ["low_attach_rate_threshold"];
const PERCENT_KEYS = ["gate_completion_warn_pct", "momentum_min_gate_pct", "meddpicc_red_max", "meddpicc_green_min"];
const BOUNDARY_KEYS = ["risk_level_low_max", "risk_level_moderate_max", "risk_level_elevated_max"] as const;

function toFinite(v: string): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function validateThresholdUpdate(
  updates: ThresholdUpdateItem[],
  current: Map<string, CurrentThresholdRow>,
): ValidationResult {
  const byKey = new Map(updates.map((u) => [u.parameter_key, u.parameter_value]));

  for (const key of POSITIVE_WEIGHT_KEYS) {
    const v = byKey.get(key);
    if (v === undefined) continue;
    const n = toFinite(v);
    if (n === null || n <= 0) return { valid: false, error: `${key} must be a positive number, got ${v}` };
  }

  for (const key of UNIT_FRACTION_KEYS) {
    const v = byKey.get(key);
    if (v === undefined) continue;
    const n = toFinite(v);
    if (n === null || n < 0 || n > 1) return { valid: false, error: `${key} must be between 0 and 1, got ${v}` };
  }

  for (const key of PERCENT_KEYS) {
    const v = byKey.get(key);
    if (v === undefined) continue;
    const n = toFinite(v);
    if (n === null || n < 0 || n > 100) return { valid: false, error: `${key} must be between 0 and 100, got ${v}` };
  }

  const resolvedBoundary = (key: string): number | null => {
    const v = byKey.get(key) ?? current.get(key)?.parameterValue;
    return v === undefined ? null : toFinite(v);
  };
  const [lowMax, moderateMax, elevatedMax] = BOUNDARY_KEYS.map(resolvedBoundary);
  if (BOUNDARY_KEYS.some((k) => byKey.has(k))) {
    if (lowMax === null || moderateMax === null || elevatedMax === null) {
      return { valid: false, error: "risk_level boundaries must all be numeric" };
    }
    if (!(0 <= lowMax && lowMax < moderateMax && moderateMax < elevatedMax && elevatedMax <= 100)) {
      return { valid: false, error: `risk_level boundaries must satisfy 0 <= low_max(${lowMax}) < moderate_max(${moderateMax}) < elevated_max(${elevatedMax}) <= 100` };
    }
  }

  const resolvedMeddpicc = (key: string): number | null => {
    const v = byKey.get(key) ?? current.get(key)?.parameterValue;
    return v === undefined ? null : toFinite(v);
  };
  if (byKey.has("meddpicc_red_max") || byKey.has("meddpicc_green_min")) {
    const redMax = resolvedMeddpicc("meddpicc_red_max");
    const greenMin = resolvedMeddpicc("meddpicc_green_min");
    if (redMax !== null && greenMin !== null && !(redMax < greenMin)) {
      return { valid: false, error: `meddpicc_red_max(${redMax}) must be less than meddpicc_green_min(${greenMin})` };
    }
  }

  for (const u of updates) {
    const existing = current.get(u.parameter_key);
    if (existing?.dataType === "number" && toFinite(u.parameter_value) === null) {
      return { valid: false, error: `${u.parameter_key} expects a numeric value, got ${u.parameter_value}` };
    }
  }

  return { valid: true };
}
