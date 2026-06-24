---
name: EDC v2 snapshot payload shape & privacy
description: What edc_v2.deal_snapshots.payload contains and the speaker-notes leak risk when rendering it
---

`edc_v2.deal_snapshots.payload` is an opaque jsonb with shape `{ deal, gates, governance }`:
- `deal` = full `serializeDeal()` output (economics, stage, team, TCVs, currency, **and `speakerNotes`**).
- `gates` = `getDealGates()` GateView[] (gateCode, label, isCompleted, gateGroup, ...).
- `governance` = `{ healthStatus, alerts: [{ code, severity }] }`.

**Privacy rule:** the payload embeds presenter-private `speakerNotes`. Any UI that renders the raw payload (e.g. the History-tab SnapshotViewer) MUST whitelist fields and never surface `speakerNotes`. The detail endpoint `GET /api/v2/snapshots/:id` returns the whole payload to any authenticated commander, so the boundary is client-side for these snapshot views.

**Why:** the PRD requires speaker notes to never be projected/exported; snapshots are a second place (besides Briefing Mode) where the notes are present and could leak.

**How to apply:** when reading a snapshot, treat `payload` as `{ deal, gates, governance }` via a local typed cast and render only explicit fields.
