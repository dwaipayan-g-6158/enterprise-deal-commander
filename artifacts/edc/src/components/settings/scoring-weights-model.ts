// Pure helpers for scoring-weights-settings.tsx (F9), split out so the
// "which factors actually changed" logic is unit-testable without rendering
// the component. NOTE: formatNum is imported via a relative path, not the
// "@/" alias — this package's vitest.config.ts is a standalone config with
// no resolve.alias, so a value import through "@/..." would fail to resolve
// at test runtime even though tsc is fine with it (see the same note in
// components/cockpit/deal-form-helpers.ts).
import { formatNum } from "../../lib/format";

export interface WeightRow {
  featureId: string;
  weight: number; // fraction of 1.0, as loaded from the server
}

export interface ChangedWeight {
  feature_id: string;
  weight: number; // fraction of 1.0, ready for the PUT body
}

/**
 * Fraction (0..1) -> percentage string for display/editing, with real
 * precision instead of the old `.toFixed(0)` — which rounded 0.125 (12.5%)
 * down to "13" and silently discarded the fraction. Reuses formatNum's
 * round-to-2-decimals-and-trim-trailing-zeros behavior, so a whole number
 * still reads as "50" rather than "50.00".
 */
export function weightToPctString(weight: number): string {
  return formatNum(weight * 100);
}

/**
 * The subset of `rows` whose locally-edited `pct` value actually differs
 * from the value loaded from the server, converted back into PUT-ready
 * `{ feature_id, weight }` pairs. Editing one factor must not silently
 * rewrite (and append a fresh calibration-history row for) the other eight —
 * PUT /v2/config/scoring-weights is append-only history where "latest wins"
 * per factor, so sending an unchanged factor back manufactures a bogus new
 * history entry for it even though nothing changed.
 *
 * This is the SAME per-factor comparison the "is anything dirty" check
 * needs (`selectChangedWeights(...).length > 0`) — sharing one function
 * means the Save button's enabled state and the actual payload can never
 * drift out of sync the way separately-maintained boolean + filter logic
 * could.
 */
export function selectChangedWeights(
  rows: WeightRow[],
  pct: Record<string, string>,
): ChangedWeight[] {
  return rows
    .filter((r) => {
      const edited = pct[r.featureId];
      return edited !== undefined && edited !== weightToPctString(r.weight);
    })
    .map((r) => ({
      feature_id: r.featureId,
      weight: (Number(pct[r.featureId]) || 0) / 100,
    }));
}
