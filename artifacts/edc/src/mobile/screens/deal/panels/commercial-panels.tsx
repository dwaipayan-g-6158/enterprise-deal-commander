import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { compactCurrency, formatDate, money } from "@/lib/format";
import {
  useGetDealIntelligence,
  useGetPricingSchedule,
  useListCrossSells,
} from "@workspace/api-client-react";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { MetaChip } from "@/mobile/components/badges";
import { MRing } from "@/mobile/charts/m-ring";
import { MBars } from "@/mobile/charts/m-bars";
import { MChartFrame } from "@/mobile/charts/m-chart-frame";
import { seriesPaint } from "@/mobile/charts/chart-colors";
import { PanelBody, type PanelBodyProps } from "@/mobile/screens/deal/panel-screen";

/**
 * The deal's money, in full.
 *
 * The Brief carries the six figures worth glancing at; this carries the rest —
 * the FX rate that produced the normalized figure, the product/services split as
 * a proportion, and the team the numbers belong to. Splitting them that way is
 * what lets the Brief stay a brief.
 */
export function EconomicsPanel({ dealId }: PanelBodyProps) {
  const query = useGetDealIntelligence(dealId);
  const intel = query.data?.data;
  const financials = intel?.financials;

  return (
    <PanelBody loading={query.isLoading} error={query.isError} empty={!query.isLoading && !intel}>
      {intel && financials ? (
        <>
          <MobileCard>
            <CardHeader label="Contract value" />
            <p className="m-hero m-num">
              {compactCurrency(financials.calculatedTCV, financials.dealCurrency)}
            </p>
            <p className="m-caption m-muted mt-1">
              {money(financials.calculatedTCV)} {financials.dealCurrency} ·{" "}
              {financials.termYears} year term
            </p>
            {financials.dealCurrency !== financials.reportingCurrency ? (
              <p className="m-caption m-muted mt-1">
                {compactCurrency(financials.normalizedTCV, financials.reportingCurrency)} reported
                {financials.fxRateApplied != null
                  ? ` at ${financials.fxRateApplied} ${financials.dealCurrency}/${financials.reportingCurrency}`
                  : " — no FX rate applied"}
              </p>
            ) : null}
          </MobileCard>

          {financials.productRevenue + financials.servicesRevenue > 0 ? (
            <MobileCard>
              <CardHeader label="Revenue mix" />
              <MRing
                data={[
                  { label: "Product", value: financials.productRevenue, paint: seriesPaint(0) },
                  { label: "Services", value: financials.servicesRevenue, paint: seriesPaint(1) },
                ]}
                centreValue={compactCurrency(
                  financials.productRevenue + financials.servicesRevenue,
                  financials.dealCurrency,
                )}
                centreLabel="total"
                size={116}
                thickness={13}
              />
            </MobileCard>
          ) : null}

          <MobileCard>
            <CardHeader label="Terms" />
            <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
              <Figure label="Pricing model" value={financials.pricingModel} />
              <Figure label="Services tier" value={financials.servicesTier} />
              <Figure
                label="Expected close"
                value={formatDate(financials.expectedCloseDate, "—") ?? "—"}
                detail={
                  financials.daysToClose != null
                    ? financials.daysToClose < 0
                      ? `${Math.abs(financials.daysToClose)}d overdue`
                      : `in ${financials.daysToClose}d`
                    : undefined
                }
              />
              <Figure
                label="Win probability"
                value={
                  financials.winProbability != null
                    ? `${Math.round(financials.winProbability)}%`
                    : "—"
                }
              />
            </dl>
          </MobileCard>

          <MobileCard>
            <CardHeader label="Team" />
            <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
              <Figure label="Account manager" value={intel.team.accountManager} />
              <Figure label="Technical lead" value={intel.team.technicalLead} />
            </dl>
          </MobileCard>
        </>
      ) : null}
    </PanelBody>
  );
}

/** One row of the multi-year schedule. The endpoint is an open payload. */
interface ScheduleRow {
  year_number?: number;
  yearNumber?: number;
  amount?: number;
  uplift_pct?: number;
  upliftPct?: number;
  notes?: string | null;
}

/**
 * The multi-year pricing schedule, read-only.
 *
 * ## And a caveat this panel states rather than hides
 *
 * Saving this schedule on desktop updates its own ramp total; it does NOT write
 * back to the deal's calculated TCV. The Phase 2 PRD specifies wiring it into
 * the engine and that is not done. A phone panel that presented the ramp
 * alongside the TCV without saying so would invite the reader to assume the two
 * agree, and they need not.
 */
