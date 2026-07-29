// Shared pure helpers for create-deal-sheet.tsx / edit-deal-sheet.tsx. The two
// sheets are copy-paste twins with no shared component (see each file's own
// header), so anything with real logic — as opposed to markup — lives here
// once instead of being duplicated a third and fourth time.
//
// NOTE: compactCurrency is imported via a relative path, not the "@/" alias —
// this file's vitest config (vitest.config.ts) is a standalone config with no
// resolve.alias, so a value import through "@/..." would fail to resolve at
// test runtime even though tsc (which does read tsconfig `paths`) would be
// fine with it. Mirrors the same note in close-timeline-model.ts.
import { PRICING_MODEL } from "@workspace/engine";
import { compactCurrency } from "../dashboard/widgets/_shared";

/** True when `id` resolves (via `models`) to the Perpetual License row. `false`
 *  while the pricing-models lookup is still loading (`models` undefined) or
 *  `id` is unset — never throws. */
export function isPerpetualModel(
  models: { id: number; modelName: string }[] | undefined,
  id: number | undefined,
): boolean {
  if (!models || !id) return false;
  return models.find((m) => m.id === id)?.modelName === PRICING_MODEL.PERPETUAL;
}

/** Round and clamp into the server's `contract_term_years` contract (integer,
 *  1–10). Every non-finite input (NaN from an emptied `valueAsNumber` field,
 *  Infinity, a stray string) collapses to `1` rather than reaching the API. */
export function clampTerm(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 1;
  return Math.min(10, Math.max(1, n));
}

/** Clamp into the server's `product_revenue`/`services_revenue` contract
 *  (number, minimum 0). Every non-finite input (NaN from an emptied
 *  `valueAsNumber` field, Infinity, a stray string) collapses to `0` rather
 *  than reaching the API as `null`, which the generated Zod body rejects
 *  (`.optional()`, not `.nullish()`). Mirrors clampTerm above. */
export function clampRevenue(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}

/** Live "= $10K" style hint for a revenue field. `null` (render nothing) for
 *  empty/invalid input, exactly `0`, and anything under 1000 — below that
 *  threshold the compact form just restates what was typed (`$400`). */
export function revenueHint(n: unknown, currency = "USD"): string | null {
  const num = Number(n);
  if (!Number.isFinite(num) || Math.abs(num) < 1000) return null;
  return `= ${compactCurrency(num, currency)}`;
}
