# V2 Sovereign Intelligence — Implementation Plan

> **For agentic workers:** Execute phase-by-phase. This is an architectural plan (design decisions + adapted schemas + per-feature build notes), not a per-line TDD script, because of the breadth (18 features). TDD applies to Phase B (pure engine logic). Verify each phase with `pnpm run typecheck`, api-server build, and runtime smoke. **This repo is NOT under git — do not attempt commits.**

**Goal:** Implement 18 of the 20 V2 "Priority Missing Items": all except #7 Multi-Commander RBAC (skipped) and #12 reduced to Smart Alerts only (no Escalation Chains).

**Architecture:** Contract-first, isomorphic-engine monorepo. New durable state lives in the `edc_v2` Postgres schema. Pure decision logic (scoring, simulation, custom-pattern eval, NLC parse, ramp TCV) goes in `lib/engine` so it runs identically server- and client-side. Side-effecting reactions (webhooks, notifications, playbook auto-assign, post-mortem capture) hang off the existing in-process event bus. All HTTP goes through `openapi.yaml` → Orval codegen → Zod + React Query.

**Tech Stack:** Express 5, Drizzle ORM, PostgreSQL 16, React 19 + Vite + Tailwind v4 + shadcn/ui, wouter, @tanstack/react-query, TypeScript strict.

## Global Constraints

- pnpm only (`sh`-based preinstall guard — run installs via Git Bash, not PowerShell).
- `minimumReleaseAge: 1440` — avoid new deps where possible; reuse what's installed.
- esbuild bundles api-server — rebuild after every server change: `pnpm --filter @workspace/api-server run build`.
- Do not hand-edit `lib/api-zod/src/generated/**` or `lib/api-client-react/src/generated/**` — change `openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen`.
- `info.title` in openapi.yaml must stay `Api`.
- New tables: `edc_v2` schema, applied via direct SQL (drizzle-kit push hits TTY on Windows). Mirror in Drizzle schema for typed access.
- Run `pnpm run typecheck` before declaring any phase done.

## Key adaptations (PRD → this codebase)

1. **No `commander_profiles`** (RBAC skipped). Every PRD column `… REFERENCES commander_profiles(id)` becomes `created_by varchar(255)` / `actor varchar(255)` (matches existing `dealActivityLog.actor` convention). Single-commander; actor string is the login username.
2. **Competitors** already exist as a `competitors` lookup (public schema) with `competitorBattlecards`. Do NOT create `edc_v2.competitors`; add `dealCompetitors` junction referencing the existing lookup. Win-rate analytics computed from the junction.
3. **Board reports**: PRD says Puppeteer. Deviation: render server-side HTML and use the existing client print/PDF path (briefing-mode already does print + html-to-image). Avoids a heavy native dep and keeps Catalyst portability. Report endpoint returns HTML; client prints to PDF.
4. **Email (digest + smart-alert email channel)**: no SMTP in this environment and Catalyst will own delivery later. Implement assembly + persistence to `notification_log`, an HTML render endpoint, and a pluggable `MailTransport` that logs (no-op) when unconfigured. `in_app` channel is fully functional now.
5. **Mobile Companion**: responsive `/m` route + `manifest.json`. Defer the offline service worker (large scope) — documented.
6. **NLC**: deterministic keyword/regex parser (PRD explicitly "not a full LLM"), implemented pure in `lib/engine`, surfaced in the Ctrl+K palette.
7. **Cron** (digest schedule): no `node-cron`. Expose a manual "run digest now" endpoint + reuse the existing periodic job runner in `subscribers/index.ts` if present; otherwise digest is on-demand. Documented.

---

## Phase A — Data backbone

**File:** Create `lib/db/src/schema/edc_v2_intel.ts`; re-export from `lib/db/src/schema/index.ts`. Apply all tables via direct SQL against the running cluster, then verify Drizzle types compile.

New tables (all in `edcV2` pgSchema, FKs to `enterpriseDeals` with `onDelete: cascade`):

| Feature | Tables |
|---|---|
| F1 Webhooks | `webhooks`, `webhookDeliveryLog` |
| F2 Competitive | `dealCompetitors` (junction → existing `competitors` lookup) |
| F3 Scoring | `dealScores`, `scoringModelWeights` |
| F4 Velocity | `velocityBenchmarks` (rollup; computed from `dealSnapshots`) |
| F5/F6 Memory | `dealMemory` (tsvector search) |
| F8 Stakeholders | `stakeholders` (self-ref `reportsToId`) |
| F9 Decisions | `meetingSessions`, `dealDecisions` |
| F10 Custom patterns | `customRiskPatterns`, `customPatternConditions` |
| F11 Playbooks | `playbooks`, `playbookSteps`, `dealPlaybookAssignments`, `playbookStepCompletions` |
| F13 Pricing/scenarios | `dealPricingSchedule`, `financialScenarios` |
| F12 Smart alerts | `notificationRules`, `notificationLog` |
| F16 Custom fields/tags | `customFieldDefinitions`, `customFieldValues`, `tagDefinitions`, `dealTags` |

