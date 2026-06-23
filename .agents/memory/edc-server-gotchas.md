---
name: EDC server gotchas
description: Non-obvious correctness constraints in the EDC api-server routes (route ordering, stage guardrail, audit reconstruction).
---

- **Express route ordering**: register specific literal paths before param paths. `/deals/:dealId/gates/batch` MUST be declared before `/deals/:dealId/gates/:gateCode`, otherwise "batch" is captured as `:gateCode` and the body is validated against the single-gate schema, yielding a confusing 400 "Invalid gate payload".
  **Why:** Express matches in declaration order, not by specificity.

- **Deal update is PUT and PATCH**: the OpenAPI spec + generated client use `PUT /v1/deals/{id}`. The server registers the same handler on both `router.put` and `router.patch`. If you regenerate the client, keep PUT working.

- **Stage guardrail is enforced server-side** in the deal update handler, not just the frontend. On stage *advancement* (target stage `sortOrder` > current), it computes intelligence and collects active RED `governance.alerts`; if any exist it throws 409 `STAGE_GUARDRAIL` with `patternCodes` unless a valid `override_reason` (>=10 chars) is supplied, in which case it persists a `deal_stage_overrides` row + audit. Backward stage moves are never blocked.
  **How to apply:** RED severity = blocking. The 409 error carries `error.patternCodes`; the frontend edit sheet reads that to show the override UI.

- **Audit log gate identity**: gate toggles write `deal_audit_log.entity_id = gateCode` (with `fieldChanged="is_completed"`). Snapshot reconstruction keys off `entity_id`, NOT `fieldChanged`. The intelligence engine's momentum calc still filters on `field_changed === "is_completed"`, so do not move the gate code into `fieldChanged`.
