# Managed Risks Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show managed (snoozed/acknowledged/accepted) risks in the Risk tab badge and via a collapsible section below active alerts.

**Architecture:** Three surgical changes — a new `managedAlertCount` helper in `cockpit-tabs.ts`, badge + prop wiring in `deal-cockpit.tsx`, and a collapsible managed-cards section inside `RiskGovernance`. The existing `AlertCard` component is reused with a `isManaged` flag that hides the three disposition-action buttons and shows only "Clear Disposition". No backend changes.

**Tech Stack:** React 19, TypeScript, Tailwind v4, shadcn/ui (`Collapsible`), Vitest, pnpm workspace.

## Global Constraints

- Use `pnpm` only — `preinstall` rejects npm/yarn.
- Run typechecks with `pnpm run typecheck` before claiming work compiles.
- Run tests with `pnpm --filter @workspace/edc exec vitest run <file>`.
- `managedAlerts` is already present in the `IntelligenceGovernance` response type — do not change any API or engine code.
- Follow existing Tailwind + shadcn/ui patterns; do not introduce new dependencies.

---

### Task 1: Add `managedAlertCount` helper to `cockpit-tabs.ts`

**Files:**
- Modify: `artifacts/edc/src/components/cockpit/cockpit-tabs.ts`
- Test: `artifacts/edc/src/components/cockpit/cockpit-tabs.test.ts`

**Interfaces:**
- Produces: `managedAlertCount(alerts: { disposition?: unknown }[] | undefined): number` — counts alerts where `disposition` is non-null/non-undefined. Exported from `cockpit-tabs.ts`. Used by Task 2.

- [ ] **Step 1: Write failing tests**

Add to `artifacts/edc/src/components/cockpit/cockpit-tabs.test.ts` after the existing `alertCount` test:

```ts
import { describe, it, expect } from "vitest";
import { COCKPIT_GROUPS, groupForSub, alertCount, managedAlertCount } from "./cockpit-tabs";

// ... keep all existing tests ...

it("managedAlertCount counts alerts with a non-null disposition", () => {
  expect(managedAlertCount([
    { disposition: { state: "snoozed" } },
    { disposition: null },
    { disposition: { state: "accepted" } },
    { disposition: undefined },
  ])).toBe(2);
  expect(managedAlertCount([])).toBe(0);
  expect(managedAlertCount(undefined)).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm --filter @workspace/edc exec vitest run src/components/cockpit/cockpit-tabs.test.ts
```

Expected: FAIL — `managedAlertCount` is not exported from `./cockpit-tabs`.

- [ ] **Step 3: Implement `managedAlertCount`**

In `artifacts/edc/src/components/cockpit/cockpit-tabs.ts`, add after the existing `alertCount` function:

