import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link, useLocation } from "wouter";
import { Check, ChevronRight, Search, X } from "lucide-react";
import {
  useGetMemoryFacets,
  useSearchDealMemory,
  type DealMemory,
} from "@workspace/api-client-react";
import { compactCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OUTCOME_CLASS } from "@/lib/semantic-colors";
import { normalizeOutcome, OUTCOME_LABEL } from "@/mobile/lib/outcome";
import { armSharedCard, useSharedCardStyle } from "@/mobile/lib/shared-card";
import { useDebouncedValue } from "@/mobile/hooks/use-debounced-value";
import { MNavBar } from "@/mobile/shell/m-nav-bar";
import { MAvatar } from "@/mobile/shell/m-avatar";
import { OutcomePill } from "@/mobile/components/badges";
import { SegmentChips, type Segment } from "@/mobile/components/segment-chips";
import { Shimmer } from "@/mobile/components/shimmer";
import { EmptyState, ErrorState } from "@/mobile/components/states";
import { PullToRefresh } from "@/mobile/components/pull-to-refresh";
import { MSheet } from "@/mobile/ui/m-sheet";
import { haptic } from "@/mobile/lib/haptics";
import { MEMORY_LENSES } from "@/mobile/nav/routes";
import {
  canCompare,
  clearCompare,
  compareSelection,
  encodeCompare,
  MAX_COMPARE,
  subscribeCompare,
  toggleCompare,
} from "@/mobile/screens/memory/compare-selection";

type OutcomeFilter = "all" | "won" | "lost";

