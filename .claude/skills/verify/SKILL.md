---
name: verify
description: Build/launch/drive recipe for verifying Deal-Commander changes end-to-end on this Windows dev host
---

# Verifying Deal-Commander on this host

No CI runner is reachable from here, so verifying anything user-visible means driving the
real running app. Since the Zoho Catalyst migration that splits into two very different
recipes, and picking the wrong one wastes a lot of time.

## Read this first: you cannot sign in locally

**Local sign-in is impossible by construction, not broken.** Every input on `/login` comes
from Catalyst's embedded-auth iframe, and the SDK needs `/__catalyst/sdk/init.js`, which
only the Catalyst AppSail gateway serves. On localhost it 404s, the iframe never renders,
and `/api/v1/auth/me` returns 401 forever. The API server says so itself:
`"Catalyst gateway did not intercept GET /sdk/init.js"`.

So:

| What you're verifying | Where |
|---|---|
| Pure logic, engine, models, transforms | `pnpm --filter <pkg> run test` — no app needed |
| Types | `pnpm run typecheck` at the repo root |
| The `/login` page itself, incl. its error + Retry state | **localhost** (the error state is the *expected* local outcome) |
| `/share/:token` (public Bat-Signal route) | localhost |
| **Anything behind auth** — dashboard, roster, cockpit, analytics, settings | **the deployed app only** |

There is no dev auth bypass, and adding one was explicitly declined — it would put a bypass
branch inside the auth boundary. Don't add one without asking.

## Local: check whether it's already running

Dev servers on this host are often left running across sessions.

```powershell
Get-NetTCPConnection -LocalPort 5000,5173 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalPort, OwningProcess |
  ForEach-Object { $_; Get-Process -Id $_.OwningProcess | Select-Object Id, ProcessName }
```

If both ports are held by `node.exe`, **don't kill and restart them**:
- **Frontend changes** — Vite HMR picks edits up live. No restart.
- **Backend changes** — the running `dist/index.mjs` is stale bytecode. Run
  `pnpm --filter @workspace/api-server run build`, then stop/restart that PID. A
  frontend-only change never needs this.

Leftover servers can also hold file locks: a stale api-server process kept a git worktree
from being deleted until it was killed. If a directory refuses to delete, look for a
`node.exe` holding port 5000.

## Local: cold start

There is **no database to provision** — the datastore is hosted Catalyst Data Store. There
is no `DATABASE_URL` and no `SESSION_SECRET`; both are dead and unused by any source file.

1. API server — `PORT` is **required** (the process throws `Neither
   X_ZOHO_CATALYST_LISTEN_PORT nor PORT was provided` without it; there is no 5000 default):
   ```powershell
   pnpm --filter @workspace/api-server run build
   $env:PORT='5000'; $env:NODE_ENV='development'; node --enable-source-maps artifacts/api-server/dist/index.mjs
   ```
   Avoid `pnpm --filter @workspace/api-server run dev` on Windows: that script is
   `export NODE_ENV=... && ...`, and pnpm runs scripts through `cmd.exe`, which fails with
   `'export' is not recognized`. Either run the two steps above directly, or force the shell
   for one invocation with `$env:npm_config_script_shell="C:\Program Files\Git\bin\bash.exe"`.
2. Frontend — **PowerShell only**; Git Bash mangles `BASE_PATH=/` into a Windows path via
   MSYS conversion, and Vite then serves the app from `/Program Files/Git/...`. Both vars are
   required (`vite.config.ts` throws without either):
   ```powershell
   $env:PORT='5173'; $env:BASE_PATH='/'; pnpm --filter @workspace/edc run dev
   ```
3. Expect `/login` to show the "Can't load the sign-in form" card with a Retry button. That
   is correct locally — see above.

## Deployed: the only way to verify authenticated screens

**https://edc-50044704196.development.catalystappsail.in** — the Catalyst *Development*
environment, which **is** production for this app. Treat writes accordingly.

Deploying is manual and Console-only:

1. `pnpm --filter @workspace/scripts run build-appsail` — **from PowerShell**, same
   `BASE_PATH` reason as above.
