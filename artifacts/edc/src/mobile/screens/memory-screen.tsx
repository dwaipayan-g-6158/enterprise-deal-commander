import { useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Search } from "lucide-react";
import { useSearchDealMemory, type DealMemory } from "@workspace/api-client-react";
import { compactCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OUTCOME_CLASS } from "@/lib/semantic-colors";
import { normalizeOutcome, OUTCOME_LABEL } from "@/mobile/lib/outcome";
import { armSharedCard } from "@/mobile/lib/shared-card";
import { useDebouncedValue } from "@/mobile/hooks/use-debounced-value";
import { MobileHeader } from "@/mobile/shell/mobile-header";
import { OutcomePill } from "@/mobile/components/badges";
import { SegmentChips, type Segment } from "@/mobile/components/segment-chips";
import { Shimmer } from "@/mobile/components/shimmer";
import { EmptyState, ErrorState } from "@/mobile/components/states";
import { PullToRefresh } from "@/mobile/components/pull-to-refresh";

type OutcomeFilter = "all" | "won" | "lost";

const FILTERS: Segment<OutcomeFilter>[] = [
  { id: "all", label: "All" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

/** The server search needs a couple of characters to be worth issuing. */
const MIN_QUERY_LENGTH = 2;

/**
 * Archived deals, search-first.
 *
 * The input sits at the bottom of the screen rather than the top: the
 * keyboard rises to meet it, the thumb never travels, and results fill the
 * space above where the eye already is. This is the one screen where the
 * Commander capsule stands down, because search already owns the thumb zone.
 */
export function MemoryScreen() {
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const debounced = useDebouncedValue(query.trim(), 300);

  const params = useMemo(
    () => ({
      ...(debounced.length >= MIN_QUERY_LENGTH ? { q: debounced } : {}),
      // The server matches `outcome` exactly and stores it display-cased, so
      // "won" returns nothing where "Won" returns the wins.
      ...(outcome === "all" ? {} : { outcome: OUTCOME_LABEL[outcome] }),
    }),
    [debounced, outcome],
  );

  const { data, isLoading, isError, refetch } = useSearchDealMemory(params);
  const results = data?.data ?? [];

  return (
    <>
      <MobileHeader
        title="Deal Memory"
        subtitle={isLoading ? undefined : `${results.length} archived deals`}
      >
        <SegmentChips
          segments={FILTERS}
          value={outcome}
          onChange={(id) => setOutcome(id)}
          label="Filter by outcome"
        />
      </MobileHeader>

      {/* Pull-to-refresh here as on the other three tabs. Memory was the one
          screen without it, and a gesture that works everywhere except one
          place is worse than one that works nowhere.

          The shell's pb-tabbar already clears the docked search bar as well as
          the tab bar, so no extra padding here. */}
      <PullToRefresh onRefresh={refetch}>
        <div className="space-y-3 p-4">
          {isError ? (
            <ErrorState
              title="Couldn't search memory"
              body="The archive didn't respond. Pull down to try again."
            />
          ) : isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Shimmer key={i} className="h-24 rounded-xl" />
            ))
          ) : results.length === 0 ? (
            <EmptyState
              title={debounced ? "No matches" : "Nothing archived yet"}
              body={
                debounced
                  ? "Try a shorter phrase, an account name, or a competitor."
                  : "Closed deals land here with their narrative and lessons attached."
              }
            />
          ) : (
            results.map((memory) => <MemoryCard key={memory.id} memory={memory} />)
          )}
        </div>
      </PullToRefresh>

      {/* Docked search. Sits directly above the tab bar so the keyboard opens
          under the thumb rather than pushing the whole screen up. */}
      <div className="m-glass m-glass-bottom fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border px-4 py-2.5">
        <label className="sr-only" htmlFor="memory-search">
          Search archived deals
        </label>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4">
          <Search className="m-muted h-4 w-4 shrink-0" aria-hidden="true" />
          <input
            id="memory-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search accounts, lessons, competitors"
            // 16px minimum, or iOS zooms the viewport on focus.
            className="m-tap h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
    </>
  );
}

function MemoryCard({ memory }: { memory: DealMemory }) {
  const outcome = normalizeOutcome(memory.outcome);
  const tcv = memory.finalTcv != null ? Number(memory.finalTcv) : null;
  const cardRef = useRef<HTMLAnchorElement>(null);
  const badgeClass = cn(OUTCOME_CLASS[outcome].bg, OUTCOME_CLASS[outcome].text);

  return (
    <Link
      ref={cardRef}
      href={`/memory/${memory.id}`}
      onClick={() =>
        armSharedCard(
          memory.id,
          {
            eyebrow: memory.accountName,
            title: memory.dealName,
            // The detail screen spells the outcome out in full; the badges
            // cross-fade between the two while the box morphs.
            value: OUTCOME_LABEL[outcome],
            valueClassName: badgeClass,
          },
          cardRef.current,
        )
      }
      className="m-card m-press m-reveal block p-4"
      aria-label={`${memory.dealName}, ${memory.accountName}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-label m-muted truncate">{memory.accountName}</p>
          <h2 className="m-title mt-0.5 truncate">{memory.dealName}</h2>
        </div>
        {/* Only the outcome badge travels. The account line and deal name go
            into the detail screen's nav bar rather than its hero, and that
            already has a transition name of its own — a part with nothing to
            morph into just animates out on its own and reads as a glitch. */}
        <OutcomePill sharedPart="value" className={cn("shrink-0", badgeClass)}>
          {OUTCOME_LABEL[outcome]}
        </OutcomePill>
      </div>

      <div className="m-caption m-muted mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {tcv != null && Number.isFinite(tcv) ? (
          <span className="text-foreground">{compactCurrency(tcv)}</span>
        ) : null}
        {memory.totalDaysActive != null ? <span>{memory.totalDaysActive}d active</span> : null}
        <span>{formatDate(memory.archivedAt, "—")}</span>
      </div>

      {memory.snippet ? (
        <p className="m-body m-muted mt-2 line-clamp-2">{memory.snippet}</p>
      ) : null}
    </Link>
  );
}
