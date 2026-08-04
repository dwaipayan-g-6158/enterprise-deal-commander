import { useMemo, useRef, useState } from "react";
import { Link, useSearch } from "wouter";
import { compactCurrency, calendarDaysUntil } from "@/lib/format";
import { HEALTH_SHORT_LABEL } from "@/lib/semantic-colors";
import { useRosterData } from "@/components/roster/hooks/use-roster-data";
import { terminalOutcome } from "@/components/roster/model/board";
import type { RosterRow } from "@/components/roster/model/roster-types";
import { armSharedCard } from "@/mobile/lib/shared-card";
import { MobileHeader } from "@/mobile/shell/mobile-header";
import { SegmentChips, type Segment } from "@/mobile/components/segment-chips";
import { HealthDot, MetaChip, VelocityMark } from "@/mobile/components/badges";
import { Shimmer } from "@/mobile/components/shimmer";
import { EmptyState, ErrorState } from "@/mobile/components/states";
import { PullToRefresh } from "@/mobile/components/pull-to-refresh";

const SEGMENT_IDS = ["all", "critical", "closing", "stalled"] as const;
type SegmentId = (typeof SEGMENT_IDS)[number];

/** Days ahead that still counts as "closing soon". Overdue deals qualify too. */
const CLOSING_WINDOW_DAYS = 30;

/**
 * The filter a deep link asked for. Read once, as the initial value only —
 * after that the chips own it, and rewriting the URL on every tap would put
 * a filter change in the back stack.
 *
 * The installed app's "Red alerts" home-screen shortcut lands here.
 */
function segmentFromSearch(search: string): SegmentId {
  const asked = new URLSearchParams(search).get("filter");
  return SEGMENT_IDS.find((id) => id === asked) ?? "all";
}

/**
 * Cross-currency-comparable value, matching the desktop roster's
 * `comparableTCV`. Summing calculatedTCV instead would add euros to dollars
 * and report a pipeline total that agrees with nothing else in the app.
 */
function comparableTCV(row: RosterRow): number {
  return row.normalizedTCV ?? row.calculatedTCV ?? 0;
}

function matchesSegment(row: RosterRow, segment: SegmentId): boolean {
  switch (segment) {
    case "critical":
      return row.healthStatus === "RED";
    case "closing": {
      const days = calendarDaysUntil(row.expectedCloseDate);
      return days != null && days <= CLOSING_WINDOW_DAYS;
    }
    case "stalled":
      return row.velocity === "STALLED" || row.velocity === "SLOW";
    case "all":
      return true;
  }
}

/**
 * The roster, re-cut as a card list.
 *
 * Reuses useRosterData — the same two reads the desktop roster issues, merged
 * the same way — so the two surfaces can't disagree about a deal's score or
 * velocity. Everything the desktop toolbar does with filters happens here as
 * four segments; search lives in the Commander sheet rather than a top search
 * bar, which keeps it in the thumb arc.
 */