```ts
/** Count managed alerts (those with a non-null disposition) for the Risk tab badge. */
export function managedAlertCount(alerts: { disposition?: unknown }[] | undefined): number {
  return (alerts ?? []).filter((a) => a.disposition != null).length;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
pnpm --filter @workspace/edc exec vitest run src/components/cockpit/cockpit-tabs.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Typecheck**

```
pnpm run typecheck
```

Expected: No errors.

- [ ] **Step 6: Commit**

```
git add artifacts/edc/src/components/cockpit/cockpit-tabs.ts artifacts/edc/src/components/cockpit/cockpit-tabs.test.ts
git commit -m "feat: add managedAlertCount helper to cockpit-tabs"
```

---

### Task 2: Wire managed count into badge and pass `managedAlerts` to `RiskGovernance`

**Files:**
- Modify: `artifacts/edc/src/pages/deal-cockpit.tsx`

**Interfaces:**
- Consumes: `managedAlertCount` from `cockpit-tabs.ts` (Task 1). `intel.governance.managedAlerts` — already in the API response type as `Alert[]`.
- Produces: `<RiskGovernance dealId={id} alerts={...} managedAlerts={...} />` — the `managedAlerts` prop is new. Used by Task 3.

- [ ] **Step 1: Update the import in `deal-cockpit.tsx`**

Find the existing import line (line ~27):
```ts
import { COCKPIT_GROUPS, alertCount } from "@/components/cockpit/cockpit-tabs";
```

Replace with:
```ts
import { COCKPIT_GROUPS, alertCount, managedAlertCount } from "@/components/cockpit/cockpit-tabs";
```

- [ ] **Step 2: Derive `managedCount` alongside `redAlerts`**

Find (line ~192):
```ts
const redAlerts = alertCount(intel.governance.alerts);
```

Replace with:
```ts
const redAlerts = alertCount(intel.governance.alerts);
const managedCount = managedAlertCount(intel.governance.managedAlerts);
```

- [ ] **Step 3: Update the Risk tab badge JSX**

Find the badge render block (lines ~354–358):
```tsx
{g.id === "risk" && redAlerts > 0 && (
  <span className="ml-2 inline-flex items-center justify-center rounded-full bg-destructive/15 text-destructive text-[10px] font-bold min-w-[18px] h-[18px] px-1.5 tabular-nums">
    {redAlerts}
  </span>
)}
```

Replace with:
```tsx
{g.id === "risk" && redAlerts > 0 && (
  <span className="ml-2 inline-flex items-center justify-center rounded-full bg-destructive/15 text-destructive text-[10px] font-bold min-w-[18px] h-[18px] px-1.5 tabular-nums">
    {redAlerts}
  </span>
)}
{g.id === "risk" && managedCount > 0 && (
  <span className="ml-1 text-[10px] font-medium text-muted-foreground tabular-nums">
    · {managedCount} managed
  </span>
)}
```

- [ ] **Step 4: Pass `managedAlerts` to `RiskGovernance`**

Find (line ~196):
```tsx
case "risk": return <RiskGovernance dealId={id} alerts={intel.governance.alerts} />;
```

Replace with:
```tsx
case "risk": return (
  <RiskGovernance
    dealId={id}
    alerts={intel.governance.alerts}
    managedAlerts={intel.governance.managedAlerts ?? []}
  />
);
```

- [ ] **Step 5: Typecheck**

```
pnpm run typecheck
```

Expected: Error on `managedAlerts` prop — `RiskGovernance` doesn't accept it yet. This is expected; Task 3 fixes it.

- [ ] **Step 6: Commit**

```
git add artifacts/edc/src/pages/deal-cockpit.tsx
git commit -m "feat: wire managed risk count into badge and pass managedAlerts prop"
```

---

### Task 3: Add collapsible managed-risks section to `RiskGovernance`

**Files:**
- Modify: `artifacts/edc/src/components/cockpit/risk-governance.tsx`

**Interfaces:**
- Consumes: `managedAlerts: Alert[]` new prop on `RiskGovernance`. `Alert` is already imported from `@workspace/api-client-react`.
- Consumes: `AlertCard` — existing internal component in the same file. Extended with optional `isManaged?: boolean` prop.

- [ ] **Step 1: Add `isManaged` prop to `AlertCard` — hide disposition actions, show only Clear**

Find the `AlertCard` function signature (line ~36):
```ts
function AlertCard({ dealId, alert }: { dealId: string; alert: Alert }) {
```

Replace with:
```ts
function AlertCard({ dealId, alert, isManaged = false }: { dealId: string; alert: Alert; isManaged?: boolean }) {
```

Then find the action buttons block (lines ~158–181):
```tsx
<div className="flex flex-wrap gap-2 pt-1">
  {alert.disposition ? (
    <Button size="sm" variant="outline" onClick={clear} disabled={clearDisposition.isPending}>
      Clear Disposition
    </Button>
  ) : (
    <>
      <Button size="sm" variant="outline" onClick={() => apply("acknowledge")} disabled={setDisposition.isPending}>
        Acknowledge
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => apply("snooze", { snooze_until_field_change: "any" })}
        disabled={setDisposition.isPending}
      >
        Snooze
      </Button>
      <Button size="sm" variant="outline" onClick={() => setShowAccept((s) => !s)}>
        Accept Risk
      </Button>
    </>
  )}
</div>
```

Replace with:
```tsx
<div className="flex flex-wrap gap-2 pt-1">
  {isManaged || alert.disposition ? (
    <Button size="sm" variant="outline" onClick={clear} disabled={clearDisposition.isPending}>
      Clear Disposition
    </Button>
  ) : (
    <>
      <Button size="sm" variant="outline" onClick={() => apply("acknowledge")} disabled={setDisposition.isPending}>
        Acknowledge
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => apply("snooze", { snooze_until_field_change: "any" })}
        disabled={setDisposition.isPending}
      >
        Snooze
      </Button>
      <Button size="sm" variant="outline" onClick={() => setShowAccept((s) => !s)}>
        Accept Risk
      </Button>
    </>
  )}
