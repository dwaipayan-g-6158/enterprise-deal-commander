import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, Search, SlidersHorizontal, X } from "lucide-react";
import { compactCurrency } from "@/lib/format";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useRosterData } from "@/components/roster/hooks/use-roster-data";
import { useDerivedRows } from "@/components/roster/hooks/use-derived-rows";
import { isDefaultView } from "@/components/roster/model/roster-url";
import { BUILTIN_VIEWS } from "@/components/roster/model/saved-views.defaults";
import type { RosterGroup } from "@/components/roster/model/derive-rows";
import { MNavBar } from "@/mobile/shell/m-nav-bar";
import { MNavBrand } from "@/mobile/shell/m-nav-brand";
import { MAvatar } from "@/mobile/shell/m-avatar";
import { SegmentChips, type Segment } from "@/mobile/components/segment-chips";
import { DockButton } from "@/mobile/components/dock-button";
import { Shimmer } from "@/mobile/components/shimmer";
import { EmptyState, ErrorState } from "@/mobile/components/states";
import { PullToRefresh } from "@/mobile/components/pull-to-refresh";
import { DealCard } from "@/mobile/screens/deals/deal-card";
import { FilterSheet } from "@/mobile/screens/deals/filter-sheet";
import { SortSheet } from "@/mobile/screens/deals/sort-sheet";
import { useRosterUrl } from "@/mobile/screens/deals/use-roster-url";

/** One keystroke per request is a request per keystroke. */
const SEARCH_DEBOUNCE_MS = 280;

/**
 * The pipeline, as a card list.
 *
 * ## Card list only, and the board is not missed
 *
 * Table and timeline need width that a phone does not have. The board existed on
 * desktop chiefly to host drag-to-move-stage, and that write now lives on
 * `/deals/:id/stage` where the guardrail has room to explain why an advance was
 * refused. What was genuinely useful about the board survives as grouping: band
 * the list by stage and the group headers carry the same subtotals the columns
 * did, in one column instead of six.
 *
 * ## The list is what the URL says it is
 *
 * `useRosterUrl` holds filters, sort and grouping in the address, and
 * `computeDerivedRows` — the desktop roster's own pipeline — turns them into
 * rows. The screen this replaces hand-rolled a four-segment filter and a
 * `.sort()`, which is a second implementation of a tested one, and it is exactly
 * how a phone and a laptop end up disagreeing about which deals are stalled.
 *
 * ## Search is docked, not hidden
 *
 * It used to live inside the Commander capsule's sheet. A list screen that hides
 * its own search behind a floating button is a puzzle, and the thumb zone is
 * where the search field should be anyway.
 */