export function DealsScreen() {
  const search = useSearch();
  const [segment, setSegment] = useState<SegmentId>(() => segmentFromSearch(search));
  const { rows, isLoading, isError, refetch } = useRosterData({ state: "active", search: "" });

  // The live pipeline only. `state: "active"` excludes archived and deleted
  // deals but still returns ones sitting in a Closed-Won/Closed-Lost stage;
  // the desktop roster drops those too via its default `closure: "open"`.
  // Without this the header would claim a pipeline total that double-counts
  // deals that are already over.
  const open = useMemo(() => rows.filter((r) => terminalOutcome(r.salesStage) == null), [rows]);

  const counts = useMemo(
    () => ({
      all: open.length,
      critical: open.filter((r) => matchesSegment(r, "critical")).length,
      closing: open.filter((r) => matchesSegment(r, "closing")).length,
      stalled: open.filter((r) => matchesSegment(r, "stalled")).length,
    }),
    [open],
  );

  const visible = useMemo(
    () =>
      open
        .filter((r) => matchesSegment(r, segment))
        .sort((a, b) => comparableTCV(b) - comparableTCV(a)),
    [open, segment],
  );

  const pipeline = useMemo(
    () => open.reduce((sum, r) => sum + comparableTCV(r), 0),
    [open],
  );

  const segments: Segment<SegmentId>[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "critical", label: HEALTH_SHORT_LABEL.RED, count: counts.critical },
    { id: "closing", label: "Closing 30d", count: counts.closing },
    { id: "stalled", label: "Losing pace", count: counts.stalled },
  ];

  return (
    <>
      <MobileHeader
        title="Deals"
        subtitle={
          isLoading ? undefined : `${counts.all} active · ${compactCurrency(pipeline)} pipeline`
        }
      >
        {/* Wrapped rather than passing setSegment directly: its
            SetStateAction parameter would widen the chips' generic to
            include the updater-function form. */}
        <SegmentChips
          segments={segments}
          value={segment}
          onChange={(id) => setSegment(id)}
          label="Filter deals"
        />
      </MobileHeader>

      <PullToRefresh onRefresh={refetch}>
        <div className="space-y-3 p-4">
          {isError ? (
            <ErrorState
              title="Couldn't load deals"
              body="The pipeline didn't come back. Pull down to try again."
            />
          ) : isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Shimmer key={i} className="h-[104px] rounded-[var(--m-radius-card)]" />
            ))
          ) : visible.length === 0 ? (
            <EmptyState
              title={segment === "all" ? "No active deals" : "Nothing in this filter"}
              body={
                segment === "all"
                  ? "Deals appear here as soon as they land in the pipeline."
                  : "Switch to All to see the rest of the pipeline."
              }
            />
          ) : (
            visible.map((deal) => <DealCard key={deal.id} deal={deal} />)
          )}
        </div>
      </PullToRefresh>
    </>
  );
}

/**
 * One deal, at a glance. Six data points and no more — depth belongs in the
 * detail screen, and a card that tries to be a table row is unreadable at
 * arm's length.
 *
 * The data-shared-part attributes are what the card morphs into the detail
 * hero on: the account line, the deal name and the value each travel to their
 * counterpart independently rather than the whole card cross-fading as one
 * flat image. See lib/shared-card.ts.
 */
function DealCard({ deal }: { deal: RosterRow }) {
  const closeIn = calendarDaysUntil(deal.expectedCloseDate);
  const cardRef = useRef<HTMLAnchorElement>(null);
  const tcv = compactCurrency(deal.calculatedTCV ?? 0, deal.dealCurrency ?? "USD");

  return (
    <Link
      ref={cardRef}
      href={`/deals/${deal.id}`}
      // wouter runs a Link's own onClick before it navigates, so the names
      // are on the DOM before the transition takes its snapshot. The seed
      // goes with them: the detail screen draws its headline from this while
      // its own query is still in flight, which is what the card morphs into.
      onClick={() =>
        armSharedCard(
          deal.id,
          { eyebrow: deal.accountName, title: deal.dealName, value: tcv },
          cardRef.current,
        )
      }
      className="m-card m-press m-reveal block p-4"
      aria-label={`${deal.dealName}, ${deal.accountName}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-eyebrow truncate" data-shared-part="eyebrow">
            {deal.accountName}
          </p>
          <h2 className="m-h3 mt-1 flex items-center gap-2">
            <HealthDot health={deal.healthStatus} />
            <span className="truncate" data-shared-part="title">
              {deal.dealName}
            </span>
          </h2>
        </div>
        <span
          className="shrink-0 font-mono text-lg font-semibold tracking-[-0.03em]"
          data-shared-part="value"
        >
          {tcv}
        </span>
      </div>

      <div className="m-data m-muted mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <MetaChip>{deal.salesStage}</MetaChip>
        {deal.score != null ? (
          <span>
            Score <span className="text-[var(--m-on-surface)]">{deal.score}</span>
          </span>
        ) : null}
        <VelocityMark bucket={deal.velocity} deltaDays={deal.deltaDays} />
        {closeIn != null ? (
          <span>{closeIn < 0 ? `${Math.abs(closeIn)}d overdue` : `Closes in ${closeIn}d`}</span>
        ) : null}
      </div>
    </Link>
  );
}
