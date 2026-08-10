import { useCallback, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import {
  decodeRosterUrl,
  encodeRosterUrl,
} from "@/components/roster/model/roster-url";
import type {
  RosterFilters,
  RosterView,
  SortSpec,
  GroupBy,
} from "@/components/roster/model/roster-types";
import { countActiveFilters } from "@/mobile/screens/deals/deals-href";

export interface RosterUrlState {
  view: RosterView;
  /** The saved view a `?view=` pointer names, if any. */
  viewId: string | null;
  setView: (next: RosterView, viewId?: string | null) => void;
  setFilters: (patch: Partial<RosterFilters>) => void;
  setSort: (sort: SortSpec[]) => void;
  setGroup: (group: GroupBy) => void;
  /** Replaces rather than pushes — for a value that changes on every keystroke. */
  setSearch: (search: string) => void;
  clearFilters: () => void;
  /**
   * How many filter dimensions are narrowing the list. Search is excluded: it
   * has its own visible field, and counting it would put a badge on the Filter
   * button for something the reader can already see.
   */
  activeFilterCount: number;
}

/**
 * The Deals list state, held in the URL.
 *
 * ## Why the URL and not useState
 *
 * The screen this replaces kept its filter in component state and read the query
 * string exactly once, as an initial value. Three things follow from that, and
 * all three were true of it: the back gesture could not undo a filter change; a
 * filtered list could not be shared or bookmarked; and the Command Center could
 * not link to one, which is why its figures opened dialogs instead.
 *
 * Desktop already solved this — `roster-url.ts` is a tested codec and the
 * desktop roster has used it as its source of truth for phases. This hook is the
 * phone's adapter onto the same codec, not a second implementation of it.
 *
 * ## Push versus replace, and why the animation had to change
 *
 * Filter, sort, group and saved-view changes PUSH, so each one is a history
 * entry the back gesture undoes. Search REPLACES, or the back stack would fill
 * with one entry per keystroke and backing out of a search would mean pressing
 * back eleven times.
 *
 * A push used to animate as a forward slide, which on a filter change implied
 * the reader had gone somewhere when the list had merely re-cut itself. That is
 * fixed in `isLateralMove` (mobile-nav.ts): a change of query on the path you
 * are already on is lateral, so these push a real entry and cross-fade.
 */
export function useRosterUrl(): RosterUrlState {
  const search = useSearch();
  const [, navigate] = useLocation();

  const { view, viewId } = useMemo(() => decodeRosterUrl(search), [search]);

  const write = useCallback(
    (next: RosterView, nextViewId: string | null, replace: boolean) => {
      const query = encodeRosterUrl(next, nextViewId);
      navigate(query ? `/deals?${query}` : "/deals", { replace });
    },
    [navigate],
  );

  const setView = useCallback(
    (next: RosterView, nextViewId: string | null = null) => write(next, nextViewId, false),
    [write],
  );

  const setFilters = useCallback(
    (patch: Partial<RosterFilters>) => {
      // The saved-view pointer is dropped on any manual edit. Keeping it would
      // leave the chip row claiming "RED Alerts" while the list showed something
      // else — a label that lies is worse than no label.
      write({ ...view, filters: { ...view.filters, ...patch } }, null, false);
    },
    [view, write],
  );

  const setSort = useCallback(
    (sort: SortSpec[]) => write({ ...view, sort }, viewId, false),
    [view, viewId, write],
  );

  const setGroup = useCallback(
    (group: GroupBy) => write({ ...view, group }, viewId, false),
    [view, viewId, write],
  );

  const setSearch = useCallback(
    (nextSearch: string) => {
      write({ ...view, filters: { ...view.filters, search: nextSearch } }, viewId, true);
    },
    [view, viewId, write],
  );

  const clearFilters = useCallback(() => {
    // Search survives a filter clear: the reader typed it, it is visible in the
    // dock, and silently emptying a field somebody is looking at is startling.
    write(
      {
        filters: { ...decodeRosterUrl("").view.filters, search: view.filters.search },
        sort: view.sort,
        group: view.group,
      },
      null,
      false,
    );
  }, [view, write]);

  const activeFilterCount = useMemo(() => countActiveFilters(view.filters), [view.filters]);

  return {
    view,
    viewId,
    setView,
    setFilters,
    setSort,
    setGroup,
    setSearch,
    clearFilters,
    activeFilterCount,
  };
}
