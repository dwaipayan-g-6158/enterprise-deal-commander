import { compactCurrency } from "@/lib/format";
import type { Intelligence } from "@workspace/api-client-react";
import { HealthPill, RiskPill } from "@/mobile/components/badges";
import { Sparkline } from "@/mobile/components/sparkline";

/**
 * The deal's headline, on the canvas rather than in a card — it isn't one
 * module among several, it's what the screen is about.
 */
export function HeroSection({
  intel,
  scoreHistory,
}: {
  intel: Intelligence;
  /** Chronological predictive scores, for the trend line. */
  scoreHistory: (number | null)[];
}) {
  const { financials, risk, governance } = intel;

  return (
    <header className="px-4 pb-2 pt-4">
      <p className="m-eyebrow truncate">{intel.accountName}</p>
      <h1 className="m-h1 mt-1">{intel.dealName}</h1>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="m-kpi-hero">
            {compactCurrency(financials.calculatedTCV, financials.dealCurrency)}
          </p>
          <p className="m-data m-muted mt-1">
            {intel.salesStage} · {intel.daysInStage}d in stage
          </p>
        </div>
        <Sparkline
          values={scoreHistory}
          ariaLabel="Predictive score over the last 90 days"
          className="mb-1 shrink-0"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <HealthPill health={governance.healthStatus} />
        <RiskPill level={risk.riskLevel} score={risk.compositeScore} />
      </div>
    </header>
  );
}
