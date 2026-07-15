# Quick Start

This guide takes you from a fresh clone to a running cockpit and walks through your first deal.
It assumes you've completed the [Installation Guide](./installation.md).

- [TL;DR](#tldr)
- [Run the stack](#run-the-stack)
- [Log in](#log-in)
- [Tutorial: your first deal](#tutorial-your-first-deal)
- [Where to go next](#where-to-go-next)

## TL;DR

```bash
pnpm install
cp artifacts/api-server/.env.example artifacts/api-server/.env   # set DATABASE_URL + SESSION_SECRET
cp artifacts/edc/.env.example        artifacts/edc/.env
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run seed
pnpm --filter @workspace/api-server run dev          # terminal 1 → API on :5000
pnpm --filter @workspace/edc run dev                 # terminal 2 → Vite frontend
```

## Run the stack

EDC runs as **two processes** in development:

1. **API server** (`@workspace/api-server`) on port **5000**. Because esbuild inlines the
   workspace dependencies, the dev script **rebuilds on every start** — re-run it after editing
   routes or schema.
   ```bash
   pnpm --filter @workspace/api-server run dev
   ```
2. **Frontend** (`@workspace/edc`) via Vite. It proxies `/api` to the API server.
   ```bash
   pnpm --filter @workspace/edc run dev
   ```

Open the URL Vite prints (it uses the `PORT` from `artifacts/edc/.env`).

> **Single-origin alternative:** you can also build the SPA into the API server and serve both
> from port 5000. See [build-and-deploy.md](./build-and-deploy.md).

## Log in

EDC is single-user. Log in with the Commander credentials created by the seed step.

- The login form's **email** field maps to the `commanders.username` column — enter the seeded
  username there.
- On success the server sets an `edc_session` cookie (a 7-day HS256 JWT). All subsequent
  requests are authenticated by that cookie.

If you don't know the seeded credentials, inspect `artifacts/api-server/src/seed.ts` or query
the `commanders` table.

## Tutorial: your first deal

The following mirrors the day-to-day Commander workflow. UI labels may differ slightly; the
concepts are stable.

### 1. Create a deal
From **Deals** (`/deals`), create a new enterprise deal. You'll provide:
- **Account name** and **deal name** (together the natural key).
- **Account manager** and **technical lead** (references; they don't log in).
- **Sales stage** (start at *Discovery*).
- **Economics:** product revenue, pricing model, contract term (years), deal currency, services
  revenue and tier.

EDC immediately computes the **Total Contract Value** and **normalized TCV** (converted to your
reporting currency).

### 2. Work the technical gates
Open the **Deal Cockpit** (`/deals/:id`). The **technical gate matrix** shows the 9 validation
milestones grouped into gate groups (Gate 1 criteria → Gate 5 technical win). Toggle gates as
you complete them. The cockpit shows your **progress %** and the current **milestone label**.

Gate 4 (F4) enforces **prerequisites**: if you complete a gate before its declared prerequisite,
you get a non-blocking **integrity warning**.

### 3. Watch the risk engine react
As you change stage, gates, dates, and economics, the **intelligence engine** re-evaluates in
real time. You'll see:
- A **health color** (GREEN / YELLOW / RED) for the deal, driven by the composite Risk Engine
  v2 level.
- **Pattern alerts** (e.g. `PREMATURE_COMMERCIAL`, `POC_DEATH_MARCH`) — each expandable to a
  **glass-box explanation**: the exact inputs, the thresholds used (and whether they were tuned),
  and a "clears when" remediation.
- A **risk radar** across the 7 dimensions.

### 4. Hit a stage guardrail (on purpose)
Try to advance a deal to **Commercial** before completing **Gate 3 (Performance)**. The server
rejects the transition with `409 STAGE_GUARDRAIL` (the `PREMATURE_COMMERCIAL` RED pattern). To
proceed anyway, supply an **override reason** — it's recorded to the `deal_stage_overrides`
ledger and the audit log.

### 5. Govern an alert
On any alert, choose **Acknowledge / Accept / Snooze** and enter a **rationale**. The alert
becomes **Managed Risk** and drops out of the headline "critical alerts" count. Every disposition
is audited.

### 6. Simulate a change (no save)
Open the **Risk Simulator** — a client-side, non-persisted what-if. Change a stage or a gate and
preview the resulting **health + alerts** without touching the database. (It runs the *same*
engine as the server.)

### 7. Brief the executives
Switch to **Executive Briefing / War Room** mode. Build a curated agenda queue, add **private
speaker notes** (never projected or exported), and use the pacing timer. When you need to loop in
a stakeholder, generate a **Bat-Signal** — a 48-hour signed, read-only share link to a single
deal's risk card (`/share/:token`).

## Where to go next

- [Usage guide](./usage.md) — every screen and workflow in depth.
- [The risk engine](./risk-engine.md) — how each alert and dimension is computed.
- [API reference](./api-reference.md) — drive EDC programmatically.
- [Configuration](./configuration.md) — tune thresholds, currency, and more.
