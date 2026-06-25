// Custom Risk Pattern evaluator (V2 F10) — pure & isomorphic.
//
// Commander-defined patterns are a list of conditions over a resolved
// deal-intelligence object. ALL conditions must hold (AND) for the pattern to
// fire. Fired patterns render an alert message from a {{placeholder}} template.

export type CustomOperator =
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "is_null"
  | "is_not_null";

export interface CustomCondition {
  fieldPath: string;
  operator: CustomOperator;
  comparisonValue: string;
  sortOrder: number;
}

export interface CustomPattern {
  id: string;
  patternName: string;
  severity: "RED" | "YELLOW";
  weight: number;
  alertMessageTemplate: string;
  conditions: CustomCondition[];
}

export interface CustomAlert {
  code: string;
  severity: "RED" | "YELLOW";
  weight: number;
  message: string;
  isCustom: true;
  patternName: string;
}

/** Resolve a dotted path (e.g. "financials.calculatedTCV") against an object. */
export function resolveFieldPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

export function evaluateCondition(
  fieldValue: unknown,
  operator: CustomOperator,
  comparison: string,
): boolean {
  switch (operator) {
    case "is_null":
      return fieldValue == null;
    case "is_not_null":
      return fieldValue != null;
    case "contains":
      return String(fieldValue ?? "").toLowerCase().includes(comparison.toLowerCase());
    case "not_contains":
      return !String(fieldValue ?? "").toLowerCase().includes(comparison.toLowerCase());
    default:
      break;
  }

  const lhs = asNumber(fieldValue);
  const rhs = asNumber(comparison);
  const numeric = lhs != null && rhs != null;

  switch (operator) {
    case "gt":
      return numeric ? lhs! > rhs! : false;
    case "lt":
      return numeric ? lhs! < rhs! : false;
    case "gte":
      return numeric ? lhs! >= rhs! : false;
    case "lte":
      return numeric ? lhs! <= rhs! : false;
    case "eq":
      return numeric
        ? lhs! === rhs!
        : String(fieldValue ?? "").toLowerCase() === comparison.toLowerCase();
    case "neq":
      return numeric
        ? lhs! !== rhs!
        : String(fieldValue ?? "").toLowerCase() !== comparison.toLowerCase();
    default:
      return false;
  }
}

/** Replace {{key}} tokens (dotted paths supported) with values from `data`. */
export function renderTemplate(template: string, data: unknown): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = resolveFieldPath(data, key);
    return v == null ? "" : String(v);
  });
}

export function evaluateCustomPatterns(
  patterns: CustomPattern[],
  deal: unknown,
): CustomAlert[] {
  const alerts: CustomAlert[] = [];
  for (const pattern of patterns) {
    if (pattern.conditions.length === 0) continue;
    const allMet = pattern.conditions.every((c) =>
      evaluateCondition(resolveFieldPath(deal, c.fieldPath), c.operator, c.comparisonValue),
    );
    if (allMet) {
      alerts.push({
        code: `CUSTOM_${pattern.id}`,
        severity: pattern.severity,
        weight: pattern.weight,
        message: renderTemplate(pattern.alertMessageTemplate, deal),
        isCustom: true,
        patternName: pattern.patternName,
      });
    }
  }
  return alerts;
}
