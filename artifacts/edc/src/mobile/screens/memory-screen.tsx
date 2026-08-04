import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Search } from "lucide-react";
import { useSearchDealMemory, type DealMemory } from "@workspace/api-client-react";
import { compactCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OUTCOME_CLASS } from "@/lib/semantic-colors";
import { normalizeOutcome, OUTCOME_LABEL } from "@/mobile/lib/outcome";
import { useDebouncedValue } from "@/mobile/hooks/use-debounced-value";
import { MobileHeader } from "@/mobile/shell/mobile-header";
import { SegmentChips, type Segment } from "@/mobile/components/segment-chips";
import { Shimmer } from "@/mobile/components/shimmer";
import { EmptyState, ErrorState } from "@/mobile/components/states";

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

  const { data, isLoading, isError } = useSearchDealMemory(params);
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

      {/* The shell's pb-tabbar already clears the docked search bar as well as
          the tab bar, so no extra padding here. */}
      <div className="space-y-3 p-4">
        {isError ? (
          <ErrorState
            title="Couldn't search memory"
            body="The archive didn't respond. Try again in a moment."
          />
        ) : isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Shimmer key={i} className="h-24 rounded-[var(--m-radius-card)]" />
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

      {/* Docked search. Sits directly above the tab bar so the keyboard opens
          under the thumb rather than pushing the whole screen up. */}
      <div className="m-glass fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-[var(--m-keyline)] px-4 py-2.5">
        <label className="sr-only" htmlFor="memory-search">
          Search archived deals
        </label>
        <div className="flex items-center gap-2 rounded-full border border-[var(--m-keyline)] bg-[var(--m-surface-1)] px-4">
          <Search className="m-muted h-4 w-4 shrink-0" aria-hidden="true" />
          <input
            id="memory-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search accounts, lessons, competitors"
            // 16px minimum, or iOS zooms the viewport on focus.
            className="m-tap h-12 w-full bg-transparent text-base outline-none placeholder:text-[var(--m-on-surface-muted)]"
          />
        </div>
      </div>
    </>
  );
}

function MemoryCard({ memory }: { memory: DealMemory }) {
  const outcome = normalizeOutcome(memory.outcome);
  const tcv = memory.finalTcv != null ? Number(memory.finalTcv) : null;

  return (
    <Link
      href={`/memory/${memory.id}`}
      className="m-card m-press block p-4"
      aria-label={`${memory.dealName}, ${memory.accountName}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-eyebrow truncate">{memory.accountName}</p>
          <h2 className="m-h3 mt-1 truncate">{memory.dealName}</h2>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
            OUTCOME_CLASS[outcome].bg,
            OUTCOME_CLASS[outcome].text,
          )}
        >
          {OUTCOME_LABEL[outcome]}
        </span>
      </div>

      <div className="m-data m-muted mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        {tcv != null && Number.isFinite(tcv) ? (
          <span className="text-[var(--m-on-surface)]">{compactCurrency(tcv)}</span>
        ) : null}
        {memory.totalDaysActive != null ? <span>{memory.totalDaysActive}d active</span> : null}
        <span>{formatDate(memory.archivedAt, "—")}</span>
      </div>

      {memory.snippet ? (
        <p className="m-body m-muted mt-2 line-clamp-2 text-sm">{memory.snippet}</p>
      ) : null}
    </Link>
  );
}
