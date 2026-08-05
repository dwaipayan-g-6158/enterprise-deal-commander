import type { Intelligence } from "@workspace/api-client-react";
import { money, humanizeCode } from "@/lib/format";
import { CollapsibleSection } from "@/mobile/components/collapsible-section";

/**
 * Where the money comes from and who owns the deal. Two things a commander
 * checks before a call and never edits from a phone.
 */
export function EconomicsSection({ intel }: { intel: Intelligence }) {
  const f = intel.financials;

  const verdict = (
    <p className="m-caption m-muted">
      {humanizeCode(f.pricingModel)} · {f.termYears}
      {f.termYears === 1 ? " year" : " years"} · {intel.team.accountManager}
    </p>
  );

  return (
    <CollapsibleSection anchorId="economics" label="Economics & team" verdict={verdict}>
      <dl className="space-y-2.5">
        <Row label="Product revenue" value={money(f.productRevenue)} />
        <Row label="Services revenue" value={money(f.servicesRevenue)} />
        <Row label="Contract value" value={money(f.calculatedTCV)} />
        {f.dealCurrency !== f.reportingCurrency ? (
          <Row
            label={`Normalized (${f.reportingCurrency})`}
            value={money(f.normalizedTCV)}
          />
        ) : null}
        <Row label="Account manager" value={intel.team.accountManager} />
        <Row label="Technical lead" value={intel.team.technicalLead} />
      </dl>
    </CollapsibleSection>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="m-body m-muted">{label}</dt>
      <dd className="m-caption shrink-0 text-right">{value}</dd>
    </div>
  );
}
