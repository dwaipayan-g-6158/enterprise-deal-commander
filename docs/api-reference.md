# API Reference

The EDC HTTP API is an OpenAPI 3.1 contract defined in `lib/api-spec/openapi.yaml` (the single
source of truth). The server validates against generated Zod schemas; the client consumes
generated React Query hooks. **To change the API, edit the spec and re-run codegen — never
hand-edit generated code.**

- [Conventions](#conventions)
- [Authentication](#authentication)
- [Errors](#errors)
- [v1 — Core (Phase 1)](#v1--core-phase-1)
- [v2 — Sovereign Intelligence (Phase 2)](#v2--sovereign-intelligence-phase-2)

## Conventions

- **Base path:** all routes are mounted under `/api`. So `/v1/auth/login` in the spec is served
  at `POST /api/v1/auth/login`, and the health check is `GET /api/healthz`.
- **Versioning:** `/api/v1/*` is the Phase 1 core; `/api/v2/*` is Phase 2.
- **Content type:** JSON request/response bodies.
- **Path parameters** are shown in `{braces}`.
- There are **~124 documented operations**. Descriptions below are summarized; consult
  `openapi.yaml` for exact request/response schemas.

## Authentication

- Auth is **cookie-session**. `POST /api/v1/auth/login` sets an `edc_session` cookie containing
  an HS256 JWT (7-day TTL, `httpOnly`, `sameSite: lax`, `Secure` in production).
- The login body uses an `email` field, which maps to `commanders.username`.
- Send the cookie on subsequent requests. Nearly all endpoints require it; the public exceptions
  are `GET /api/healthz`, `POST /api/v1/auth/login`, and `GET /api/v1/share/{token}`.

## Errors

Errors use a centralized shape (via `HttpError` / `sendError`). Notable domain error:

| Status | Code | Meaning |
|---|---|---|
| `401` | — | Missing/invalid session. |
| `404` | — | Resource not found (unknown route or id). |
| `409` | `STAGE_GUARDRAIL` | Attempted to advance a deal's stage past an active RED risk pattern without an `override_reason`. Resend with the override to proceed. |
| `4xx/5xx` | — | Validation and server errors with a JSON error body. |

See [troubleshooting.md](./troubleshooting.md#error-reference) for a fuller error catalog.

---

## v1 — Core (Phase 1)

### Health & authentication

| Method | Path | Description |
|---|---|---|
| GET | `/api/healthz` | Health check. |
| POST | `/api/v1/auth/login` | Authenticate the Commander; sets the session cookie. |
| POST | `/api/v1/auth/logout` | Log out; clears the session. |
| GET | `/api/v1/auth/me` | Current authenticated Commander (never cached). |

### Deals

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/deals` | List deals (supports `?state=archived` etc.). |
| POST | `/api/v1/deals` | Create a deal. |
| GET | `/api/v1/deals/{id}` | Get one deal. |
| PUT | `/api/v1/deals/{id}` | Update a deal (also registered on PATCH; the client uses PUT). |
| DELETE | `/api/v1/deals/{id}` | Soft-delete a deal (recoverable). |
| POST | `/api/v1/deals/{id}/restore` | Restore a soft-deleted deal. |
| POST | `/api/v1/deals/{id}/archive` | Archive a deal. |

### Technical gates

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/deals/{dealId}/gates` | List a deal's technical gates. |
| PUT | `/api/v1/deals/{dealId}/gates/{gateCode}` | Toggle/update a single gate. |
| PUT | `/api/v1/deals/{dealId}/gates/batch` | Update multiple gates at once (registered before the param route). |

### Blockers

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/deals/{dealId}/blockers` | List blockers. |
| POST | `/api/v1/deals/{dealId}/blockers` | Create a blocker. |
| PUT | `/api/v1/deals/{dealId}/blockers/{blockerId}` | Update/resolve a blocker. |
| DELETE | `/api/v1/deals/{dealId}/blockers/{blockerId}` | Delete a blocker. |

### Cross-sells

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/deals/{dealId}/cross-sells` | List cross-sell products & pitched state. |
| PUT | `/api/v1/deals/{dealId}/cross-sells` | Update the pitched cross-sell set. |

### Intelligence & analytics (v1)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/deals/{dealId}/intelligence` | Full engine output for a deal (health, alerts, risk v2, recommendations). |
| GET | `/api/v1/intelligence/summary` | Portfolio-wide intelligence summary. |
| GET | `/api/v1/intelligence/portfolio-analysis` | Portfolio correlation analysis. |
| GET | `/api/v1/intelligence/product-mix` | Product-mix / cross-sell analysis. |
| GET | `/api/v1/analytics/autopsy` | Deterministic Closed-Lost autopsy correlation. |

### Temporal (audit, changes, snapshot)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/deals/{dealId}/audit` | Immutable audit log for a deal. |
| GET | `/api/v1/deals/{dealId}/changes` | Change digest (read-time projection of the audit log). |
| POST | `/api/v1/deals/{dealId}/review-marker` | Mark a deal as reviewed. |
| GET | `/api/v1/deals/{dealId}/snapshot` | Point-in-time snapshot (reconstructs gates only). |

### Risk governance & sharing

| Method | Path | Description |
|---|---|---|
| PUT | `/api/v1/deals/{dealId}/alerts/{patternCode}/disposition` | Acknowledge / Accept / Snooze an alert (rationale required). |
| DELETE | `/api/v1/deals/{dealId}/alerts/{patternCode}/disposition` | Clear a disposition. |
| POST | `/api/v1/deals/{dealId}/interventions` | Launch/log a rapid-intervention checklist. |
| POST | `/api/v1/deals/{dealId}/bat-signal` | Mint a 48-hour signed share link. |
| GET | `/api/v1/share/{token}` | **Public** read-only risk card for a Bat-Signal token. |

### Lookups

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/lookups/pipeline-stages` | Pipeline stage list. |
| GET | `/api/v1/lookups/pricing-models` | Pricing models. |
| GET | `/api/v1/lookups/services-tiers` | Services tiers. |
| GET | `/api/v1/lookups/product-catalog` | Product catalog. |
| GET / POST | `/api/v1/lookups/competitors` | List / add a competitor (combobox add-new). |
| GET / POST | `/api/v1/lookups/compliance-drivers` | List / add a compliance driver. |
| GET / POST | `/api/v1/lookups/team-members` | List / create a team member. |
| DELETE | `/api/v1/lookups/team-members/{id}` | Soft-delete a team member. |
| GET | `/api/v1/lookups/competitor-battlecards` | Competitor battlecards. |
| GET | `/api/v1/lookups/gate-definitions` | Gate definitions. |
| GET | `/api/v1/lookups/blocker-categories` | Blocker categories. |
| GET | `/api/v1/lookups/blocker-severities` | Blocker severities. |
| GET | `/api/v1/lookups/loss-archetypes` | Closed-Lost archetype taxonomy. |
| GET | `/api/v1/lookups/intervention-checklists` | Intervention checklists per alert code. |
| GET / PUT | `/api/v1/lookups/engine-thresholds` | Read / update engine thresholds. |
| GET / PUT | `/api/v1/lookups/fx-rates` | Read / update FX rates. |

### Settings (v1)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/settings/change-log` | List configuration changes. |
| GET | `/api/v1/settings/change-log/{id}` | Get one change-log entry. |
| POST | `/api/v1/settings/change-log/{id}/rollback` | Roll back a configuration change. |
| GET | `/api/v1/settings/config/export` | Export configuration. |
| POST | `/api/v1/settings/config/import` | Import configuration. |

---

## v2 — Sovereign Intelligence (Phase 2)

All v2 routes require authentication.

### Durable history

| Method | Path | Description |
|---|---|---|
| GET | `/api/v2/activity` | Portfolio-wide activity feed. |
| GET | `/api/v2/deals/{dealId}/activity` | Per-deal activity log. |
| GET | `/api/v2/deals/{dealId}/health-history` | Health color history over time. |
| GET | `/api/v2/deals/{dealId}/snapshots` | List stored snapshots. |
| GET | `/api/v2/snapshots/{snapshotId}` | Get a specific snapshot payload. |

### Predictive scoring

| Method | Path | Description |
|---|---|---|
| GET | `/api/v2/deals/{dealId}/score` | Predictive close-probability score for a deal (recomputed live). One of its 9 factors is `playbook_adherence`. |
| POST | `/api/v2/scores/recalculate` | Recompute scores. |

### Analytics

| Method | Path | Description |
|---|---|---|
| GET | `/api/v2/analytics/velocity` | Deal velocity analytics. |
| GET | `/api/v2/analytics/velocity/benchmarks` | Velocity benchmarks (cohort medians). |
| GET | `/api/v2/analytics/pipeline` | Pipeline analytics. |
| GET | `/api/v2/analytics/simulation` | Pipeline / probabilistic simulation. |
| GET | `/api/v2/analytics/competitive` | Competitive analytics. |
| GET | `/api/v2/analytics/win-loss` | Win/loss analytics. |
| GET | `/api/v2/analytics/gates` | Gate analytics. |
| GET | `/api/v2/analytics/next-actions` | Next-best-action recommendations. |
| GET | `/api/v2/analytics/vital-signs` | Pipeline vital signs (dashboard bar). |
| GET | `/api/v2/analytics/roster` | Enriched deal roster data. |
| GET | `/api/v2/analytics/product-gaps` | Product-gap register. |
| GET | `/api/v2/analytics/memory-insights` | Deal Memory insights. |
| GET | `/api/v2/analytics/memory-health` | Deal Memory coverage/health. |
| GET | `/api/v2/analytics/competitor-intel` | Aggregated competitor intelligence. |
| GET | `/api/v2/analytics/pricing-benchmarks` | Pricing benchmarks. |
| GET | `/api/v2/analytics/playbook-effectiveness` | Playbook-effectiveness analytics. |
| GET | `/api/v2/analytics/deals/{dealId}/trajectory` | Deal trajectory over time. |
| GET | `/api/v2/analytics/loss-risk` | Proactive loss-risk scoring. |
| GET | `/api/v2/analytics/competitive-loss` | Competitive-loss analysis. |
| GET | `/api/v2/analytics/loss-dashboard` | Closed-Lost dashboard. |

#### Pipeline Flow

| Method | Path | Description |
|---|---|---|
| GET | `/api/v2/analytics/flow/funnel` | Stage funnel. |
| GET | `/api/v2/analytics/flow/conversion-matrix` | Stage-to-stage conversion matrix. |
| GET | `/api/v2/analytics/flow/sankey` | Sankey of stage transitions. |
| GET | `/api/v2/analytics/flow/recycle` | Recycle / exit analysis. |
| GET | `/api/v2/analytics/flow/coverage` | Coverage tracker. |
| GET | `/api/v2/analytics/flow/health-score` | Composite pipeline health score. |

### Deal Memory

| Method | Path | Description |
|---|---|---|
| GET | `/api/v2/memory` | List memory entries. |
| GET | `/api/v2/memory/search` | Faceted, highlighted search. |
| GET | `/api/v2/memory/similar/{dealId}` | Deals similar to a given deal. |
| GET | `/api/v2/memory/compare` | Compare deals side-by-side. |
| GET | `/api/v2/memory/facets` | Search facets. |
| GET / PUT | `/api/v2/memory/{id}` | Get / update a memory entry. |
| GET | `/api/v2/memory/revival-candidates` | Closed-Lost deals worth reviving. |
| GET | `/api/v2/memory/ask` | "Ask Deal Memory" deterministic advisor. |

### Competitors, stakeholders, decisions, meetings

| Method | Path | Description |
|---|---|---|
| GET / POST | `/api/v2/deals/{dealId}/competitors` | List / add a deal competitor. |
| PUT / DELETE | `/api/v2/deals/{dealId}/competitors/{id}` | Update / remove a deal competitor. |
| GET / POST | `/api/v2/deals/{dealId}/stakeholders` | List / add a stakeholder. |
| PUT / DELETE | `/api/v2/deals/{dealId}/stakeholders/{id}` | Update / remove a stakeholder. |
| GET / POST | `/api/v2/deals/{dealId}/decisions` | List / add a decision-log entry. |
| PUT | `/api/v2/deals/{dealId}/decisions/{id}` | Update a decision. |
| GET / POST | `/api/v2/meeting-sessions` | List / create meeting sessions. |

### Playbooks

| Method | Path | Description |
|---|---|---|
| GET / POST | `/api/v2/playbooks` | List / create playbooks. |
| PUT / DELETE | `/api/v2/playbooks/{id}` | Update / delete a playbook. |
| GET | `/api/v2/deals/{dealId}/playbook` | The playbook assigned to a deal, with per-step state (completed/skipped/blocked), progress %, and overdue steps. |
| POST | `/api/v2/playbook-assignments/{assignmentId}/steps/{stepId}/state` | Set a step's state — `{ status: completed \| skipped \| blocked, note? }`. Steps are actionable in any order. |
| DELETE | `/api/v2/playbook-assignments/{assignmentId}/steps/{stepId}/state` | Reopen a step (undo its action). |

### Financial modeling

| Method | Path | Description |
|---|---|---|
| GET / PUT | `/api/v2/deals/{dealId}/pricing-schedule` | Read / set per-year (ramp) pricing. |
| GET / POST | `/api/v2/scenarios` | List / create financial scenarios. |
| DELETE | `/api/v2/scenarios/{id}` | Delete a scenario. |
| POST | `/api/v2/scenarios/compute` | Compute a scenario. |

### Webhooks & integrations

| Method | Path | Description |
|---|---|---|
| GET / POST | `/api/v2/webhooks` | List / create webhooks. |
| PUT / DELETE | `/api/v2/webhooks/{id}` | Update / delete a webhook. |
| GET | `/api/v2/webhooks/{id}/deliveries` | Delivery log for a webhook. |

### Custom risk patterns

| Method | Path | Description |
|---|---|---|
| GET / POST | `/api/v2/custom-patterns` | List / create custom risk patterns. |
| PUT / DELETE | `/api/v2/custom-patterns/{id}` | Update / delete a custom pattern. |
| POST | `/api/v2/custom-patterns/test` | Test a custom pattern definition. |

### Notifications

| Method | Path | Description |
|---|---|---|
| GET / POST | `/api/v2/notification-rules` | List / create notification rules. |
| PUT / DELETE | `/api/v2/notification-rules/{id}` | Update / delete a notification rule. |
| GET | `/api/v2/notifications` | List notifications. |
| POST | `/api/v2/notifications/{id}/ack` | Acknowledge a notification. |

### Custom fields & tags

| Method | Path | Description |
|---|---|---|
| GET / POST | `/api/v2/custom-fields` | List / define custom fields. |
| GET | `/api/v2/deals/{dealId}/custom-fields` | Custom-field values for a deal. |
| PUT | `/api/v2/deals/{dealId}/custom-fields/{fieldId}` | Set a custom-field value. |
| GET / POST | `/api/v2/tags` | List / create tags. |
| DELETE | `/api/v2/tags/{tagId}` | Delete a tag. |
| GET | `/api/v2/deals/{dealId}/tags` | Tags on a deal. |
| POST / DELETE | `/api/v2/deals/{dealId}/tags/{tagId}` | Add / remove a tag on a deal. |

### Natural language & config

| Method | Path | Description |
|---|---|---|
| POST | `/api/v2/nlc/parse` | Parse a natural-language command. |
| GET / PUT | `/api/v2/config/targets` | Read / set pipeline targets. |
| GET / PUT | `/api/v2/config/scoring-weights` | Read / tune predictive-score factor weights (fractions of 1.0). |

---

> Generated from `lib/api-spec/openapi.yaml`. If an endpoint here doesn't match the running
> server, the spec is authoritative — regenerate the client/validators with
> `pnpm --filter @workspace/api-spec run codegen`.
