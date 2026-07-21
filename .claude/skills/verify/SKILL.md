---
name: verify
description: Build/launch/drive recipe for verifying Deal-Commander changes end-to-end on this Windows dev host
---

# Verifying Deal-Commander on this host

This repo has no CI runner reachable from here — verification means driving the real
running app (API + frontend) in a browser. See also the "EDC local Windows run" memory
for the full local-setup story; this skill is the condensed drive/verify recipe.

## Before doing anything: check if it's already running

Dev servers on this host are often left running across sessions.

```powershell
Get-NetTCPConnection -LocalPort 5000,5173 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalPort, OwningProcess |
  ForEach-Object { $_; Get-Process -Id $_.OwningProcess | Select-Object Id, ProcessName }
```

If both ports are already held by `node.exe` processes, **don't kill and restart them** —
just drive the already-running app:
- Frontend changes: Vite has HMR, so edits are picked up live. No restart needed.
- Backend changes: the running `dist/index.mjs` process is stale bytecode. You must
  `pnpm --filter @workspace/api-server run build` then stop/restart that process (find its
  PID via the command above and `Stop-Process`, or ask the user to restart it) for server
  code changes to take effect. A frontend-only change never needs this.

## Cold start (only if nothing is listening)

1. Confirm Postgres is up: `Get-Service -Name "postgresql*"` → `postgresql-x64-17` should be `Running`.
2. Build + run the API server (PowerShell, not Git Bash — avoids `export`/path-mangling issues):
   ```powershell
   pnpm --filter @workspace/api-server run build
   $env:DATABASE_URL='postgres://postgres:postgres@localhost:5432/edc'; $env:SESSION_SECRET='local-dev-secret-edc-2026'; $env:PORT='5000'; $env:NODE_ENV='development'; node --enable-source-maps artifacts/api-server/dist/index.mjs
   ```
3. Run the frontend (PowerShell only — Git Bash mangles `BASE_PATH=/`):
   ```powershell
   $env:PORT='5173'; $env:BASE_PATH='/'; pnpm --filter @workspace/edc run dev
   ```
4. Login: **commander / DealCommander!2026**.

Full detail (native win32 binaries, drizzle-on-Windows quirks, seed command) is in the
`edc-local-windows-run` Claude memory file — read it first if the cold start above fails.

## Driving the app

- Use the Playwright MCP tools (`browser_navigate`, `browser_snapshot`, `browser_click`,
  `browser_fill_form`, `browser_evaluate`, `browser_take_screenshot`).
- `browser_click`/`browser_type` `target` param: pass the bare ref string from the snapshot
  (e.g. `f9e263`), **not** `ref=f9e263` — the tool errors trying to parse `ref=` as a
  selector engine.
- Screenshots taken via the MCP tool save relative to wherever the browser's actual CWD is,
  which can land **one directory above** the repo (the workspace root `CLAUDE/`, not
  `CLAUDE/Deal-Commander/`) — `find` for the filename if `Read` reports "does not exist" at
  the expected path. Clean these up after use; don't leave stray PNGs in the workspace root.
- To check persisted data directly (bypassing UI), `fetch()` the JSON API from inside
  `browser_evaluate` — the session cookie is already attached: e.g.
  `fetch('/api/v1/deals?limit=50', { credentials: 'include' })`.
- The shadcn comboboxes (Account Manager, Technical Lead, Incumbent/Competitor) are a
  searchable command-palette style — clicking the trigger opens a floating `listbox` with
  its own `option` elements; click those, don't try to type+select in one step unless you
  need the search-filter behavior.
- The native `<Select>` fields (Sales Stage, Pricing Model, Services Tier) behave like
  standard listboxes too.

## Known-good verification flows

- **New Deal → Deal cockpit round-trip**: open New Deal sheet, fill required fields
  (Deal Name, Account Name, Account Manager, Technical Lead, Sales Stage, Pricing Model,
  Services Tier), submit, confirm navigation to `/deals/:id` and that entered values render
  on the cockpit header.
- **Seed data spot-checks**: several seeded deals carry real-looking field values (e.g.
  `crmRecordUrl` on "Project Atlas", "Project Beacon", "Project Cobalt", "Project Delta") —
  useful for confirming a *display* change works against pre-existing data without creating
  a new deal.
- **Edit Deal auto-save**: the Edit sheet auto-saves 1s after any field change (debounced
  `watch` subscription) — clicking "Save Changes" also saves immediately without waiting.

## Gotcha: test data leaks into the pipeline dashboard

Creating a deal through the UI to verify the create flow adds a **real row** to the local
dev DB, visible on the Command Center dashboard and deal-switcher strip. Flag this to the
user rather than silently deleting it — they may want to inspect or reuse it themselves.
