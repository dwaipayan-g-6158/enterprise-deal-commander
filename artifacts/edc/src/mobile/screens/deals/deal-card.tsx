import { useRef } from "react";
import { Link } from "wouter";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { compactCurrency, calendarDaysUntil } from "@/lib/format";
import { HEALTH_CLASS } from "@/lib/semantic-colors";
import type { RosterRow } from "@/components/roster/model/roster-types";
import { armSharedCard, useSharedCardStyle } from "@/mobile/lib/shared-card";
import { HealthDot, MetaChip, VelocityMark } from "@/mobile/components/badges";
import { TONE_AHEAD } from "@/mobile/lib/tones";

/**
 * One deal, at arm's length.
 *
 * ## Three registers, not one flat row
 *
 * A card that tries to be a table row is unreadable on a phone, and a card that
 * carries six facts in one grey line is a table row with rounded corners. So the
 * content is banded by how urgently it is read: identity and value on top, the
 * qualifying facts in a metadata line, and validation progress as a hairline
 * that is legible without being read at all.
 *
 * That last band is the addition over the previous card, and it is the one that
 * closes the "less detail than desktop" gap on this screen: gate completion is
 * the single best predictor of whether a deal is really where its stage says it
 * is, and it was visible on the desktop table and nowhere on the phone.
 *
 * ## data-shared-part is the morph
 *
 * The account line, the name and the value each travel independently into the
 * detail hero rather than the card cross-fading as one flat image. See
 * lib/shared-card.ts.
 */
export function DealCard({ deal }: { deal: RosterRow }) {
  const cardRef = useRef<HTMLAnchorElement>(null);
  const closeIn = calendarDaysUntil(deal.expectedCloseDate);
  const tcv = compactCurrency(deal.calculatedTCV ?? 0, deal.dealCurrency ?? "USD");
  // The ARRIVING side of the morph back from the detail screen. Returns
  // undefined on every card but the one that was armed, so the rest of the list
  // stays unnamed — a view-transition-name held by two elements at once
  // silently disables the transition for both.
  const shared = useSharedCardStyle(deal.id);

  return (
    <Link
      ref={cardRef}
      href={`/deals/${deal.id}`}
      style={shared("card")}
      // wouter runs a Link's own onClick before it navigates, so the names are
      // on the DOM before the transition takes its snapshot. The seed travels
      // with them: the detail screen draws its headline from this while its own
      // query is still in flight, which is what the morph lands on.
      onClick={() =>
        armSharedCard(
          deal.id,
          { eyebrow: deal.accountName, title: deal.dealName, value: tcv },
          cardRef.current,
        )
      }
      className="m-card m-press m-reveal block p-4"
      aria-label={`${deal.dealName}, ${deal.accountName}, ${tcv}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-label m-muted truncate" data-shared-part="eyebrow" style={shared("eyebrow")}>
            {deal.accountName}
          </p>
          <h3 className="m-title mt-0.5 flex items-center gap-2">
            <HealthDot health={deal.healthStatus} />
            <span className="truncate" data-shared-part="title" style={shared("title")}>
              {deal.dealName}
            </span>
          </h3>
        </div>
        <span className="m-headline m-num shrink-0" data-shared-part="value" style={shared("value")}>
          {tcv}
        </span>
      </div>

      <div className="m-caption m-muted mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <MetaChip>{deal.salesStage}</MetaChip>
        {deal.score != null ? <ScoreMark score={deal.score} delta={deal.scoreDelta} /> : null}
        <VelocityMark bucket={deal.velocity} deltaDays={deal.deltaDays} />
        {closeIn != null ? (
          <span className={cn(closeIn < 0 && HEALTH_CLASS.RED.text)}>
            {closeIn < 0 ? `${Math.abs(closeIn)}d overdue` : `Closes in ${closeIn}d`}
          </span>
        ) : null}
      </div>

      <GateLine pct={deal.gatesPct} />
    </Link>
  );
}

/**
 * The predictive score, with its week-over-week movement.
 *
 * The delta is the part worth having: a score of 61 says little on its own, and
 * 61 having fallen four points says the deal is going the wrong way. Direction
 * rides on an arrow as well as colour, so it survives a monochrome render.
 */
function ScoreMark({ score, delta }: { score: number; delta: number | null }) {
  const moved = delta != null && delta !== 0;
  const up = (delta ?? 0) > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className="inline-flex items-center gap-1">
      Score <span className="m-num text-foreground">{score}</span>
      {moved ? (
        <span className={cn("inline-flex items-center", up ? TONE_AHEAD : "text-destructive")}>
          <Icon className="h-3 w-3" aria-hidden="true" />
          <span className="m-num">{Math.abs(delta!)}</span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * Technical validation, as a hairline.
 *
 * Deliberately not a labelled progress bar with a percentage beside it: on a
 * list of twelve cards that is twelve numbers nobody compares. As a rule it is
 * read as a shape — most of the way across, or barely started — which is the
 * only question anyone asks of it while scrolling. The exact figure is on the
 * deal's Technical gates panel, one tap away, where it belongs.
 *
 * `aria-hidden` with the value in the label instead: a bare progressbar
 * announcing "38 percent" with no name is noise, and naming it on every card
 * would have a screen reader read a second sentence per row.
 */
function GateLine({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  if (clamped === 0) return null;
  return (
    <div className="mt-3 flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {/* Moves when a gate ticked on the deal screen lands back in the list. */}
        <div className="m-fill h-full rounded-full bg-primary" style={{ width: `${clamped}%` }} />
      </div>
      <span className="m-micro m-muted m-num shrink-0">{clamped}% gates</span>
    </div>
  );
}
