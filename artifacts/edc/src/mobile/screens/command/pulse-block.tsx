import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { HEALTH_CLASS, HEALTH_LABEL, type Health } from "@/lib/semantic-colors";
import { MobileCard, CardHeader } from "@/mobile/components/mobile-card";
import { CountUp } from "@/mobile/components/count-up";
import { DeltaLine } from "@/mobile/components/stat-tile";
import { Shimmer } from "@/mobile/components/shimmer";
import { MRing } from "@/mobile/charts/m-ring";
import { HEALTH_PAINT } from "@/mobile/charts/chart-colors";
import { DEALS_LINKS } from "@/mobile/screens/deals/deals-href";
import type { Coverage, VitalSigns } from "@/mobile/screens/command/use-command-data";

/** Weighted pipeline as a multiple of target. The engine's own on-track line. */
const COVERAGE_ON_TRACK = 3;
const COVERAGE_TIGHT = 2;

/**
 * The portfolio's vital signs: value, split, and whether there is enough of it.
 *
 * ## Every figure here goes somewhere
 *
 * The desktop equivalents open eight bespoke drill-down dialogs. These link into
 * the Deals tab with a filter applied, which is the same answer in a screen the
 * reader already knows, with a URL they can share and a back gesture that undoes
 * it. `DEALS_LINKS` builds those through the roster's own URL codec so a link can
 * never quietly arrive unfiltered.
 *
 * The one figure with no link is the weighted pipeline, and that is deliberate:
 * "weighted" is a probability-adjusted sum, so no list of whole deals adds up to
 * it. A link to a list that does not total the number above it is a link that
 * makes the reader distrust both.
 */
export function PulseBlock({
  vitals,
  health,
  tcvAtRisk,
  staleDeals,
  coverage,
  money,
}: {
  vitals: VitalSigns | undefined;
  health: { GREEN: number; YELLOW: number; RED: number } | undefined;
  tcvAtRisk: number | undefined;
  staleDeals: number | undefined;
  coverage: Coverage | undefined;
  money: (n: number) => string;
}) {
  const totalDeals = health ? health.GREEN + health.YELLOW + health.RED : 0;
  const healthyPct = totalDeals > 0 ? Math.round((health!.GREEN / totalDeals) * 100) : 0;

  return (
    <MobileCard>
      <CardHeader label="Pulse" />

      {vitals ? (
        <div className="m-appear">
          <p className="m-label m-muted">Weighted pipeline</p>
          <p className="m-display m-num mt-0.5">
            <CountUp value={vitals.weightedPipeline} format={money} once="command-weighted" />
          </p>
          <p className="m-caption mt-1">
            <span className="m-muted">of {money(vitals.totalTCV)} total · </span>
            <DeltaLine
              // Total against total. The baseline snapshot holds no weighted
              // figure, and subtracting an unweighted baseline from a weighted
              // current is the arithmetic insight-builder.ts had to be fixed
              // for — it announced collapses that never happened.
              delta={vitals.baseline ? vitals.totalTCV - vitals.baseline.totalTCV : null}
              format={money}
            />
          </p>
        </div>
      ) : (
        <>
          <Shimmer className="h-3.5 w-28" />
          <Shimmer className="mt-2 h-8 w-44" />
        </>
      )}

      <div className="my-4 border-t border-border" />

      {health && totalDeals > 0 ? (
        <MRing
          data={(["GREEN", "YELLOW", "RED"] as Health[]).map((key) => ({
            label: HEALTH_LABEL[key],
            value: health[key],
            paint: HEALTH_PAINT[key],
          }))}
          centreValue={`${healthyPct}%`}
          centreLabel="healthy"
          size={116}
          thickness={13}
        />
      ) : (
        <Shimmer className="h-[116px]" />
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <PulseFigure
          label="TCV at risk"
          value={tcvAtRisk != null ? money(tcvAtRisk) : undefined}
          tone={tcvAtRisk != null && tcvAtRisk > 0 ? "critical" : "default"}
          href={DEALS_LINKS.red()}
          hint="Red deals"
        />
        <PulseFigure
          label="Stalled"
          value={staleDeals != null ? String(staleDeals) : undefined}
          tone={staleDeals != null && staleDeals > 0 ? "caution" : "default"}
          href={DEALS_LINKS.stalled()}
          hint="Losing pace"
        />
      </div>

      {coverage ? <CoverageLine coverage={coverage} /> : null}
    </MobileCard>
  );
}

/**
 * One figure, and the filtered list behind it.
 *
 * A whole-tile link rather than a link inside a tile: a bigger target, and an
 * affordance the reader can see without reading.
 */
function PulseFigure({
  label,
  value,
  tone,
  href,
  hint,
}: {
  label: string;
  value: string | undefined;
  tone: "default" | "critical" | "caution";
  href: string;
  hint: string;
}) {
  return (
    // Outlined rather than filled. A nested tinted box inside a card is a third
    // surface, and tokens.test.ts measures text against --card and the shell's
    // washed canvas — not against a one-off `bg-muted/40` invented here. Keeping
    // the tile transparent keeps the audit true of the shipped pixel.
    <Link
      href={href}
      className="m-press m-tap flex flex-col rounded-xl border border-border p-3"
      aria-label={`${label}. Opens ${hint.toLowerCase()}.`}
    >
      <span className="m-label m-muted">{label}</span>
      {value != null ? (
        <span
          className={cn(
            "m-title m-num mt-1",
            tone === "critical" && "text-destructive",
            // The audited health palette, not a chart stroke: semantic-colors.ts
            // is the tested source of what yellow means, and its text shades
            // carry measured AA floors.
            tone === "caution" && HEALTH_CLASS.YELLOW.text,
          )}
        >
          {value}
        </span>
      ) : (
        <Shimmer className="mt-1 h-6 w-16" />
      )}
      <span className="m-caption m-muted mt-auto flex items-center gap-0.5 pt-1">
        {hint}
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
      </span>
    </Link>
  );
}

/**
 * Coverage: open pipeline against this period's revenue target.
 *
 * Read as a multiple of target — 3x+ on track, 2-3x tight, under 2x at risk —
 * which is the same scale `coverage-tracker.tsx` uses on desktop. Renders
 * nothing at all when no target has been set, rather than showing a ratio with
 * no denominator behind it.
 */
function CoverageLine({ coverage }: { coverage: Coverage }) {
  const ratio = coverage.weighted;
  if (ratio == null) return null;

  const tone =
    ratio >= COVERAGE_ON_TRACK
      ? HEALTH_CLASS.GREEN.text
      : ratio >= COVERAGE_TIGHT
        ? HEALTH_CLASS.YELLOW.text
        : "text-destructive";

  return (
    <p className="m-caption m-muted mt-3">
      Weighted coverage <span className={cn("m-num", tone)}>{ratio.toFixed(1)}×</span> of target
      {ratio < COVERAGE_TIGHT ? " — under the 2× floor" : null}
    </p>
  );
}
