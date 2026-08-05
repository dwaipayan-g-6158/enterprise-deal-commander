import { parseNLC } from "@workspace/engine";
import type { Deal } from "@workspace/api-client-react";

/**
 * Natural-language command matching, shared by the desktop command palette
 * and the mobile Commander sheet.
 *
 * Pure and dependency-free so both surfaces answer "red deals above $1M" with
 * the same set. It lived inline in command-palette.tsx first; a second copy in
 * the mobile shell is exactly the kind of duplicate that drifts apart one
 * operator at a time.
 */

/** A parsed condition, narrowed to the fields this matcher understands. */
interface NlcCondition {
  field: string;
  operator: string;
  value: unknown;
}

/** Below this length a query is still being typed and parses to noise. */
const MIN_QUERY_LENGTH = 5;

/** The conditions in `query`, or an empty list when it isn't a command. */
export function parseNlcConditions(query: string): NlcCondition[] {
  if (query.trim().length <= MIN_QUERY_LENGTH) return [];
  const parsed = parseNLC(query);
  if (!parsed) return [];
  return parsed.type === "LIST" || parsed.type === "COUNT" ? parsed.conditions : [];
}

function matchesCondition(deal: Deal, condition: NlcCondition): boolean {
  if (condition.field === "health") return deal.healthStatus === condition.value;

  if (condition.field === "tcv") {
    const threshold = Number(condition.value);
    const tcv = deal.calculatedTCV ?? 0;
    switch (condition.operator) {
      case "gt":
        return tcv > threshold;
      case "lt":
        return tcv < threshold;
      case "gte":
        return tcv >= threshold;
      case "lte":
        return tcv <= threshold;
      default:
        return tcv === threshold;
    }
  }

  if (condition.field === "stage") {
    return String(deal.salesStage ?? "").toLowerCase() === String(condition.value).toLowerCase();
  }

  // An unrecognized field must not narrow the result set — a condition this
  // matcher can't evaluate shouldn't silently filter everything out.
  return true;
}

/**
 * Deals satisfying every condition.
 *
 * Callers pass the live pipeline, not the full archive: a question like "red
 * deals above $1M" is about deals still in play, even when the surrounding
 * name search deliberately includes archived ones.
 */
export function matchNlcDeals(deals: Deal[], conditions: NlcCondition[]): Deal[] {
  if (conditions.length === 0) return [];
  return deals.filter((deal) => conditions.every((c) => matchesCondition(deal, c)));
}

/** "health eq RED AND tcv gt 1000000" — shown so the reader can check the parse. */
export function describeNlcConditions(conditions: NlcCondition[]): string {
  return conditions.map((c) => `${c.field} ${c.operator} ${c.value}`).join(" AND ");
}
