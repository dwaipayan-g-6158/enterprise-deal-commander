# Managed Risks Visibility — Design Spec
**Date:** 2026-06-30
**Status:** Approved

## Problem

When a risk is snoozed, acknowledged, or accepted, it moves from `governance.alerts` (unmanaged) to `governance.managedAlerts`. The Risk tab only renders `governance.alerts`, so managed risks become completely invisible — no badge indicator, no list entry. The user has no way to see or act on managed risks without going to the Activity Feed, which shows audit rows but not the alert card with its "Clear Disposition" button.

## Solution

Two complementary changes:

### 1. Tab Badge — Secondary Managed Count

The "Risk" tab badge currently shows a red count of active (unmanaged) alerts. Extend it to show a muted secondary count when managed risks exist:

| State | Badge |
|---|---|
| 3 active, 2 managed | `3` (red) · `2 managed` (muted) |
| 2 active, 0 managed | `2` (red) — unchanged |
| 0 active, 3 managed | `· 3 managed` (muted, no red badge) |
| 0 active, 0 managed | no badge — unchanged |

### 2. Risk Tab — Collapsible Managed Section

Below the active alert cards, add a dashed-border collapsible toggle: **"Managed risks · N"**. Collapsed by default. When expanded, renders the managed alert cards at 65% opacity with:
- Disposition badge (Snoozed / Acknowledged / Accepted)
- "Why this fired" expander (same as active cards)
- **"Clear Disposition"** button only — no Acknowledge/Snooze/Accept actions (those only apply to unmanaged alerts)

The collapsible is hidden entirely when `managedAlerts.length === 0`.

## Files Changed

| File | Change |
|---|---|
| `artifacts/edc/src/components/cockpit/cockpit-tabs.ts` | Update `alertCount` signature to also accept/return managed count, or expose a separate helper |
| `artifacts/edc/src/pages/deal-cockpit.tsx` | Pull `intel.governance.managedAlerts.length`, pass to badge render; pass `managedAlerts` to `<RiskGovernance>` |
| `artifacts/edc/src/components/cockpit/risk-governance.tsx` | Add `managedAlerts` prop; render collapsible section with dimmed full cards |

## Constraints

- No backend changes — `managedAlerts` is already returned by the intelligence API.
- `AlertCard` is reused for managed cards. When `alert.disposition !== null`, the card renders only the "Clear Disposition" button instead of the three disposition actions.
- The existing `alertCount` used for the red badge (only counts unmanaged) is preserved — managed count is additive.
- Collapsible state is local React state (not persisted) — resets on navigation.

## Out of Scope

- Auto-expiry of snooze on field change (noted as unimplemented; separate feature).
- Risk Simulator managed/unmanaged split (already handles both lists correctly).
