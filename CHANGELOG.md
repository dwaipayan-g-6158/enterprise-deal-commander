# Changelog

All notable changes to Enterprise Deal Commander are documented here.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note on provenance:** This project has **no git tags or prior releases** yet, and the
> package version is pinned at `0.0.0`. The milestone versions below are **inferred from the
> commit history** (~159 commits between 2026-06-10 and 2026-07-16) and grouped by feature epoch
> for readability. Version numbers and dates are approximate, not authoritative release markers.
> See [`docs/release-process.md`](./docs/release-process.md) for the intended versioning strategy.

## [Unreleased]

### Added
- **Playbook Intelligence.** The Validation → Playbook tab is now a live intelligence signal (see [`docs/changes/2026-07-17-playbook-intelligence.md`](./docs/changes/2026-07-17-playbook-intelligence.md)):
  - Robust per-step controls — **complete / skip / block / reopen**, per-step notes, and out-of-order actioning (steps are no longer a forced sequence).
  - New **`playbook_adherence`** predictive-score factor (the 9th; the other 8 were rebalanced to keep the sum at 100), tunable from a new Settings **Score Weights** panel.
  - New YELLOW **`PLAYBOOK_EXECUTION_GAP`** risk pattern (16th) — fires on skipped/blocked-critical or overdue steps; raises risk + governance health without blocking stage advancement.
  - A **`playbook.step_changed`** event re-scores, snapshots, recomputes health, and logs activity; the deal cockpit (Score / Alerts / Trajectory) updates live. The trajectory gains a **Playbook %** metric.
  - Seeded playbook catalog expanded to **5 playbooks / 26 steps** (adds Discovery/Qualification and Closed-Won onboarding playbooks).
- **Deal Roster & Kanban.** Roster page with a Kanban board (drag-to-move stages with `409` override handling), timeline view, forecast flags, next-best-action, and score-trend arrows.
- **Deal-revival watch** and a **product-gap register** feeding roster enrichment.
- Single-origin hosting: the built SPA is served directly from the Express API process.
- **Zoho Catalyst migration.** The full stack now runs on Zoho Catalyst: **Data Store** (hosted,
  schemaless Row API) replaces Postgres/Drizzle entirely; **Catalyst embedded auth** replaces the
  bcrypt/JWT login; the periodic snapshot job and webhook retries run on **Catalyst Job
  Scheduling** instead of in-process timers; oversized snapshot payloads offload to **Stratus**
  object storage. See [`docs/changes/2026-08-07-catalyst-migration.md`](./docs/changes/2026-08-07-catalyst-migration.md).
- `POST /api/v1/admin/seed` and `POST /api/v1/admin/backfill-transitions` (admin-only, RBAC-gated)
  replace the old CLI seed/backfill scripts — both need a real request to derive a Catalyst app
  handle from.

### Changed
- Engine tuning weights (predictive scoring, portfolio risk, pipeline health, risk dimensions) are now read from configuration instead of hardcoded values.
- Predictive score now has **9 factors** and the risk engine **16 patterns** (was 8 / 15).
- The full test suite (1,360 tests) now runs against an in-memory Data Store fake with **no
  database required at all** — previously it needed a reachable `DATABASE_URL`.
- **Sign-in rebuilt as a designed first-party screen** — a two-column layout with a branding rail,
  and Catalyst's embedded widget flattened into the card so it no longer reads as a foreign box.
  The iframe is themed by a static stylesheet handed to the SDK as `css_url`, which Zoho fetches
  itself so it applies *before* the frame's first paint; the previous approach injected CSS after
  load and flashed an unstyled white panel. That sheet must keep its
  `@import` of Catalyst's own `embedded_signin.css` as its first rule — `css_url` **replaces**
  Zoho's base sheet rather than adding to it, and without the import the form loses the
  `display:none` toggles that advance it between steps. The page is deliberately dark-only: a
  static file cannot follow light/dark × time-band × mobile token permutations.
- The sign-in page is **always dark** and no longer participates in the theme system.

