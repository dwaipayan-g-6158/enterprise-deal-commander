import { useMemo, useState } from "react";
import { compactCurrency, formatDate } from "@/lib/format";
import type { Intelligence } from "@workspace/api-client-react";
import type { Health } from "@/lib/semantic-colors";
import {
  isSharedCardArmed,
  useSharedCardStyle,
  type SharedCardSeed,
} from "@/mobile/lib/shared-card";
import { HealthPill, RiskPill } from "@/mobile/components/badges";
import { CountUp } from "@/mobile/components/count-up";
import { Shimmer } from "@/mobile/components/shimmer";
import {
  TrajectoryScrubber,
  type TrajectoryPoint,
  type TrajectoryStageChange,
} from "@/mobile/components/trajectory-scrubber";

const HEALTH_VALUES = new Set<string>(["GREEN", "YELLOW", "RED"]);

/** The payload types health as a bare string; only three of them are real. */
function asHealth(value: string | null | undefined, fallback: Health): Health {
  return value != null && HEALTH_VALUES.has(value) ? (value as Health) : fallback;
}

/**
 * The deal's headline, on the canvas rather than in a card — it isn't one
 * module among several, it's what the screen is about.
 *
 * When you arrive here by tapping a roster card, the account line, the deal
 * name and the value each morph out of their counterpart on that card. The
 * names only apply to the deal that was actually tapped (lib/shared-card.ts),
 * so opening the same screen from a link elsewhere just fades in.
 *
 * The trajectory strip underneath is scrubbable, and the value and health
 * above it rewind with it. Sections further down the screen keep showing
 * today — they own their own queries, and threading a rewind through all
 * seven of them would trade a legible screen for a novelty.
 */
export function HeroSection({
  intel,
  dealId,
  trajectory,
  stageChanges,
}: {
  intel: Intelligence;
  dealId: string;
  /** Chronological merged history. Points without a score are ignored. */
  trajectory: TrajectoryPoint[];
  stageChanges: TrajectoryStageChange[];
}) {
  const { financials, risk, governance } = intel;
  const shared = useSharedCardStyle(dealId);
  // Read once, at mount. A figure that is morphing out of the card's own
  // number must not restart from zero — and the armed flag is released the
  // moment the transition ends, so this cannot be read reactively.
  const [arrivedByMorph] = useState(() => isSharedCardArmed(dealId));

  const scored = useMemo(() => trajectory.filter((p) => p.score != null), [trajectory]);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  // Once someone has scrubbed, the figure stops counting for the rest of this
  // mount: releasing the playhead would otherwise ramp it up from zero again.
  const [everScrubbed, setEverScrubbed] = useState(false);

  const at = scrubIndex != null ? scored[scrubIndex] : null;
  const tcv = at?.tcv ?? financials.calculatedTCV;
  const health = asHealth(at?.health, governance.healthStatus);

  const handleScrub = (next: number | null) => {
    if (next != null && !everScrubbed) setEverScrubbed(true);
    setScrubIndex(next);
  };

  return (
    <header className="px-4 pb-2 pt-4" style={shared("card")}>
      <p className="m-label truncate" style={shared("eyebrow")}>
        {intel.accountName}
      </p>
      <h1 className="m-title mt-1" style={shared("title")}>
        {intel.dealName}
      </h1>

      <p className="m-display mt-3" style={shared("value")}>
        {arrivedByMorph || everScrubbed ? (
          compactCurrency(tcv, financials.dealCurrency)
        ) : (
          <CountUp
            value={tcv}
            format={(n) => compactCurrency(n, financials.dealCurrency)}
          />
        )}
      </p>
      <p className="m-caption m-muted mt-1">
        {at ? (
          <>
            {at.stage ?? intel.salesStage} · as of {formatDate(at.at, "—")}
          </>
        ) : (
          <>
            {intel.salesStage} · {intel.daysInStage}d in stage
          </>
        )}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <HealthPill health={health} />
        <RiskPill level={risk.riskLevel} score={risk.compositeScore} />
      </div>

      {scored.length >= 2 ? (
        <TrajectoryScrubber
          className="mt-4"
          points={scored}
          stageChanges={stageChanges}
          index={scrubIndex}
          onScrub={handleScrub}
        />
      ) : null}
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
      <p className="m-label truncate" style={shared("eyebrow")}>
        {seed.eyebrow}
      </p>
      <h1 className="m-title mt-1" style={shared("title")}>
        {seed.title}
      </h1>

      <p className="m-display mt-3" style={shared("value")}>
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
