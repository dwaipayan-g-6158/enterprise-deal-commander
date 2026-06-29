// Built-in saved views. These always exist (cannot be deleted/edited); user
// custom views live alongside them in localStorage. `id` is stable so a `?view=`
// pointer in a shared URL resolves correctly.
import { DEFAULT_FILTERS, DEFAULT_SORT, type SavedView } from "./roster-types";

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
    view: view({ velocity: ["STALLED", "SLOW"] }, { sort: [{ key: "velocity", dir: "desc" }] }),
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
];

export const BUILTIN_VIEW_IDS = new Set(BUILTIN_VIEWS.map((v) => v.id));
