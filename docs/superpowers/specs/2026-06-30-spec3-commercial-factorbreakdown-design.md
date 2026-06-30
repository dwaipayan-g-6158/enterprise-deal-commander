# Spec 3 — Commercial Calculator (C6) + Factor Breakdown redesign (C5)

Date: 2026-06-30
Status: Approved direction, execution. Frontend-only (no backend/codegen).

## C6 — Commercial Worksheet (standalone calculator)
Rework the Commercial → Pricing panel (`components/cockpit/v2/pricing-panel.tsx`) into a comprehensive **Commercial Worksheet**: a quote/scratchpad that shows the complete commercial picture but does **NOT** mutate the deal's stored TCV (approved: standalone calculator).

Sections (all client-side state, persisted to `localStorage` keyed by dealId so values survive reload; USD):
1. **Product & discount calculator** — list price, discount %, → net product price (live).
2. **Professional services (man-hours calculator)** — hours × hourly rate → PS subtotal; optionally multiple roles/rows.
3. **Onboarding fee** — flat fee (tie to the new onboarding service tiers conceptually).
4. **Premium support** — % of net product (or flat) → support subtotal.
5. **Training cost** — sessions × per-session cost → training subtotal.
6. **Summary** — itemized breakdown + grand total (net product + PS + onboarding + support + training), with an effective-discount readout. Clearly labelled "Worksheet — informational; does not change deal TCV."
- Keep the existing **Multi-Year Pricing Schedule** editor (the only thing that feeds ramp TCV) as a secondary collapsible section so real TCV-affecting functionality is not lost. Do NOT change its persistence/TCV behavior.
- Polished, professional UI: grouped cards/sections, right-aligned mono currency, live recompute, sensible defaults, number inputs with steppers.

## C5 — Factor Breakdown redesign
Redesign the "Factor Breakdown" in `components/cockpit/v2/score-panel.tsx` (Intelligence → Score) into a polished, professional presentation. Current: plain bars. Target: clearer hierarchy — each factor as a row showing description, a proportional contribution bar (positive contribution emphasized), raw score %, weight, and contribution value; sort by contribution; show the headline score + confidence prominently; use consistent color semantics and spacing. Keep the existing data (`score.breakdown` factors: featureId, description, rawScore, weight, contribution). No data/contract changes.

## Acceptance
- `pnpm run typecheck` passes.
- Commercial tab shows the worksheet calculator (discount, PS man-hours, onboarding, premium support, training, summary) computing live; values persist per deal; TCV unaffected; multi-year schedule still available.
- Factor Breakdown looks polished and professional; same data.
