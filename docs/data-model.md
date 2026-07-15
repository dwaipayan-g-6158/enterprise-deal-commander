# Data Model

EDC uses **PostgreSQL 16** via **Drizzle ORM** (`lib/db`). The schema is split across two Postgres
schemas inside one database:

- **`edc`** (public) — the Phase 1 core.
- **`edc_v2`** — the Phase 2 durable-history, intelligence, and settings backbone
  (`pgSchema("edc_v2")`).

Schema modules live in `lib/db/src/schema/` and are aggregated by `index.ts`. There is **no formal
migrations directory** — schema is applied with `drizzle-kit push` in development.

- [Core entities (ER diagram)](#core-entities-er-diagram)
- [Phase 1 tables (`edc`)](#phase-1-tables-edc)
- [Phase 2 tables (`edc_v2`)](#phase-2-tables-edc_v2)
- [Settings tables](#settings-tables)
- [Conventions & notes](#conventions--notes)

## Core entities (ER diagram)

The Phase 1 heart of the model: a deal, its technical gates, blockers, cross-sells, and the
governance artifacts around it.

```mermaid
erDiagram
    commanders ||--o{ enterprise_deals : "owns (single user)"
    enterprise_deals ||--o{ deal_technical_gates : has
    enterprise_deals ||--o{ deal_cross_sells : has
    enterprise_deals ||--o{ deal_blockers : has
    enterprise_deals ||--o{ deal_audit_log : records
    enterprise_deals ||--o{ deal_alert_dispositions : dispositions
    enterprise_deals ||--o{ deal_stage_overrides : overrides
    enterprise_deals ||--o{ deal_interventions : interventions
    enterprise_deals ||--o{ bat_signals : shares
    enterprise_deals ||--o{ deal_compliance_drivers : tagged
    enterprise_deals ||--o{ deal_product_interests : anchors
    pipeline_stages ||--o{ enterprise_deals : "stage"
    product_catalog ||--o{ deal_cross_sells : "product"
    loss_archetypes ||--o{ enterprise_deals : "loss reason"

    enterprise_deals {
        uuid id PK
        text account_name "natural key w/ deal_name"
        text deal_name
        text sales_stage
        numeric product_revenue
        text pricing_model
        int contract_term_years
        text deal_currency
        numeric services_revenue
        text services_tier
        date expected_close_date
        timestamptz deleted_at "soft-delete (F14)"
        timestamptz archived_at
    }
    deal_technical_gates {
        text gate_code
        int gate_group
        bool is_completed
        text[] prerequisite_gate_codes "F4"
    }
```

## Phase 1 tables (`edc`)

### Identity
| Table | Purpose |
|---|---|
| `commanders` | The authenticated user(s). Login `email` maps to `username`; password is a bcrypt hash. |

### Deals & governance (`deals.ts`)
| Table | Purpose |
|---|---|
| `enterprise_deals` | The central entity. Natural key `(account_name, deal_name)`. Holds economics, stage, dates, and soft-delete/archive columns (F14). |
| `deal_technical_gates` | The 9-point gate matrix per deal (gate code, group, completion, `prerequisite_gate_codes`). |
| `deal_cross_sells` | Cross-sell products and their pitched state (F13). |
| `deal_compliance_drivers` | Compliance drivers attached to a deal (SOX, HIPAA, PCI-DSS, …). |
| `deal_product_interests` | Anchor products the deal is built around. |
| `deal_blockers` | Blockers with category and severity. |
| `deal_audit_log` | **Immutable** change log; carries `entity_id` so snapshots can reconstruct historical gate state. |
| `deal_alert_dispositions` | Acknowledge / accept / snooze records per pattern (F3). |
| `deal_review_markers` | "Reviewed" markers on deals. |
| `deal_interventions` | Rapid-intervention checklist launches (F7). |
| `deal_stage_overrides` | Ledger of typed overrides when a RED guardrail was bypassed (F12). |
| `bat_signals` | 48-hour signed share tokens (F7). |

### Lookups (`lookups.ts`)
| Table | Purpose |
|---|---|
| `pipeline_stages` | Commercial stages (Discovery → … → Closed). Stored as rows so new stages are inserts, not schema changes. |
| `pricing_models`, `services_tiers` | Economics enumerations. |
| `team_members`, `segments`, `deal_types` | Reference data (team members are soft-deletable). |
| `product_catalog` | Products available to pitch. |
| `competitors`, `competitor_battlecards` | Competitor reference data and battlecards. |
| `compliance_drivers` | Compliance-driver taxonomy. |
| `blocker_categories`, `blocker_severities` | Blocker enumerations. |
| `loss_archetypes` | Closed-Lost archetype taxonomy (F10). |
| `engine_thresholds` | Tunable engine thresholds (seeded; drive the risk patterns). |

> **FX rates** are read/written via `GET|PUT /api/v1/lookups/fx-rates` and feed multi-currency
> normalization (F1); they are stored in the lookup layer.

## Phase 2 tables (`edc_v2`)

### Durable history (`edc_v2.ts`)
| Table | Purpose |
|---|---|
| `deal_activity_log` | Append-only activity stream (written by the activity-logger subscriber). |
| `deal_snapshots` | Hourly point-in-time snapshots; payload `{deal, gates, governance}`. |
| `deal_health_history` | Health-color time series (health-tracker subscriber). |
| `portfolio_rollups` | Precomputed portfolio aggregates. |
| `pipeline_transitions` | Stage-transition events (pipeline-transitions subscriber) — powers Flow analytics. |
| `pipeline_targets` | Pipeline/coverage targets. |

### Intelligence (`edc_v2_intel.ts`)
| Domain | Tables |
|---|---|
| Scoring | `deal_scores`, `scoring_model_weights`, `velocity_benchmarks` |
| Competitive | `deal_competitors` |
| Deal Memory | `deal_memory` |
| Stakeholders & decisions | `stakeholders`, `meeting_sessions`, `deal_decisions` |
| Custom patterns | `custom_risk_patterns`, `custom_pattern_conditions` |
| Playbooks | `playbooks`, `playbook_steps`, `deal_playbook_assignments`, `playbook_step_completions` |
| Financial | `deal_pricing_schedule`, `financial_scenarios` |
| Notifications | `notification_rules`, `notification_log` |
| Custom fields & tags | `custom_field_definitions`, `custom_field_values`, `tag_definitions`, `deal_tags` |
| Webhooks | `webhooks`, `webhook_delivery_log` |

## Settings tables (`settings.ts`)

| Table | Purpose |
|---|---|
| `settings_change_log` | Auditable configuration changes (list / get / rollback / export). |
| `automation_rules`, `automation_actions` | Automation rule engine. |
| `automation_rule_templates` | Reusable rule templates. |
| `automation_execution_log` | Automation run history. |

## Conventions & notes

- **Isomorphic input, not ORM entities, feed the engine.** `intelligence.ts` reads these tables
  and builds the plain-data input the pure engine expects — the engine never touches Drizzle.
- **Snapshots reconstruct gates only.** Economics and stage always reflect current values; only
  gate state is rebuilt from the audit log for point-in-time views.
- **Post-merge schema sync gotcha.** Tables an agent created via direct SQL don't automatically
  reach the main database on merge; a post-merge `push` is expected (non-fatal), and you must
  **never** use `push-force` (truncate risk). See `.agents/memory/edc-post-merge-schema-sync.md`.
- **Applying schema:**
  ```bash
  pnpm --filter @workspace/db run push
  ```