2. Upload `artifacts/api-server/appsail-deploy.zip` via the Catalyst Console: open the
   **`edc` app itself** → Overview → **Create Deployment**. Never `catalyst deploy appsail`
   (it nests the entry file and 500s), and never the AppSail list's "Deploy from Console"
   button (first-time creation only).
3. Never let `EDC_JOB_SECRET` into the zip's `app-config.json`, even empty — a deploy landing
   after a Console edit resets the value to `""`.

**Signing in is a human step.** It is real Zoho identity auth against live servers; no
password is scriptable. Open the sign-in page in the browser you're driving and ask the user
to sign in, then confirm with `fetch('/api/v1/auth/me')` returning 200 before continuing.
Signing in elsewhere doesn't help — the session must live in the browser under automation.

A change is not verified until it is deployed. A commit plus a built zip proves nothing about
the running app; check the deployed bundle actually contains your change (grep the built
asset for a distinctive string) rather than assuming.

## Driving the app

Either **chrome-devtools MCP** or **Playwright MCP** works; chrome-devtools is convenient
because `evaluate_script` can read the sign-in iframe's document directly (it is same-origin).

- Playwright `browser_click`/`browser_type` `target`: pass the bare ref (`f9e263`), **not**
  `ref=f9e263` — it tries to parse `ref=` as a selector engine.
- Prefer passing an explicit `filePath` when screenshotting. Without one, files can land a
  directory **above** the repo (the workspace root `CLAUDE/`); `find` for the filename if
  `Read` says it doesn't exist. Don't leave stray PNGs in the workspace root.
- **A computed style read in the same tick as the mutation that changed it returns the stale
  value.** This bites repeatedly — it made a working `box-shadow` override look broken, and a
  theme switch look like it hadn't applied. Apply, return, then read in a *separate* call.
- To inspect data without the UI, `fetch()` the JSON API from inside the page — the session
  cookie is already attached: `fetch('/api/v1/deals', { credentials: 'include' })`.
- The shadcn comboboxes (Account Manager, Technical Lead, Incumbent/Competitor) are
  command-palette style: click the trigger to open a floating `listbox`, then click an
  `option`. Don't type+select in one step unless you want the filter behavior.
- Uid/ref values go stale after the DOM changes (closing a dialog is enough). Re-snapshot
  rather than reusing one.

## Known-good verification flows

- **Seed data spot-checks** — the deployed Data Store holds ~12 seeded demo deals
  (`Project Atlas`, `Project Beacon`, `Project Cobalt`, `Project Delta`, `Project Sentinel`).
  Names are fictional, so screenshots are safe to share. Best way to confirm a *display*
  change without writing anything.
- **New Deal → cockpit round-trip** — open New Deal, fill Deal Name, Account Name, Account
  Manager, Technical Lead, Sales Stage, Pricing Model, Services Tier, submit, confirm
  navigation to `/deals/:id` and the values on the cockpit header.
- **Edit Deal auto-save** — the Edit sheet auto-saves 1s after any change (debounced `watch`);
  "Save Changes" also saves immediately.
- **Sign-in iframe changes** must be walked step by step, because each step is a different
  DOM: email → bogus email (field-error state) → password → **Forgot Password**. That last
  one navigates the same iframe to a page that ignores `css_url`, and is where theming
  regressions hide.

## Gotcha: UI writes go to the real Data Store

Creating or editing a deal through the deployed UI writes a **real row** to the Catalyst Data
Store — the same one the app serves from, and there is no separate staging environment. Say so
rather than silently cleaning up; the user may want to inspect it. Prefer read-only checks
against the seeded deals when a display change is all you're verifying.

## When screenshots go into the repo

`docs/assets/*.png` is committed to a **public** GitHub repo. Two standing rules: never
capture Settings → Users (the only surface showing real email addresses — shoot a config tab
instead), and capture Briefing mode as a **viewport**, not full-page, so the
`PRESENTER NOTES — PRIVATE / Not projected or exported` block stays out of frame.
