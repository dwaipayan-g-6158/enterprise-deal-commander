// Pure predicate for settings.tsx's tab-switch guard (F8). Split out so the
// "should we interrupt this switch" decision is unit-testable without
// mounting the Tabs tree.
//
// Radix Tabs unmounts inactive TabsContent by default (no `forceMount`), so
// any state that lives *inside* a tab's own subtree vanishes silently the
// moment the user clicks another tab — e.g. Score Weights' pct-editing state,
// which lives inside ScoringWeightsSettings. settings.tsx makes Tabs a
// controlled component and calls this before actually committing the switch.
// Only tabs whose unsaved state would genuinely be lost belong in
// dirtyByTab — see settings.tsx's comment on why Thresholds is excluded.
export function shouldConfirmTabSwitch(
  currentTab: string,
  nextTab: string,
  dirtyByTab: Partial<Record<string, boolean>>,
): boolean {
  return currentTab !== nextTab && Boolean(dirtyByTab[currentTab]);
}
