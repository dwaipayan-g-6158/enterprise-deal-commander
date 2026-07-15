import { useCallback, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";
import { COLUMN_ORDER, DEFAULT_VISIBLE } from "../model/roster-columns";
import {
  type ColumnLayout,
  type Density,
  type GroupBy,
  type RosterFilters,
  type RosterView,
  type SavedView,
  type SortSpec,
  type ViewMode,
} from "../model/roster-types";
import type { BandBy } from "../model/board";
import { decodeRosterUrl, encodeRosterUrl } from "../model/roster-url";

// Persisted (localStorage) — versioned keys so the shape can evolve safely.
const DENSITY_KEY = "edc.roster.density.v1";
const COLUMNS_KEY = "edc.roster.columns.v1";
const VIEWS_KEY = "edc.roster.customViews.v1";
const VIEWMODE_KEY = "edc.roster.viewMode.v1";
const BOARDBAND_KEY = "edc.roster.boardBand.v1";

const DEFAULT_LAYOUT: ColumnLayout = {
  visible: DEFAULT_VISIBLE,
  order: COLUMN_ORDER,
  width: {},
};

/**
 * Central roster state. The *view* (filters/sort/group + saved-view pointer)
 * lives in the URL so it is shareable; *density / column layout / custom views*
 * live in localStorage (single-user, Catalyst-migration friendly). Selection,
 * focus, expansion and the preview target stay in component memory (not here).
 */
export function useRosterState() {
  const search = useSearch();
  const [location, navigate] = useLocation();

  const { view, viewId } = useMemo(() => decodeRosterUrl(search), [search]);

  // Write the view back to the URL. `replace` (default) avoids flooding history
  // on high-frequency changes like typing in a range field. Pass viewId to keep
  // / set / clear the saved-view pointer.
  const writeUrl = useCallback(
    (next: RosterView, nextViewId: string | null, replace = true) => {
      const qs = encodeRosterUrl(next, nextViewId);
      const target = qs ? `${location}?${qs}` : location;
      navigate(target, { replace });
    },
    [location, navigate],
  );

  const setFilters = useCallback(
    (patch: Partial<RosterFilters> | ((f: RosterFilters) => RosterFilters)) => {
      const filters = typeof patch === "function" ? patch(view.filters) : { ...view.filters, ...patch };
      writeUrl({ ...view, filters }, viewId);
    },
    [view, viewId, writeUrl],
  );

  const setSort = useCallback(
    (sort: SortSpec[]) => writeUrl({ ...view, sort }, viewId),
    [view, viewId, writeUrl],
  );

  const setGroup = useCallback(
    (group: GroupBy) => writeUrl({ ...view, group }, viewId),
    [view, viewId, writeUrl],
  );

  // Toggle/extend multi-key sort: clicking a header cycles asc -> desc; holding
  // shift appends a secondary key.
  const toggleSort = useCallback(
    (key: SortSpec["key"], additive = false) => {
      const existing = view.sort.find((s) => s.key === key);
      let next: SortSpec[];
      if (existing) {
        const flipped: SortSpec = { key, dir: existing.dir === "asc" ? "desc" : "asc" };
        next = additive ? view.sort.map((s) => (s.key === key ? flipped : s)) : [flipped];
      } else {
        const added: SortSpec = { key, dir: "asc" };
        next = additive ? [...view.sort, added] : [added];
      }
      setSort(next);
    },
    [view.sort, setSort],
  );

  const selectSavedView = useCallback(
    (sv: SavedView) => writeUrl(sv.view, sv.id, false),
    [writeUrl],
  );

  const setView = useCallback(
    (next: RosterView, nextViewId: string | null = null) => writeUrl(next, nextViewId, false),
    [writeUrl],
  );

  // localStorage-backed prefs.
  const [density, setDensity] = useLocalStorageState<Density>(DENSITY_KEY, "comfortable", { version: 1 });
  const [columnLayout, setColumnLayout] = useLocalStorageState<ColumnLayout>(COLUMNS_KEY, DEFAULT_LAYOUT, {
    version: 1,
  });
  const [customViews, setCustomViews] = useLocalStorageState<SavedView[]>(VIEWS_KEY, [], { version: 1 });
  // View mode (table vs board) is presentation, not part of the shareable view —
  // it lives in localStorage like density/columns and is meaningful only at lg+.
  const [viewMode, setViewMode] = useLocalStorageState<ViewMode>(VIEWMODE_KEY, "table", { version: 1 });
  // Board-only: how each stage column bands its cards (risk / health / committed / none).
  const [boardBand, setBoardBand] = useLocalStorageState<BandBy>(BOARDBAND_KEY, "risk", { version: 1 });

  return {
    // URL view
    view,
    viewId,
    setFilters,
    setSort,
    setGroup,
    toggleSort,
    selectSavedView,
    setView,
    // persisted prefs
    density,
    setDensity,
    columnLayout,
    setColumnLayout,
    customViews,
    setCustomViews,
    viewMode,
    setViewMode,
    boardBand,
    setBoardBand,
  };
}

export type RosterStateApi = ReturnType<typeof useRosterState>;
