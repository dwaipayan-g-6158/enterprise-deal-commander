---
name: EDC v2 snapshot payload shape & privacy
description: What edc_v2.deal_snapshots.payload contains and the speaker-notes leak risk when rendering it
---

`edc_v2.deal_snapshots.payload` is an opaque jsonb with shape
`{ deal, gates, governance, playbook, meddpicc }` (written in one place —
`lib/subscribers/snapshot-service.ts`):
- `deal` = full `serializeDeal()` output (economics, stage, team, TCVs, currency, **and `speakerNotes`**).
- `gates` = `getDealGates()` GateView[] (gateCode, label, isCompleted, gateGroup, ...).
- `governance` = `{ healthStatus, alerts: [{ code, severity }] }`.
- `playbook` = `{ adherencePct, progressPct, criticalGaps, overdueCount }`.
- `meddpicc` = `{ overallPct, stagePct, ragStatus }` or `null`. Added 2026-07-24 —
  rows captured before that lack both `playbook` and `meddpicc`, so read them
  defensively and render "not captured" rather than 0.

**Privacy rule:** the payload embeds presenter-private `speakerNotes`. Any UI that renders the payload MUST whitelist fields explicitly and never surface `speakerNotes`. The detail endpoint `GET /api/v2/snapshots/:id` returns the whole payload to any authenticated commander, so the boundary is entirely client-side.

**Why:** the PRD requires speaker notes to never be projected/exported; snapshots are a second place (besides Briefing Mode) where the notes are present and could leak.

**No UI currently renders a snapshot payload.** The deal UI does not surface snapshots as a list, and the read-only point-in-time viewer that used to open from it (`snapshot-viewer.tsx`) has been deleted — recover it from git history if a forensic view is wanted. Snapshot data still reaches the UI only in aggregate/derived form, which never touches `payload.deal`: `deal-trajectory.tsx` via `/v2/analytics/deals/:id/trajectory`, and the vital-signs/forecast widgets.

**How to apply** if you build one again: never spread `payload` or render it generically. Declare local interfaces naming every field you intend to show (the deleted viewer used `SnapshotDeal`/`SnapshotGate`/`SnapshotGovernance`/`SnapshotPlaybook`/`SnapshotMeddpicc` plus one `as SnapshotPayload` cast) and extend those rather than widening the cast. Verify by asserting the rendered DOM contains no `speakerNotes` value for a deal that has them — seeded ESAB does.