Seed: 8 predefined tags (Net-New #3B82F6, Renewal #10B981, Expansion #8B5CF6, At-Risk #EF4444, Strategic #F59E0B, Compliance-Heavy #6366F1, Multi-Region #EC4899, First-Deal #14B8A6).

**Acceptance:** `pnpm run typecheck` green; `\dt edc_v2.*` lists all new tables; seed tags present.

## Phase B — Engine extensions (TDD)

**File:** `lib/engine/src/scoring.ts`, `lib/engine/src/simulation.ts`, `lib/engine/src/custom-patterns.ts`, `lib/engine/src/nlc.ts`, `lib/engine/src/ramp.ts`; re-export from `index.ts`. Co-located `*.test.ts` (Vitest).

- **Predictive scoring** (F3): 8 factors with exact PRD weights (gate_momentum 25 [sigmoid], stage_velocity 15, services_attachment 10, executive_alignment 15, blocker_load 10, deal_size_confidence 5, close_pressure 10, historical_win_rate 10). `sigmoid(x)=1/(1+e^(-10(x-0.5)))`. Returns `{score 0-100, breakdown[], confidence LOW|MEDIUM|HIGH}`. Tests: weights sum to 100; sigmoid midpoints; confidence by data completeness.
- **Pipeline simulation** (F20): Monte Carlo, default 10k iterations, prob = predictiveScore ?? winProbability ?? 30%. Returns p10/p25/p50/p75/p90, mean, weightedPipeline, worst/best. Tests: deterministic-ish percentile ordering; weighted vs median.
- **Custom-pattern evaluator** (F10): given pattern+conditions and a resolved deal-intelligence object, AND all conditions; operators gt/lt/gte/lte/eq/neq/contains/not_contains/is_null/is_not_null; `field_path` resolver; `{{placeholder}}` template render. Tests: each operator; AND semantics; template render.
- **Ramp TCV** (F13): `TCV = Σ year(product×(1-discount%)+services)`, fallback to flat (multi-year committed = base×term+services). Tests vs flat.
- **NLC parser** (F19): SHOW/COUNT/COMPARE/SORT grammar; field/operator/value/date dictionaries; `$1M`/`500k`/`%` parsing; fallback `{type:'SEARCH'}`. Tests: the 8 PRD example queries.
- **Competitive + stakeholder risk patterns** (F2, F8): add `BAKE_OFF_RISK`, `LOST_TO_PATTERN`, `CHAMPION_GAP`, `HOSTILE_STAKEHOLDER` to the pattern set, fed by new `ProcessContext` fields (activeCompetitors, competitorProfiles, stakeholders).

**Acceptance:** `pnpm --filter @workspace/engine run test` green; typecheck green.

## Phase C — Event-driven subscribers

**Files:** `artifacts/api-server/src/lib/subscribers/{webhook-dispatcher,notification-service,playbook-engine,post-mortem}.ts`; register in `subscribers/index.ts`. Extend `events.ts` with `alert.fired`, `decision.overdue` if needed.

- **Webhook dispatcher** (F1): on each domain event, find active `webhooks` subscribed; POST `{event,timestamp,data}` with `X-EDC-Signature: sha256=HMAC`, `X-EDC-Event`, `X-EDC-Delivery`; 10s timeout; 3 retries (5/10/15s backoff); log to `webhookDeliveryLog`; auto-disable after 10 consecutive failures. Fire-and-forget.
- **Notification/Smart Alerts** (F12): on health_changed/alert_fired/stage_changed/blocker_created (+ close_date_approaching, decision_overdue from a periodic check), evaluate active `notificationRules` (JSONB conditions), write `notificationLog` rows (channel in_app always; email via MailTransport). No escalation.
- **Playbook auto-assign** (F11): on stage_changed, if a `playbooks.applicableStage` matches and the deal has no active assignment, insert assignment at first step.
- **Post-mortem** (F5/F6): on stage_changed to Closed-Won/Closed-Lost, upsert a `dealMemory` row pre-populated with metrics; narrative fields filled later via API.

**Acceptance:** subscribers register at startup (log line); webhook delivery row written on a deal mutation when a test webhook exists.

## Phase D — API contract + v2 routes

**Files:** extend `lib/api-spec/openapi.yaml`; `pnpm --filter @workspace/api-spec run codegen`; add route files under `artifacts/api-server/src/routes/v2/` and mount in `routes/v2/index.ts`.

Endpoint groups: webhooks CRUD + deliveries; competitors-per-deal + competitive analytics; deal score (GET, recalc); velocity/pipeline analytics; deal memory search + similar + win/loss analytics; stakeholders CRUD; decisions + meeting sessions CRUD; custom patterns CRUD + test; playbooks CRUD + assignment step complete/skip; pricing schedule GET/PUT; financial scenarios CRUD + compute; pipeline simulation; notification rules CRUD + notification list/ack; custom fields/values + tags CRUD/apply; report generate (HTML); export deals (csv/json); NLC parse.

**Acceptance:** codegen produces hooks; api-server builds; representative endpoints return 200 via curl with auth cookie.

## Phase E — Frontend surfaces

**Files:** new `artifacts/edc/src/components/cockpit/*` widgets and `artifacts/edc/src/pages/*`; routes in `App.tsx`; nav in `layout.tsx`; tabs in `settings.tsx`; NLC in `command-palette.tsx`.

- Cockpit tabs/widgets: Predictive Score, Competitive Landscape, Stakeholders (org tree), Decision Log, Active Playbook, Multi-Year Pricing, Custom Fields + Tags.
- Pages: Pipeline Analytics (velocity heatmap + simulation), Win/Loss analytics (extend autopsy), Deal Memory search (Ctrl+Shift+M), Reports, Import/Export, Mobile `/m`.
- Settings tabs: Webhooks, Custom Risk Patterns (visual builder), Playbooks, Tags/Custom Fields, Notifications + Digest.
- Command palette: NLC parse → results.

**Acceptance:** typecheck green; login → cockpit renders new widgets with zero console errors; analytics + memory pages load.

---

## Phase order rationale
A (data) unblocks all. B (engine) is pure/testable and consumed by D. C (events) depends on A. D (API) depends on A/B/C and feeds E. E depends on D's generated hooks. Within each phase, features are independent and can be built in any order.
