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
//
// The `Deal` import below is type-only and so is erased before runtime — the
// resolution caveat above applies to value imports.
import type { Deal } from "@workspace/api-client-react";
import { compactCurrency } from "../dashboard/widgets/_shared";

/** The Edit Deal sheet's form shape. Lives here, not in the sheet, so
 *  `dealToFormState` below can be the one place a deal is turned into form
 *  values — the sheet needs that mapping twice (at mount, and again every time
 *  it re-opens) and the two must not drift. */
export interface DealFormState {
  deal_name: string;
  account_name: string;
  crm_record_url: string;
  account_manager: string;
  technical_lead: string;
  sales_stage_id: number;
  pricing_model_id: number;
  services_tier_id: number;
  product_revenue: number;
  services_revenue: number;
  contract_term_years: number;
  is_perpetual_term: boolean;
  expected_close_date: string;
  landed_at: string;
  win_probability_pct: number | "";
  committed: boolean;
  manager_strategic_blueprint: string;
  speaker_notes: string;
  competitor_id: number | "";
  estimated_log_sources: number | "";
}

/** `setValueAs` for the optional numeric inputs (Win %, Est. Log Sources),
 *  whose form type is `number | ""`.
 *
 *  Not `valueAsNumber: true`, which is what these used to be: that turns a
 *  cleared box into `NaN`, not `""`. The declared type then lies, `buildPayload`'s
 *  `=== ""` test never matches (it only ever emitted null because JSON.stringify
 *  renders NaN as null), and — since `NaN !== NaN` — any comparison against a
 *  form snapshot is false forever, which silently disabled the
 *  server-caught-up handoff in the Edit sheet. */
export function emptyOrNumber(raw: unknown): number | "" {
  if (raw === "" || raw == null) return "";
  const n = Number(raw);
  return Number.isNaN(n) ? "" : n;
}

/** Field-by-field equality for two form states. Every value is a string, number
 *  or boolean, so a shallow compare is exact — used to tell "the server has
 *  caught up with the edit we just saved" from "the server disagrees with us". */
export function isSameFormState(a: DealFormState, b: DealFormState): boolean {
  return (Object.keys(a) as (keyof DealFormState)[]).every((k) => a[k] === b[k]);
}

/** Project a deal onto the Edit sheet's form values.
 *
 *  Nullable columns collapse to `""` rather than `null` because the inputs are
 *  controlled: a `null` value would make React treat the field as uncontrolled
 *  and warn. `buildPayload` in the sheet performs the inverse. */
export function dealToFormState(deal: Deal): DealFormState {
  return {
    deal_name: deal.dealName,
    account_name: deal.accountName,
    crm_record_url: deal.crmRecordUrl ?? "",
    account_manager: deal.accountManager,
    technical_lead: deal.technicalLead,
    sales_stage_id: deal.salesStageId,
    pricing_model_id: deal.pricingModelId ?? 0,
    services_tier_id: deal.servicesTierId ?? 0,
    product_revenue: deal.productRevenue,
    services_revenue: deal.servicesRevenue,
    contract_term_years: deal.contractTermYears ?? 1,
    is_perpetual_term: deal.isPerpetualTerm ?? false,
    expected_close_date: deal.expectedCloseDate?.slice(0, 10) ?? "",
    landed_at: deal.landedAt?.slice(0, 10) ?? "",
    win_probability_pct: deal.winProbabilityPct ?? "",
    committed: deal.committed ?? false,
    manager_strategic_blueprint: deal.managerStrategicBlueprint ?? "",
    speaker_notes: deal.speakerNotes ?? "",
    competitor_id: deal.competitorId ?? "",
    estimated_log_sources: deal.estimatedLogSources ?? "",
  };
}

/** Round and clamp into the server's `contract_term_years` contract (integer,
 *  1–10). Every non-finite input (NaN from an emptied `valueAsNumber` field,
 *  Infinity, a stray string) collapses to `1` rather than reaching the API.
 *  Also guards `decodeTerm` below, whose Select value must always match one
 *  of `TERM_YEAR_OPTIONS` — a value out of that range would render as an
 *  empty trigger instead of a selected option. */
export function clampTerm(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 1;
  return Math.min(10, Math.max(1, n));
}

/** The Term (yrs) Select's sentinel value for a perpetual contract. */
export const PERPETUAL_TERM_VALUE = "perpetual";

/** The Term (yrs) Select's numeric options — mirrors the server's
 *  `contract_term_years` bound (integer, 1–10). */
export const TERM_YEAR_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** Turns a Term Select value into the two wire fields it represents.
 *  `contract_term_years` keeps a valid filler (`1`) when perpetual — the
 *  column stays a required integer, and the Perpetual state is carried
 *  entirely by `is_perpetual_term`. */
export function encodeTerm(v: string): { contractTermYears: number; isPerpetualTerm: boolean } {
  if (v === PERPETUAL_TERM_VALUE) return { contractTermYears: 1, isPerpetualTerm: true };
  return { contractTermYears: clampTerm(v), isPerpetualTerm: false };
}

/** The inverse of `encodeTerm` — turns the two wire fields back into a Select
 *  value guaranteed to match one of `TERM_YEAR_OPTIONS` or the perpetual
 *  sentinel, never a value that would render the Select's trigger empty. */
export function decodeTerm(years: unknown, isPerpetual: boolean | undefined): string {
  if (isPerpetual) return PERPETUAL_TERM_VALUE;
  return String(clampTerm(years));
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
