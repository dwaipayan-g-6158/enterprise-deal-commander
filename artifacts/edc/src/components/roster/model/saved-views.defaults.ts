// Built-in saved views. These always exist (cannot be deleted/edited); user
// custom views live alongside them in localStorage. `id` is stable so a `?view=`
// pointer in a shared URL resolves correctly.
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  DEFAULT_STALE_STAGE_DAYS,
  type SavedView,
} from "./roster-types";

function view(partial: Partial<SavedView["view"]["filters"]>, rest: Partial<SavedView["view"]> = {}): SavedView["view"] {
  return {
    filters: { ...DEFAULT_FILTERS, ...partial },
    sort: rest.sort ?? DEFAULT_SORT,
    group: rest.group ?? "none",
  };
}

export const BUILTIN_VIEWS: SavedView[] = [
  {
    id: "all-active",
    name: "All Active",
    builtIn: true,
    view: view({}),
  },
  {
    id: "red-alerts",
    name: "RED Alerts",
    builtIn: true,
    view: view({ health: ["RED"] }, { sort: [{ key: "calculatedTCV", dir: "desc" }] }),
  },
  {
    id: "stalled",
    name: "Stalled",
    builtIn: true,
    // Days-in-stage, not the velocity buckets. Those are relative to a deal's
    // stage peers, so any deal without peers has no benchmark and is excluded —
    // which made this chip render an empty list on a pipeline holding one deal
    // per stage. A static view has no query to read the live threshold from, so
    // it takes the documented default.
    view: view(
      { staleMinDays: DEFAULT_STALE_STAGE_DAYS },
      { sort: [{ key: "velocity", dir: "desc" }] },
    ),
  },
  {
    id: "closing-soon",
    name: "Closing Soon",
    builtIn: true,
    view: view({ closePreset: "30d" }, { sort: [{ key: "expectedCloseDate", dir: "asc" }] }),
  },
  {
    id: "top-value",
    name: "Top by Value",
    builtIn: true,
    view: view({}, { sort: [{ key: "calculatedTCV", dir: "desc" }] }),
  },
  {
    id: "by-stage",
    name: "By Stage",
    builtIn: true,
    view: view({}, { group: "salesStage", sort: [{ key: "calculatedTCV", dir: "desc" }] }),
  },
  {
    id: "closed",
    name: "Closed",
    builtIn: true,
    view: view({ closure: "closed" }, { group: "salesStage", sort: [{ key: "calculatedTCV", dir: "desc" }] }),
  },
];

export const BUILTIN_VIEW_IDS = new Set(BUILTIN_VIEWS.map((v) => v.id));
