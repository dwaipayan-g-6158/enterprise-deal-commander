---
name: EDC RBAC delegation (admin + reader)
description: How the admin/reader role gate is enforced server-side, and the invariants a future change must not break
---

Two roles: `admin` (full access) and `reader` (every read, zero writes — no
per-deal ownership or data scoping anywhere; a reader sees the entire
portfolio and every Settings tab).

**Role lives on `commanders.role`/`is_active`, never in the JWT.** The
session cookie has a 7-day TTL; a role claim would let a demoted or
deactivated account keep write access for up to a week. `requireAuth`
(`artifacts/api-server/src/lib/auth.ts`) is async and re-resolves the role
from the DB on every request — the cookie proves identity only (`sub`/
`username`/`name`). It has an idempotency guard (`if (req.actor) return
next()`) so re-adding a second `.use(requireAuth)` anywhere is free, not a
second DB round trip.

**Enforcement is ONE gate, not one per router.** `requireWriteRole`
(`artifacts/api-server/src/lib/rbac.ts`) is mounted exactly once, path-less,
in `routes/index.ts` immediately after `requireAuth` — every one of the 11
pre-existing per-router `router.use(requireAuth)` calls was deleted as part
of this change (they were false defense-in-depth: they'd still 401
anonymous callers if a router got reordered above the gate, but a reader
would silently get full write access since `requireWriteRole` wouldn't run).
**Do not add a per-route or per-router auth/role check** — it creates a
second place that can drift from the real one.

Deny-by-default: admin → always allowed; reader → allowed only for
GET/HEAD/OPTIONS or an exact match in `READER_WRITE_METHOD_ALLOWLIST`
(4 entries: `/auth/dashboard-visit`, `/v2/nlc/parse`,
`/v2/scenarios/compute`, `/v2/custom-patterns/test` — each is either a pure
compute or writes only the caller's own row). A new mutation route added
anywhere is refused to readers automatically the moment it's registered —
no opt-in required. This is asserted by `routes/index.rbac.test.ts`, which
walks every router's `.stack` and fires every non-safe route with a reader
cookie expecting exactly 403; **that test — not this note — is the source
of truth if the two ever disagree.**

**Path matching:** use `req.baseUrl + req.path` (see `fullPathname` in
`rbac.ts`), never `req.originalUrl` (carries the query string, breaks exact
match) or bare `req.path` (misses the mount prefix). Lowercased and
trailing-slash-stripped to mirror Express's own `caseSensitive:false` /
`strict:false` defaults.

**Two GETs mutate and are handled by making persistence conditional, not by
blocking the route:** `GET /v2/deals/:dealId/score` calls
`computeDealScore` (no insert) for readers and `scoreDeal` (inserts
`deal_scores`) for admins — same number either way. `GET
/v2/analytics/engagement` only runs the achievement-grant loop for admins
(`commander_achievements` has no per-user column — it's an app-global
ledger, so a reader hitting it would silently mint the owner's
achievement).

**User management** (`routes/users.ts`) has no per-route admin check either
— `GET /v1/users` is allowed to readers by the same central rule (explicit
column list, `passwordHash` is never a field), the other four methods are
refused automatically. The last-active-admin invariant
(`assertAnotherActiveAdminRemains`) runs inside a `db.transaction` with
`.for("update")` locking on admin rows — without the lock, two concurrent
demotes can each see the other still active and the app permanently loses
its only admin. Self-guards (can't demote/deactivate/delete yourself) are
checked before that invariant so the error message is specific. Audit
events reuse `settings_change_log` with `module: "users"` — no separate
audit table.

**Frontend is UX only, never the boundary:** `src/lib/auth/role-context.tsx`
(`useCanWrite()`) + `src/components/auth/write-gate.tsx` (`<AdminOnly>`,
`<ReadOnlyTooltip>`, `<ReadOnlyNotice>`) hide/disable controls; a
`MutationCache.onError` backstop in `App.tsx` toasts on any 403 the sweep
missed. `src/components/roster/row-context-menu.tsx`'s `RowActions.canWrite`
is the single highest-leverage gate — it covers the deal table, board,
timeline, and card views at once since they all share that context menu.

Migration: `lib/db/sql/2026-07-28-commander-rbac.sql` — adds `role`
(default `'reader'`, fail-closed) + `is_active`, then promotes every
pre-existing row to `admin` in one guarded pass (idempotent; re-running it
is the documented break-glass recovery if the app is ever left with zero
admins).
