import { useState } from "react";
import { compactCurrency } from "@/lib/format";
import type { Intelligence, Tag } from "@workspace/api-client-react";
import { isSharedCardArmed, useSharedCardStyle, type SharedCardSeed } from "@/mobile/lib/shared-card";
import { HealthPill, RiskPill } from "@/mobile/components/badges";
import { CountUp } from "@/mobile/components/count-up";
import { Shimmer } from "@/mobile/components/shimmer";

/**
 * The deal's headline, on the canvas rather than in a card — it is not one
 * module among several, it is what the screen is about.
 *
 * Arriving by tapping a roster card, the account line, the name and the value
 * each morph out of their counterpart on that card. The names apply only to the
 * deal actually tapped (lib/shared-card.ts), so the same screen opened from a
 * link elsewhere simply fades in.
 *
 * The trajectory scrubber that used to live under this has moved to its own
 * pushed panel. It was a good control in the wrong place: it rewound the value
 * and the health above it while every section below went on showing today, and
 * a screen where half the figures are historical and half are current is a
 * screen you have to remember the rules of.
 */
export function BriefHero({
  intel,
  dealId,
  tags,
}: {
  intel: Intelligence;
  dealId: string;
  tags: Tag[];
}) {
  const { financials, risk, governance } = intel;
  const shared = useSharedCardStyle(dealId);
  // Read once at mount. A figure morphing out of the card's own number must not
  // restart from zero, and the armed flag is released the moment the transition
  // ends — so this cannot be read reactively.
  const [arrivedByMorph] = useState(() => isSharedCardArmed(dealId));

  return (
    <header className="px-4 pb-2 pt-4" style={shared("card")}>
      <p className="m-label m-muted truncate" style={shared("eyebrow")}>
        {intel.accountName}
      </p>
      <h1 className="m-title mt-1 text-balance" style={shared("title")}>
        {intel.dealName}
      </h1>

      <p className="m-display m-num mt-3" style={shared("value")}>
        {arrivedByMorph ? (
          compactCurrency(financials.calculatedTCV, financials.dealCurrency)
        ) : (
          <CountUp
            value={financials.calculatedTCV}
            format={(n) => compactCurrency(n, financials.dealCurrency)}
          />
        )}
      </p>
      <p className="m-caption m-muted mt-1">
        {intel.salesStage} · {intel.daysInStage}d in stage
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <HealthPill health={governance.healthStatus} />
        <RiskPill level={risk.riskLevel} score={risk.compositeScore} />
      </div>

      {tags.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="m-caption rounded-full border border-border px-2 py-0.5"
              // The tag's own colour as a dot rather than as a fill: an
              // arbitrary user-chosen colour behind text cannot be checked for
              // contrast, and a tag row is the last place worth risking it.
            >
              <span
                aria-hidden="true"
                className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                style={{ backgroundColor: tag.color }}
              />
              {tag.tagName}
            </li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}

/**
 * The hero while the deal is still loading, drawn from what the card that opened
 * it already knew.
 *
 * This is what the card actually morphs into — the real hero arrives a few
 * hundred milliseconds later, long after the transition is over. It earns its
 * place twice: it gives the morph something to land on, and it replaces a grey
 * box with the deal's own name and value, which is what the reader tapped for.
 */
export function BriefHeroPreview({ dealId, seed }: { dealId: string; seed: SharedCardSeed }) {
  const shared = useSharedCardStyle(dealId);

  return (
    <header className="px-4 pb-2 pt-4" style={shared("card")}>
      <p className="m-label m-muted truncate" style={shared("eyebrow")}>
        {seed.eyebrow}
      </p>
      <h1 className="m-title mt-1" style={shared("title")}>
        {seed.title}
      </h1>

      <p className="m-display m-num mt-3" style={shared("value")}>
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