</div>
```

- [ ] **Step 2: Add `Collapsible` imports**

At the top of `risk-governance.tsx`, find the existing import block. Add `useState` to the React import if not already present (it is), and add the Collapsible import:

```ts
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Shield } from "lucide-react";
```

Note: `ChevronDown` and `Shield` may already be imported — check first and only add what's missing.

- [ ] **Step 3: Update `RiskGovernance` props and add collapsible section**

Find the `RiskGovernance` function signature (line ~226):
```ts
export function RiskGovernance({ dealId, alerts }: { dealId: string; alerts: Alert[] }) {
```

Replace with:
```ts
export function RiskGovernance({ dealId, alerts, managedAlerts = [] }: { dealId: string; alerts: Alert[]; managedAlerts?: Alert[] }) {
```

Then add `useState` for open state inside the function body, right after the opening brace:
```ts
const [managedOpen, setManagedOpen] = useState(false);
```

Then find the return statement's closing `</div>` (the one wrapping all alert cards):
```tsx
return (
  <div className="space-y-4">
    {alerts.map((alert) => (
      <AlertCard key={alert.code} dealId={dealId} alert={alert} />
    ))}
  </div>
);
```

Replace with:
```tsx
return (
  <div className="space-y-4">
    {alerts.map((alert) => (
      <AlertCard key={alert.code} dealId={dealId} alert={alert} />
    ))}

    {managedAlerts.length > 0 && (
      <Collapsible open={managedOpen} onOpenChange={setManagedOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-3 py-2.5 rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
            <span className="flex items-center gap-2 text-xs font-medium">
              <Shield className="h-3.5 w-3.5" />
              Managed risks
              <span className="inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground text-[10px] font-semibold min-w-[18px] h-[18px] px-1.5 tabular-nums border border-border">
                {managedAlerts.length}
              </span>
            </span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${managedOpen ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 space-y-3 opacity-65">
            {managedAlerts.map((alert) => (
              <AlertCard key={alert.code} dealId={dealId} alert={alert} isManaged />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    )}
  </div>
);
```

- [ ] **Step 4: Typecheck**

```
pnpm run typecheck
```

Expected: No errors.

- [ ] **Step 5: Verify in browser**

With both `pnpm --filter @workspace/api-server run dev` and `pnpm --filter @workspace/edc run dev` running:

1. Open a deal that has at least one active risk.
2. Apply "Snooze" or "Acknowledge" to one alert.
3. Verify the Risk tab badge shows `· 1 managed` alongside or instead of the red count.
4. Verify the Risk tab panel shows a "Managed risks · 1" toggle at the bottom.
5. Click the toggle — confirm the managed card appears, dimmed, with only "Clear Disposition" button.
6. Click "Clear Disposition" — confirm the card disappears from managed and reappears in active alerts.
7. Open a deal with zero risks — confirm no managed section appears.

- [ ] **Step 6: Commit**

```
git add artifacts/edc/src/components/cockpit/risk-governance.tsx
git commit -m "feat: show managed risks in collapsible section with Clear Disposition"
```