export function DealsScreen() {
  const url = useRosterUrl();
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  // Typed immediately, written to the address on a delay. The URL stays the
  // source of truth; this is just the field keeping up with the finger.
  const [typed, setTyped] = useState(url.view.filters.search);
  const debounced = useDebouncedValue(typed, SEARCH_DEBOUNCE_MS);

  // Adopt a search arriving from outside — a shared link, or the back gesture
  // stepping through history. Guarded on the value genuinely differing, or this
  // would fight the field on every keystroke.
  const urlSearch = url.view.filters.search;
  useEffect(() => {
    setTyped((current) => (current === urlSearch ? current : urlSearch));
  }, [urlSearch]);

  const setSearch = url.setSearch;
  useEffect(() => {
    if (debounced !== urlSearch) setSearch(debounced);
  }, [debounced, urlSearch, setSearch]);

  const { rows, isLoading, isError, refetch } = useRosterData({
    state: url.view.filters.state,
    search: debounced,
  });
  const derived = useDerivedRows(rows, url.view);

  const currency = rows[0]?.dealCurrency ?? "USD";
  const money = (n: number) => compactCurrency(n, currency);

  const activeViewId = useMemo(() => {
    if (url.viewId) return url.viewId;
    // An untouched address IS the All Active view. Without this the chip row
    // would sit blank on the screen's own default state, which reads as a
    // control that has not loaded.
    return isDefaultView(url.view) ? "all-active" : "";
  }, [url.viewId, url.view]);

  const viewSegments: Segment<string>[] = BUILTIN_VIEWS.map((v) => ({ id: v.id, label: v.name }));

  const totalTCV = derived.groups.reduce((sum, g) => sum + g.totalTCV, 0);
  const grouped = url.view.group !== "none";

  return (
    <>
      <MNavBar
        title="Deals"
        leading={<MNavBrand />}
        right={<MAvatar />}
        subtitle={
          isLoading
            ? undefined
            : `${derived.matchedCount} ${derived.matchedCount === 1 ? "deal" : "deals"} · ${money(totalTCV)}`
        }
        // Gated on isLoading, so the line arrives late and grows the bar. See
        // MNavBar's reserveSubtitle.
        reserveSubtitle
      >
        <SegmentChips
          segments={viewSegments}
          value={activeViewId}
          onChange={(id) => {
            const chosen = BUILTIN_VIEWS.find((v) => v.id === id);
            if (chosen) url.setView(chosen.view, chosen.id);
          }}
          label="Saved views"
        />
      </MNavBar>

      <PullToRefresh
        onRefresh={refetch}
        dock={
          // Docked above the tab bar, so the keyboard opens under the thumb
          // rather than shoving the whole screen up. The shell's pb-tabbar
          // already clears both this and the bar below it.
          //
          // Deliberately motionless during a pull. This screen usually has no
          // scroll range at all — a typical pipeline underfills the viewport — so
          // every downward drag here is a pull-to-refresh, and a search field
          // that shifted on every drag read as unstable. See pull-physics.ts.
          <div className="m-glass m-glass-bottom fixed inset-x-0 bottom-[var(--m-dock-bottom)] z-30 flex items-center gap-2 border-t border-border px-4 py-2.5">
            <label className="sr-only" htmlFor="deals-search">
              Search deals
            </label>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-card px-4">
              <Search className="m-muted h-4 w-4 shrink-0" aria-hidden="true" />
              <input
                id="deals-search"
                type="search"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Deal, account, competitor"
                // 16px minimum, or iOS zooms the viewport on focus.
                className="m-tap h-12 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground"
              />
              {typed ? (
                <button
                  type="button"
                  onClick={() => setTyped("")}
                  aria-label="Clear search"
                  className="m-press shrink-0"
                >
                  <X className="m-muted h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>

            <DockButton
              label="Filter deals"
              badge={url.activeFilterCount}
              onPress={() => setFilterOpen(true)}
            >
              <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
            </DockButton>
            <DockButton label="Sort and group" onPress={() => setSortOpen(true)}>
              <ArrowDownUp className="h-5 w-5" aria-hidden="true" />
            </DockButton>
          </div>
        }
      >
        <div className="space-y-3 p-4">
          {isError ? (
            <ErrorState
              title="Couldn't load deals"
              body="The pipeline didn't come back. Pull down to try again."
            />
          ) : isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Shimmer key={i} className="h-[132px] rounded-xl" />
            ))
          ) : derived.matchedCount === 0 ? (
            <EmptyState
              title={debounced ? "No matches" : "Nothing in this view"}
              body={
                debounced
                  ? "Try a shorter term, an account name, or clear the filters."
                  : "Widen the filters, or switch to All Active to see the whole pipeline."
              }
            />
          ) : (
            derived.groups.map((group) => (
              <GroupSection key={group.key || "all"} group={group} showHeader={grouped} money={money} />
            ))
          )}
        </div>
      </PullToRefresh>

      <FilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        filters={url.view.filters}
        rows={rows}
        currency={currency}
        onChange={url.setFilters}
        onClear={url.clearFilters}
        matchedCount={derived.matchedCount}
      />

      <SortSheet
        open={sortOpen}
        onOpenChange={setSortOpen}
        sort={url.view.sort}
        group={url.view.group}
        onSort={url.setSort}
        onGroup={url.setGroup}
      />
    </>
  );
}

/**
 * One band of the list.
 *
 * The header is what the Kanban column header was: a name, a count, the group's
 * cross-currency-comparable value, and how many of them are red. Sticky, so the
 * band you are reading always says which band it is — the one thing a long
 * grouped list on a small screen genuinely needs.
 */
function GroupSection({
  group,
  showHeader,
  money,
}: {
  group: RosterGroup;
  showHeader: boolean;
  money: (n: number) => string;
}) {
  return (
    <section className="space-y-3">
      {showHeader ? (
        // Offset rather than top-0: the nav bar is sticky too, and a group
        // header that stops at the top of the scrollport slides underneath it
        // instead of stacking below it.
        //
        // --m-navbar-h is the bar's MEASURED height, published by MNavBar. The
        // hard-coded 3.5rem this replaces was the height of a bare title row,
        // but this screen's bar also carries a reserved subtitle and the saved-
        // views chips — ~7.7rem in total — so the header stopped 67px behind the
        // bar and the frosted glass painted straight over it. It already
        // includes the safe-area inset (getBoundingClientRect covers padding),
        // so adding env(safe-area-inset-top) here would double-count it.
        <div className="m-glass sticky top-[var(--m-navbar-h)] z-20 -mx-1 flex items-baseline gap-2 rounded-lg px-3 py-2">
          <h2 className="m-label truncate">{group.label}</h2>
          <span className="m-caption m-muted m-num shrink-0">{group.rows.length}</span>
          <span className="m-caption m-muted m-num ml-auto shrink-0">{money(group.totalTCV)}</span>
          {group.redCount > 0 ? (
            <span className="m-caption m-num shrink-0 text-destructive">{group.redCount} red</span>
          ) : null}
        </div>
      ) : null}
      {group.rows.map((deal) => (
        <DealCard key={deal.id} deal={deal} />
      ))}
    </section>
  );
}
