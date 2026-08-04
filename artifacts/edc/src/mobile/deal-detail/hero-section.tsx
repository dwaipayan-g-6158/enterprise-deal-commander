import { useState } from "react";
import { compactCurrency } from "@/lib/format";
import type { Intelligence } from "@workspace/api-client-react";
import {
  isSharedCardArmed,
  useSharedCardStyle,
  type SharedCardSeed,
} from "@/mobile/lib/shared-card";
import { HealthPill, RiskPill } from "@/mobile/components/badges";
import { CountUp } from "@/mobile/components/count-up";
import { Shimmer } from "@/mobile/components/shimmer";
import { Sparkline } from "@/mobile/components/sparkline";

/**
 * The deal's headline, on the canvas rather than in a card — it isn't one
 * module among several, it's what the screen is about.
 *
 * When you arrive here by tapping a roster card, the account line, the deal
 * name and the value each morph out of their counterpart on that card. The
 * names only apply to the deal that was actually tapped (lib/shared-card.ts),
 * so opening the same screen from a link elsewhere just fades in.
 */
export function HeroSection({
  intel,
  dealId,
  scoreHistory,
}: {
  intel: Intelligence;
  dealId: string;
  /** Chronological predictive scores, for the trend line. */
  scoreHistory: (number | null)[];
}) {
  const { financials, risk, governance } = intel;
  const shared = useSharedCardStyle(dealId);
  // Read once, at mount. A figure that is morphing out of the card's own
  // number must not restart from zero — and the armed flag is released the
  // moment the transition ends, so this cannot be read reactively.
  const [arrivedByMorph] = useState(() => isSharedCardArmed(dealId));

  return (
    <header className="px-4 pb-2 pt-4" style={shared("card")}>
      <p className="m-eyebrow truncate" style={shared("eyebrow")}>
        {intel.accountName}
      </p>
      <h1 className="m-h1 mt-1" style={shared("title")}>
        {intel.dealName}
      </h1>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="m-kpi-hero" style={shared("value")}>
            {arrivedByMorph ? (
              compactCurrency(financials.calculatedTCV, financials.dealCurrency)
            ) : (
              <CountUp
                value={financials.calculatedTCV}
                format={(n) => compactCurrency(n, financials.dealCurrency)}
              />
            )}
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

/**
 * The hero while the deal is still loading, drawn from what the card that
 * opened it already knew.
 *
 * This is what the card actually morphs into — the real hero arrives a few
 * hundred milliseconds later, long after the transition is over. It earns its
 * place twice: it makes the morph land on something, and it replaces a grey
 * box with the deal's own name and value, which is what the reader tapped
 * for.
 */
export function HeroPreview({ dealId, seed }: { dealId: string; seed: SharedCardSeed }) {
  const shared = useSharedCardStyle(dealId);

  return (
    <header className="px-4 pb-2 pt-4" style={shared("card")}>
      <p className="m-eyebrow truncate" style={shared("eyebrow")}>
        {seed.eyebrow}
      </p>
      <h1 className="m-h1 mt-1" style={shared("title")}>
        {seed.title}
      </h1>

      <p className="m-kpi-hero mt-3" style={shared("value")}>
        {seed.value}
      </p>
      <Shimmer className="mt-2 h-3.5 w-40" />

      <div className="mt-3 flex gap-2">
        <Shimmer className="h-7 w-28 rounded-full" />
        <Shimmer className="h-7 w-24 rounded-full" />
      </div>
    </header>
  );
}
