import { useMemo } from "react";
import { BUILTIN_VIEW_IDS, BUILTIN_VIEWS } from "../model/saved-views.defaults";
import { encodeRosterUrl } from "../model/roster-url";
import type { RosterView, SavedView } from "../model/roster-types";

// Canonical view equality: two views are the same iff they serialize to the
// same query string (viewId excluded). Reuses the tested URL codec.
function sameView(a: RosterView, b: RosterView): boolean {
  return encodeRosterUrl(a) === encodeRosterUrl(b);
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `cv_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function useSavedViews(args: {
  view: RosterView;
  viewId: string | null;
  customViews: SavedView[];
  setCustomViews: (next: SavedView[] | ((prev: SavedView[]) => SavedView[])) => void;
  selectSavedView: (sv: SavedView) => void;
}) {
  const { view, viewId, customViews, setCustomViews, selectSavedView } = args;

  const allViews = useMemo(() => [...BUILTIN_VIEWS, ...customViews], [customViews]);
  const activeView = useMemo(() => allViews.find((v) => v.id === viewId) ?? null, [allViews, viewId]);

  // "Dirty" = a saved view is selected but the current view has diverged from it.
  const dirty = useMemo(() => (activeView ? !sameView(view, activeView.view) : false), [activeView, view]);

  const canSaveToActive = !!activeView && !BUILTIN_VIEW_IDS.has(activeView.id) && dirty;

  const createView = (name: string): SavedView => {
    const sv: SavedView = { id: newId(), name: name.trim() || "Untitled view", view };
    setCustomViews((prev) => [...prev, sv]);
    selectSavedView(sv);
    return sv;
  };

  // Persist the CURRENT view into an existing custom view (overwrite).
  const saveToView = (id: string) => {
    setCustomViews((prev) => prev.map((v) => (v.id === id ? { ...v, view } : v)));
  };

  const renameView = (id: string, name: string) => {
    setCustomViews((prev) => prev.map((v) => (v.id === id ? { ...v, name: name.trim() || v.name } : v)));
  };

  const deleteView = (id: string) => {
    setCustomViews((prev) => prev.filter((v) => v.id !== id));
  };

  return { allViews, customViews, activeView, dirty, canSaveToActive, createView, saveToView, renameView, deleteView };
}