export function PricingPanel({ dealId }: PanelBodyProps) {
  const query = useGetPricingSchedule(dealId);
  const intelQuery = useGetDealIntelligence(dealId);
  const currency = intelQuery.data?.data?.financials.dealCurrency ?? "USD";

  const rows = useMemo(() => {
    const payload = query.data?.data as { rows?: ScheduleRow[] } | ScheduleRow[] | undefined;
    const list = Array.isArray(payload) ? payload : (payload?.rows ?? []);
    return list
      .map((row) => ({
        year: row.year_number ?? row.yearNumber ?? 0,
        amount: row.amount ?? 0,
        uplift: row.uplift_pct ?? row.upliftPct ?? null,
        notes: row.notes ?? null,
      }))
      .sort((a, b) => a.year - b.year);
  }, [query.data]);

  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <PanelBody
      loading={query.isLoading}
      error={query.isError}
      empty={!query.isLoading && rows.length === 0}
      emptyTitle="No pricing schedule"
      emptyBody="A multi-year ramp is authored on desktop; a flat deal does not need one."
    >
      <>
        <MChartFrame
          title="Ramp"
          subtitle={`${compactCurrency(total, currency)} across ${rows.length} ${rows.length === 1 ? "year" : "years"}`}
          data={rows.map((r) => ({
            label: `Year ${r.year}`,
            value: compactCurrency(r.amount, currency),
            detail: r.uplift != null ? `+${r.uplift}%` : undefined,
          }))}
        >
          <MBars
            data={rows.map((r) => ({ label: `Year ${r.year}`, value: r.amount }))}
            format={(v) => compactCurrency(v, currency)}
            label="Contract value by year"
          />
        </MChartFrame>

        {rows.some((r) => r.notes) ? (
          <MobileCard>
            <CardHeader label="Notes" />
            <ul className="space-y-2">
              {rows
                .filter((r) => r.notes)
                .map((r) => (
                  <li key={r.year}>
                    <p className="m-label m-muted">Year {r.year}</p>
                    <p className="m-body text-pretty">{r.notes}</p>
                  </li>
                ))}
            </ul>
          </MobileCard>
        ) : null}

        <p className="m-caption m-muted px-1 text-pretty">
          The ramp is recorded here but does not yet feed the deal's calculated TCV — that wiring
          is specified and not built. Treat the two as separate figures.
        </p>
      </>
    </PanelBody>
  );
}

/**
 * Whitespace: what the account has not been pitched.
 *
 * The attach rate is the number worth leading with — a long list of unpitched
 * products means nothing without knowing how much of the catalogue the account
 * has already taken.
 */
export function CrossSellPanel({ dealId }: PanelBodyProps) {
  const intelQuery = useGetDealIntelligence(dealId);
  const catalogQuery = useListCrossSells(dealId);

  const intel = intelQuery.data?.data;
  const crossSell = intel?.financials.crossSell;
  const pitched = useMemo(
    () => (catalogQuery.data?.data ?? []).filter((p) => p.isPitched),
    [catalogQuery.data],
  );
  const recommendations = intel?.recommendations ?? [];

  return (
    <PanelBody
      loading={intelQuery.isLoading}
      error={intelQuery.isError}
      empty={!intelQuery.isLoading && !crossSell}
      emptyTitle="No catalogue data"
      emptyBody="Cross-sell needs a product catalogue to measure attach against."
    >
      {crossSell ? (
        <>
          <MobileCard>
            <CardHeader label="Attach" />
            <p className="m-hero m-num">{Math.round(crossSell.attachRate * 100)}%</p>
            <p className="m-caption m-muted mt-1">
              {crossSell.pitchedCount} of {crossSell.catalogCount} products pitched
            </p>
          </MobileCard>

          {recommendations.length > 0 ? (
            <MobileCard>
              <CardHeader label="Recommended next" />
              <ul className="space-y-3">
                {recommendations.map((rec, i) => (
                  <li key={i}>
                    <p className="m-label m-muted">
                      {rec.type.replace(/_/g, " ").toLowerCase()}
                      {rec.suite ? ` · ${rec.suite}` : ""}
                    </p>
                    <p className="m-body mt-0.5 text-pretty">{rec.rationale}</p>
                    {rec.products && rec.products.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {rec.products.map((product) => (
                          <MetaChip key={product.productId}>{product.productName}</MetaChip>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </MobileCard>
          ) : null}

          {crossSell.whitespace.length > 0 ? (
            <MobileCard>
              <CardHeader label={`Whitespace (${crossSell.whitespace.length})`} />
              <ul className="space-y-1.5">
                {crossSell.whitespace.map((product) => (
                  <li
                    key={product.productId}
                    className="m-body flex items-baseline justify-between gap-3"
                  >
                    <span className="min-w-0 flex-1 truncate">{product.productName}</span>
                    {product.productCategory ? (
                      <span className="m-caption m-muted shrink-0">{product.productCategory}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </MobileCard>
          ) : null}

          {pitched.length > 0 ? (
            <MobileCard>
              <CardHeader label={`Pitched (${pitched.length})`} />
              <ul className="flex flex-wrap gap-1.5">
                {pitched.map((product) => (
                  <li key={product.productId}>
                    <MetaChip>{product.productName}</MetaChip>
                  </li>
                ))}
              </ul>
            </MobileCard>
          ) : null}
        </>
      ) : null}
    </PanelBody>
  );
}

function Figure({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="m-label m-muted truncate">{label}</dt>
      <dd className={cn("m-headline mt-0.5 truncate")}>{value}</dd>
      {detail ? <p className="m-caption m-muted truncate">{detail}</p> : null}
    </div>
  );
}
