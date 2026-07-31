// Pure predicate for settings.tsx's tab-switch guard (F8). Split out so the
// "should we interrupt this switch" decision is unit-testable without
// mounting the Tabs tree.
//
// Radix Tabs unmounts inactive TabsContent by default (no `forceMount`), so
// an in-progress edit on the Thresholds or Score Weights tab vanishes
// silently the moment the user clicks another tab. settings.tsx makes Tabs a
// controlled component and calls this before actually committing the switch.
export function shouldConfirmTabSwitch(
  currentTab: string,
  nextTab: string,
  dirtyByTab: Partial<Record<string, boolean>>,
): boolean {
  return currentTab !== nextTab && Boolean(dirtyByTab[currentTab]);
}