### Removed
- Drizzle, `pg`, and every Postgres schema/migration file. `DATABASE_URL` and `SESSION_SECRET`
  are no longer read anywhere in the server.
- The in-process portfolio-rollup precompute (its write path silently failed against Catalyst on
  every mutation and every cold start; nothing reads the rollup, so it was deleted rather than
  ported).

### Fixed
- Playbook: a **skipped** step no longer renders the same green checkmark as a **completed** one — completed, skipped, and blocked steps are now visually distinct.
- **Pipeline transitions were missing for every pre-migration deal**, leaving the Flow tab's value
  bridge reading effectively $0 — `POST /admin/backfill-transitions` reconstructs them from the
  audit log and stage history.
- `routes/intelligence.ts` (the deal Intelligence panel, dashboard summary, Portfolio Overview,
  product-mix, and Closed-Lost Autopsy) had been silently 500ing since an earlier migration slice
  missed it.
- The sign-in page now shows an explicit error with a **Retry** action (and a loading skeleton)
  instead of a permanently blank card when the Catalyst sign-in widget can't load.
- **The email-OTP step.** Three defects, all reproduced by running the real flow on the deployed
  app. The "OTP sent to…" banner was drawn *on top of* the "*email* / Change" row — two
  superimposed strings, which is why the message looked scrambled. That traced to a broken port:
  the sheet renders the banner as a fixed toast cleared by a hand-tuned `body { padding-top: 76px }`
  and collapsed by a class that **Periscope's `AuthGate.tsx`** adds — a file EDC does not have, so
  nothing ever collapsed it, and 76px never covered a banner that measures 104px. Underneath both
  sat the real cause: `.signin_container` computes a fixed `height: 520px` whatever the step holds,
  so it always overflowed a frame auto-sized to ~280px and Catalyst scrolled the document on field
  focus, pushing the banner and the Change row out of view. Separately, Zoho nests the helper links
  (`Forgot Password?`, `Resend OTP`) *inside* the input's `.textbox_div`, so they rendered within
  the field's border and focus ring on both the password and OTP steps. Now: the shell sizes to its
  content so nothing scrolls, the banner is an in-flow single line, the links sit below the field,
  and **Change** is an explicit underlined action in a bordered identity row.
- **The sign-in font was never Geist.** A single stray `0x01` control byte sat in front of
  `'Geist'` in the theme stylesheet. CSS error recovery discards the offending *declaration* and
  keeps its neighbours, so the rule still applied its colours and spacing — just no font — and
  Zoho's `body { font-family: Roboto }` won unopposed. Nothing errored; the font was simply wrong.
  A test now asserts the file has no control characters, along with its other load-bearing
  invariants (Catalyst's stylesheet imported first, both `@import`s ahead of any rule,
  `color-scheme: dark`, 16px inputs).
- **The sign-in card was half empty** — 529px of card for ~330px of content, from three causes
  measured on the deployed app: Zoho's `.signin_container` carries a `margin-top: 40px` meant to
  centre its own standalone card (which also inflated the auto-sized frame by the same 40px); the
  frame's `MIN_HEIGHT` floor was *above* the real email step, so every frame was clamped upward;
  and the host's first-paint height reservation was never released. Card is now 359px.
- **Sign-in error text was the least legible thing on the page** at 3.04:1 — the theme sheet still
  used EDC's pre-fix dark `--destructive`. Now tracks `index.css` at 5.26:1 measured.
- `login-iframe.css` is served `no-cache` instead of `max-age=3600`. It is fetched by URL and so
  cannot be content-hashed, which meant a deployed theme change stayed invisible for up to an hour
  — indistinguishable from a deploy that never happened.
- **The white sign-in panel.** Flattening Catalyst's wrappers to `transparent` did not remove it,
  because nothing on the page was white: the *document's canvas* was. A canvas is not an element,
  so when the root background is transparent the browser paints it using a default chosen by
  `color-scheme` — and Zoho's document declares none, so it computes to light. No selector can
  reach it. `color-scheme: dark` fixes it, and is also set inline by the stylesheet injector so
  the recovery page (reached via *Forgot Password?*) can't flash white while the `<link>` loads.
