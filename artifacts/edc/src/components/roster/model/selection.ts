// Pure selection-safety helper. Bulk actions (Archive/Delete) must never act
// on a deal the user can no longer see — see the audit finding this fixes:
// selecting rows, then narrowing the filters so those rows scroll off screen,
// used to leave the bulk bar armed ("2 selected", Archive/Delete enabled)
// against deals that were no longer rendered anywhere on the page.
//
// Fix is a standing invariant, not a one-off guard: `selected` is always kept
// as `selected ∩ visible`, so "selected but hidden" is unrepresentable rather
// than merely rare. Callers re-apply this at the point of action too (belt +
// braces — destructive safety shouldn't depend solely on an effect having
// already run before the click lands).

/**
 * Prunes `selected` down to the ids present in `visibleIds`. Returns the same
 * `Set` instance (not a copy) when nothing was dropped, so a
 * `setSelected(prev => pruneSelection(prev, visible))` bails out of the
 * re-render instead of creating a new Set every time the visible rows are
 * merely reordered.
 */
export function pruneSelection(selected: Set<string>, visibleIds: readonly string[]): Set<string> {
  if (selected.size === 0) return selected;
  const visible = new Set(visibleIds);
  const next = new Set<string>();
  for (const id of selected) {
    if (visible.has(id)) next.add(id);
  }
  // `next` is always a subset of `selected` by construction, so equal size
  // means identical membership — safe to keep the original reference.
  return next.size === selected.size ? selected : next;
}
