import { useMemo } from "react";
import { computeDerivedRows, type DerivedRows } from "../model/derive-rows";
import type { RosterRow, RosterView } from "../model/roster-types";

// Thin memo wrapper around the pure pipeline. `now` is recomputed only when the
// inputs change (close-date presets don't need sub-render precision).
export function useDerivedRows(rows: RosterRow[], view: RosterView): DerivedRows {
  return useMemo(() => computeDerivedRows(rows, view, Date.now()), [rows, view]);
}
