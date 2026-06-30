# Spec 1 — Quick Wins (Lookups, Forms, Currency, Tooltips, Playbook seed)

Date: 2026-06-30
Status: Approved (execution)

Part of a 3-spec phased plan from the TODO list:
- **Spec 1 (this doc)** — quick wins: A (global), B1–B8 (new-deal form), C2/C3/C4.
- **Spec 2** — replace "Point-in-time view" with a multi-metric **Deal Trajectory** chart (C1).
- **Spec 3** — Commercial tab **standalone calculator** rework (C6) + Factor Breakdown redesign (C5).

## Approved design decisions
- **A1 currency:** lock UI to **USD**; remove the currency input from create/edit sheets, always send `"USD"`. Leave engine FX machinery intact (becomes identity). Existing non-USD deals untouched.
- **C6:** standalone calculator that does **not** mutate stored TCV (Spec 3).
- **B5:** remove field **and cleanly retire** `COMPLIANCE_DEADLINE_RISK` (pattern + dimension feed + thresholds). Leave the DB column in place unused (no destructive migration).
- **B2 data model:** single `team_members` table with `can_be_am` / `can_be_tl` flags (a person can fill both), not two lists.

## Shared UI primitives (built once, reused)
- **`DatePicker`** (`components/ui/date-picker.tsx`): `calendar` + `popover` wrapper; replaces native `<input type="date">`. (A2)
- **`Combobox`** (`components/ui/combobox.tsx`): `command` + `popover` searchable select with inline **"+ Add '<typed>'"** that calls a create endpoint. Supports single and multi-select. (B4, B6)
- **`InfoTooltip`** (`components/ui/info-tooltip.tsx`): small `(i)` icon using `tooltip`. (B8, C2)

## Backend / data
1. **Lookup seed edits** (`artifacts/api-server/src/seed.ts`):
   - Pricing models: remove **Hybrid** (deactivate existing row if present). (B1)
   - Service tiers: remove **Managed Services Contract**; add **Online Onboarding**, **Onsite Onboarding**, **Product Training**. (B3)
   - Competitors: add 20 named tools with categories (IAM/SIEM/Audit/M365/SSPR/MFA, all ≤10 chars). (B4)
   - Product catalog: add **Log 360 Cloud** (`LOG360_CLOUD`, suite Log360) and **Identity 360** (`IDENTITY360`, suite AD360). (B7)
   - Seed stage-keyed **playbooks** with real steps. (C4)
2. **`team_members` table** (`lib/db/src/schema/edc_v2_intel.ts` or `lookups.ts`): `{id serial, name varchar, can_be_am bool, can_be_tl bool, is_active bool}` + list/create endpoints. (B2)
3. **Create endpoints** for competitors and compliance drivers (combobox add-new). (B4, B6)
4. **Compliance-deadline retirement (B5):** drop `compliance_deadline` from API input (openapi.yaml `DealInput`/`DealUpdate`) + remove field from sheets; retire `COMPLIANCE_DEADLINE_RISK` pattern, the `daysToComplianceDeadline` dimension feed, and `compliance_deadline_*` thresholds (engine + seed). Keep DB column unused.
5. **Compliance drivers merge (B6):** form keeps ONE searchable multi-select; backend still writes both `compliance_driver_id` (= first selected) and `compliance_driver_ids` (= all) so engine reads are unchanged.
6. **Playbook assignment (C4):** auto-assign-if-missing on playbook read so deals already sitting in a configured stage get one; existing on-stage-change auto-assign stays.
7. Update `openapi.yaml`, run codegen (`pnpm --filter @workspace/api-spec run codegen`).

## Frontend
- **Settings → new "Team" tab** (`pages/settings.tsx` + component): CRUD to add/remove AM & TL names. (B2)
- **Create/Edit Deal sheets:** remove currency input (send USD); AM/TL → dropdowns from `team_members`; service-tier list updated; competitor → Combobox w/ add-new; compliance drivers → single multi-select Combobox w/ add-new; remove compliance-deadline field; DatePicker for close date; InfoTooltips on Strategic Blueprint + Speaker Notes. (B1–B8, A1, A2)
- **Deal Cockpit page** (`pages/deal-cockpit.tsx`): InfoTooltip on **Normalized TCV** (C2); add **Products of Interest** to Deal Economics card (C3).

## Acceptance
- `pnpm run typecheck` passes.
- New deal form: no currency field, no compliance-deadline field; AM/TL dropdowns; searchable competitor + compliance-driver comboboxes with add-new; updated tiers; no Hybrid; info icons present.
- Deal page shows Products of Interest + Normalized TCV info icon.
- Engine: no references to `COMPLIANCE_DEADLINE_RISK` / `compliance_deadline_*`; engine tests pass.
- A playbook shows as active on a seeded deal.

## DB apply note
Schema add (`team_members`) + reseed require a running Postgres. Code + codegen + typecheck do not. DB apply via direct SQL (never `push-force`).