- **Accent tokens failed WCAG AA on every screen.** Light `--primary` put white button labels and
  `text-primary` links at 3.18:1, and dark `text-destructive` read 3.60:1. Light `--primary` moves
  to 55% lightness (fixing fill and text together, hue unchanged), light `--destructive` to 47%,
  and dark `--destructive` now inverts like `--primary` — a light fill with a dark label. A new
  computed test asserts the ratios against every surface each mode presents, including all three
  `data-time-band` overrides; two of the three failures were invisible when measured against the
  base canvas alone. **Known gap left open:** the light-mode chart series is the dark palette
  reused, and four of its five colours fail WCAG 1.4.11's 3:1 floor for graphical objects
  (emerald 1.74:1, amber 1.94:1, sky 2.19:1, indigo 2.88:1) — rebalancing all five while keeping
  them distinguishable is its own task.

## [0.6.0] — Settings backend foundation (inferred)

### Added
- **Settings audit API**: list / get / rollback / export of configuration changes.
- Audit-log wiring across mutation types; audit + automation database schema.
- Configurable engine thresholds and dimension/model weights persisted and surfaced through the settings layer.

## [0.5.0] — Deal Memory & Knowledge Hub (inferred)

### Added
- Tabbed **Knowledge Hub** with faceted, highlighted search and deal detail pages.
- **Narrative & Autopsy**, **Competitive Intelligence**, and **Pricing Intelligence** views.
- **"Ask Deal Memory"** deterministic advisor and side-by-side **deal comparison**.
- Playbook-effectiveness analytics.

## [0.4.0] — Pipeline Flow Analytics (inferred)

### Added
- Flow analytics: **funnel**, **conversion matrix**, **Sankey transitions**, **recycle/exit** analysis, **coverage tracker**, **pipeline pulse**, and a composite **health score**.
- `pipeline_transitions` and `pipeline_targets` tables (in `edc_v2`) with an event subscriber that records stage transitions, plus a backfill script.
- New `/api/v2/analytics/flow/*` endpoints in the OpenAPI contract.

## [0.3.0] — Risk Engine v2.0 (inferred)

### Added
- **Risk Engine v2**: a continuous 0–100 composite score across **7 independent risk dimensions** (technical readiness, commercial alignment, stakeholder coverage, temporal pressure, financial structure, competitive exposure, engagement vitality).
- **Risk radar** chart, `RiskScoreCard`, per-deal risk in the roster, and a Pipeline Risk Overview widget.
- Isomorphic Risk Simulator parity tests.

### Changed
- Governance health (RED / YELLOW / GREEN) is now derived from the composite risk level rather than the legacy pattern-weight roll-up. RED risk patterns still gate stage advancement independently.

## [0.2.0] — UI/UX refresh, PWA & Phase 2 backbone (inferred)

### Added
- **PWA**: installable app with manifest, `vite-plugin-pwa`, and offline caching of read endpoints.
- UI refresh: indigo accent + chart tokens, grouped cockpit tabs, forecast / velocity / win-loss charts, responsive app shell, animated EDC logo, redesigned login.
- **Phase 2 durable backbone**: in-process event bus, activity/health history, snapshot service, precomputed portfolio rollups, and a cache layer with a generation guard.
- Point-in-time **snapshot viewer** and intelligence-engine pattern tests.

### Removed
- Account-lockout and IP-based rate limiters (see [`docs/security.md`](./docs/security.md) for the current posture).

## [0.1.0] — Phase 1 foundation (inferred)

### Added
- Initial monorepo bootstrap (pnpm workspace, contract-first codegen, Drizzle schema).
- Core API + cookie-session authentication (HS256 JWT + bcrypt).
- Deal cockpit, 9-point technical gate matrix, blockers, cross-sell whitespace.
- Deterministic intelligence engine (risk patterns) with glass-box explanations.
- Ephemeral **Risk Simulator** and Executive Briefing ergonomics.

[Unreleased]: https://github.com/dwaipayan-g-6158/enterprise-deal-commander/commits/main