const FILTERS: Segment<OutcomeFilter>[] = [
  { id: "all", label: "All" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

/** The server search needs a couple of characters to be worth issuing. */
const MIN_QUERY_LENGTH = 2;

interface FacetValue {
  value: string;
  count: number;
}

interface FacetsPayload {
  competitors?: FacetValue[];
  pricingModels?: FacetValue[];
  servicesTiers?: FacetValue[];
}

/**
 * The archive, search-first.
 *
 * The input sits at the bottom rather than the top: the keyboard rises to meet
 * it, the thumb never travels, and results fill the space above where the eye
 * already is. This shape was the best screen in the previous shell and it is
 * kept — what it was missing was everything AROUND the search.
 *
 * ## Five lenses, shown only when nobody is searching
 *
 * Desktop's Memory page is six tabs. Five of them are not searches — they are
 * standing questions about the archive as a whole — and they belong behind rows,
 * not behind a tab strip competing with the search field. They hide the moment a
 * query is typed, because a menu is not what someone mid-search is looking for.
 *
 * ## Compare is a selection, not a mode
 *
 * Long-press-to-select and a dedicated toolbar would be two more things to learn.
 * A checkbox appears on every card, the count rides in a bar above the dock, and
 * the whole thing disappears when the selection is empty.
 */
export function MemoryScreen() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [competitor, setCompetitor] = useState<string | null>(null);
  const [facetsOpen, setFacetsOpen] = useState(false);
  const debounced = useDebouncedValue(query.trim(), 300);

  const selected = useSyncExternalStore(subscribeCompare, compareSelection, compareSelection);

  const params = useMemo(
    () => ({
      ...(debounced.length >= MIN_QUERY_LENGTH ? { q: debounced } : {}),
      // The server matches `outcome` exactly and stores it display-cased, so
      // "won" returns nothing where "Won" returns the wins.
      ...(outcome === "all" ? {} : { outcome: OUTCOME_LABEL[outcome] }),
      ...(competitor ? { competitor } : {}),
    }),
    [debounced, outcome, competitor],
  );

  const { data, isLoading, isError, refetch } = useSearchDealMemory(params);
  const facetsQuery = useGetMemoryFacets();
  const facets = facetsQuery.data?.data as FacetsPayload | undefined;
  const results = data?.data ?? [];

  const searching = debounced.length >= MIN_QUERY_LENGTH || competitor != null;

  return (
    <>
      <MNavBar
        title="Memory"
        right={<MAvatar />}
        subtitle={isLoading ? undefined : `${results.length} archived deals`}
      >
        <SegmentChips
          segments={FILTERS}
          value={outcome}
          onChange={(id) => setOutcome(id)}
          label="Filter by outcome"
        />
      </MNavBar>

      {/* The shell's pb-tabbar already clears the docked search bar as well as
          the tab bar, so no extra padding here. */}
      <PullToRefresh onRefresh={refetch}>
        <div className="space-y-3 p-4">
          {competitor ? (
            <button
              type="button"
              onClick={() => setCompetitor(null)}
              className="m-label m-press m-tap inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-primary-foreground"
            >
              vs {competitor}
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}

          {isError ? (
            <ErrorState
              title="Couldn't search memory"
              body="The archive didn't respond. Pull down to try again."
            />
          ) : isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Shimmer key={i} className="h-28 rounded-xl" />
            ))
          ) : results.length === 0 ? (
            <EmptyState
              title={searching ? "No matches" : "Nothing archived yet"}
              body={
                searching
                  ? "Try a shorter phrase, an account name, or a competitor."
                  : "Closed deals land here with their narrative and lessons attached."
              }
            />
          ) : (
            results.map((memory) => (
              <MemoryCard
                key={memory.id}
                memory={memory}
                selected={selected.includes(memory.id)}
                selecting={selected.length > 0}
                onToggle={() => {
                  haptic();
                  toggleCompare(memory.id);
                }}
              />
            ))
          )}

          {!searching && results.length > 0 ? (
            <nav aria-label="Archive lenses" className="pt-1">
              <p className="m-label m-muted mb-1.5 px-1">Ask the archive</p>
              <ul className="m-card overflow-hidden">
                {MEMORY_LENSES.map((lens, i) => (
                  <li key={lens.id} className={i > 0 ? "border-t border-border" : undefined}>
                    <Link
                      href={`/memory/${lens.id}`}
                      className="m-tap m-press flex items-center gap-3 px-4 py-3.5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="m-headline block truncate">{lens.title}</span>
                        <span className="m-caption m-muted block text-pretty">{lens.blurb}</span>
                      </span>
                      <ChevronRight className="m-muted h-4 w-4 shrink-0" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
      </PullToRefresh>

      {/* The compare bar, above the dock. Absent entirely when nothing is
          selected, so the archive is never wearing a mode it is not in. */}
      {selected.length > 0 ? (
        <div className="m-card m-vt-capsule absolute inset-x-4 bottom-[calc(7.5rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-3 px-4 py-3">
          <span className="m-caption min-w-0 flex-1">
            {selected.length} of {MAX_COMPARE} selected
          </span>
          <button
            type="button"
            onClick={clearCompare}
            className="m-label m-press m-tap m-muted shrink-0"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={!canCompare(selected)}
            onClick={() => navigate(`/memory/compare?ids=${encodeCompare(selected)}`)}
            className="m-label m-press m-tap shrink-0 rounded-full bg-primary px-4 py-2 text-primary-foreground disabled:opacity-40"
          >
            Compare
          </button>
        </div>
      ) : null}

      <div className="m-glass m-glass-bottom fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-2 border-t border-border px-4 py-2.5">
        <label className="sr-only" htmlFor="memory-search">
          Search archived deals
        </label>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-card px-4">
          <Search className="m-muted h-4 w-4 shrink-0" aria-hidden="true" />
          <input
            id="memory-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search accounts, lessons, competitors"
            // 16px minimum, or iOS zooms the viewport on focus.
            className="m-tap h-12 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="m-press shrink-0"
            >
              <X className="m-muted h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setFacetsOpen(true)}
          aria-label="Filter by competitor"
          className={cn(
            "m-press flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-card",
            competitor ? "text-primary" : "text-foreground",
          )}
        >
          <Check className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <MSheet
        open={facetsOpen}
        onOpenChange={setFacetsOpen}
        title="Filter the archive"
        description="Narrow by who else was in the deal."
      >
        <FacetList
          title="Competitor"
          values={facets?.competitors ?? []}
          active={competitor}
          onSelect={(value) => {
            setCompetitor(value);
            setFacetsOpen(false);
          }}
        />
      </MSheet>
    </>
  );
}

/**
 * The facet values the archive actually holds, with their counts.
 *
 * Counts are the whole point: "Vendor X (14)" is a filter worth tapping and
 * "Vendor Y (1)" is a coincidence, and without the number they look identical.
 */
function FacetList({
  title,
  values,
  active,
  onSelect,
}: {
  title: string;
  values: FacetValue[];
  active: string | null;
  onSelect: (value: string | null) => void;
}) {
  if (values.length === 0) {
    return <p className="m-body m-muted py-4">No competitors recorded in the archive yet.</p>;
  }

  return (
    <div className="pt-1">
      <p className="m-label m-muted mb-2">{title}</p>
      <ul className="m-card overflow-hidden">
        <li>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="m-tap m-press flex w-full items-center gap-3 px-4 py-3 text-left"
          >
            <span className="m-headline min-w-0 flex-1">Any</span>
            {active == null ? (
              <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            ) : null}
          </button>
        </li>
        {values.map((facet) => (
          <li key={facet.value} className="border-t border-border">
            <button
              type="button"
              onClick={() => onSelect(facet.value)}
              className="m-tap m-press flex w-full items-center gap-3 px-4 py-3 text-left"
            >
              <span className="m-headline min-w-0 flex-1 truncate">{facet.value}</span>
              <span className="m-caption m-muted m-num shrink-0">{facet.count}</span>
              {active === facet.value ? (
                <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MemoryCard({
  memory,
  selected,
  selecting,
  onToggle,
}: {
  memory: DealMemory;
  selected: boolean;
  selecting: boolean;
  onToggle: () => void;
}) {
  const outcome = normalizeOutcome(memory.outcome);
  const tcv = memory.finalTcv != null ? Number(memory.finalTcv) : null;
  const cardRef = useRef<HTMLAnchorElement>(null);
  const badgeClass = cn(OUTCOME_CLASS[outcome].bg, OUTCOME_CLASS[outcome].text);
  // The arriving side of the morph back from the detail screen. Only the card
  // and the outcome pill travel, matching the outbound trip — the account line
  // and deal name go into the detail nav bar, which carries its own transition
  // name, and a part with nothing to morph into animates out alone.
  const shared = useSharedCardStyle(memory.id);

  return (
    <div className={cn("relative", selected && "ring-2 ring-primary rounded-2xl")}>
      <Link
        ref={cardRef}
        href={`/memory/${memory.id}`}
        onClick={() =>
          armSharedCard(
            memory.id,
            {
              eyebrow: memory.accountName,
              title: memory.dealName,
              value: OUTCOME_LABEL[outcome],
              valueClassName: badgeClass,
            },
            cardRef.current,
          )
        }
        className="m-card m-press m-reveal block p-4"
        style={shared("card")}
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
          <OutcomePill sharedPart="value" style={shared("value")} className={cn("shrink-0", badgeClass)}>
            {OUTCOME_LABEL[outcome]}
          </OutcomePill>
        </div>

        <div className="m-caption m-muted mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {tcv != null && Number.isFinite(tcv) ? (
            <span className="m-num text-foreground">{compactCurrency(tcv)}</span>
          ) : null}
          {memory.totalDaysActive != null ? <span>{memory.totalDaysActive}d active</span> : null}
          <span>{formatDate(memory.archivedAt, "—")}</span>
        </div>

        {memory.snippet ? (
          <p className="m-body m-muted mt-2 line-clamp-2">{memory.snippet}</p>
        ) : null}
      </Link>

      {/* Its own target, outside the Link, so tapping the card still opens the
          record while tapping the box selects it. Nested interactives inside an
          anchor are invalid HTML and unreliable on touch. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={`Select ${memory.dealName} to compare`}
        onClick={onToggle}
        className={cn(
          "absolute bottom-2 right-2 flex h-11 w-11 items-center justify-center rounded-full",
          "m-press transition-opacity duration-[var(--m-dur-quick)]",
          // Faint until the reader is plainly in a comparison, then solid. It is
          // always present and always tappable — only its prominence changes.
          selecting || selected ? "opacity-100" : "opacity-45",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md border-2",
            selected ? "border-primary bg-primary" : "border-border bg-card",
          )}
        >
          {selected ? (
            <Check className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={3.5} />
          ) : null}
        </span>
      </button>
    </div>
  );
}
