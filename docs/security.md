# Security Notes

This page describes EDC's current security posture. It reflects the code as written; it is not a
formal security audit.

- [Authentication & sessions](#authentication--sessions)
- [Authorization (RBAC)](#authorization-rbac)
- [Secrets](#secrets)
- [Bat-Signal share links](#bat-signal-share-links)
- [Supply-chain policy](#supply-chain-policy)
- [Transport](#transport)
- [Rate limiting](#rate-limiting)
- [Audit trail](#audit-trail)
- [Reporting a vulnerability](#reporting-a-vulnerability)

## Authentication & sessions

- **No server-side password storage.** Login/logout are not server routes at all — the Catalyst
  embedded auth Web SDK widget (`artifacts/edc/src/pages/login.tsx`) talks directly to Zoho's
  identity servers to establish and end a session. `bcryptjs`/`jsonwebtoken`-based login is
  retired along with the old `POST /api/v1/auth/login` and `/logout` routes.
- **Enforcement:** `requireAuth` (`artifacts/api-server/src/lib/auth.ts`) is registered **once**,
  centrally, path-less in `routes/index.ts`, and covers everything below it. It reads the
  Catalyst-authenticated identity off the request (`getCurrentCatalystUser`) and maps it to a
  `commanders` Data Store row (`resolveCommander`), auto-provisioning one on first sign-in.
- **Public endpoints (no auth):** `GET /api/healthz` and `GET /api/v1/share/{token}` (Bat-Signal).
- **Role is never trusted from the Catalyst session.** `commanders.role`/`is_active` are re-read
  from Data Store on every request, so demoting or deactivating an account takes effect on that
  account's *next* request — not after however long the Catalyst session itself lives.
- **Auto-provisioning:** the first commander ever, or an email matching `SUPER_ADMIN_EMAIL`, or a
  Catalyst platform-admin, becomes an EDC admin automatically on first sign-in; everyone else
  becomes a reader unless an admin's pending invite (matched by email) claims a specific role.

## Authorization (RBAC)

- **Two roles:** `admin` (full access) and `reader` (every read, zero writes). There is no
  per-deal ownership or data scoping — a reader sees the entire portfolio and every Settings tab;
  the only thing withheld is the ability to write.
- **Deny-by-default gate:** `requireWriteRole` (`artifacts/api-server/src/lib/rbac.ts`) runs
  immediately after `requireAuth`, once, centrally. Admins always pass. Readers pass only for
  GET/HEAD/OPTIONS or an exact match against a small allowlist of non-mutating POSTs (dashboard
  visit, NLC parse, scenario compute, custom-pattern test — each commented with why it's safe).
  Every other write is `403 FORBIDDEN`. A new mutation route is refused to readers automatically,
  with no per-route opt-in required — this is asserted by an exhaustive route-walking test
  (`routes/index.rbac.test.ts`), not just documented here.
- **Role is never trusted from the Catalyst session.** It's read from the `commanders` row on
  every request, so demoting or deactivating an account takes effect on that account's *next*
  request — not after however long the Catalyst session itself lives. A role cached in the
  session would let a revoked account keep write access for as long as that session stayed alive.
- **User management** (`POST/PATCH/DELETE /v1/users*`) is admin-only by the same central rule
  (`GET /v1/users` is the one call every reader may also make — no secrets in the response). The
  server independently enforces two invariants no matter what the UI shows: you cannot act on your
  own account (demote/deactivate/delete self is rejected), and the last active admin cannot be
  demoted, deactivated, or deleted — this is checked transactionally with a row lock to close the
  race between two concurrent demotions.
- **Frontend gating is UX, not the boundary.** `role-context.tsx` / `write-gate.tsx` hide or
  disable controls a reader shouldn't see; a `MutationCache` backstop toasts a plain "read-only"
  message if any surface is missed. The server enforces independently of what the client renders.

## Secrets

- Configuration secrets live in per-app `.env` files, which are **git-ignored** (`.env`,
  `.env.*`). Only `.env.example` templates are committed.
- **No secrets have ever been committed** to git history (verified).
- `EDC_JOB_SECRET` gates the scheduled-job routes — treat it as a secret; an unset value fails the
  routes closed rather than exposing them, but a leaked value lets anyone trigger jobs.

## Bat-Signal share links

The Bat-Signal (F7) is a **48-hour, read-only** public link to a *single deal's risk card*
(`GET /api/v1/share/{token}`). The token is an opaque value stored in Data Store with a 48-hour
`expiresAt`, checked server-side on lookup — not a self-contained cryptographic signature. Treat
the URL itself as the credential: anyone with the link can view that one risk card until it
expires. Considerations:

- There is no cryptographic signature to verify — the token's unguessability plus the server-side
  expiry check on every lookup is the whole mechanism.
- It exposes only the shared deal's risk card, not the whole portfolio or any mutation surface.
- **Briefing export privacy:** presenter-private **speaker notes** must never leak into shared or
  exported output. Two export paths exist (image capture and print); private content is kept
  outside the content ref *and* marked print-hidden. See the `briefing-export-privacy` memory
  note before changing the Briefing export or share surfaces.

## Supply-chain policy

`pnpm-workspace.yaml` enforces **`minimumReleaseAge: 1440`** — a package version must be at least
one day old before pnpm will install it. This is a deliberate defense against npm supply-chain
attacks (most malicious releases are pulled within hours).

- **Do not disable or lower this.**
- Urgent exceptions go in `minimumReleaseAgeExclude`, only for impeccably-trusted publishers, and
  should be removed once the window passes.
- `esbuild` is pinned (`0.27.3`); a vulnerable transitive `@esbuild-kit/esm-loader` is overridden
  to `tsx`.

## Transport

- **There is no server-issued session cookie anymore.** Catalyst embedded auth's Web SDK widget
  manages the sign-in session directly against Zoho's identity infrastructure; this server never
  sets or reads a session cookie. `cookie-parser` is still registered in `app.ts` but is currently
  dead code — no route reads `req.cookies` or calls `res.cookie()`.
- CORS is configured in `app.ts` (`cors()`). Serve EDC over HTTPS in production regardless — plain
  HTTP is not an acceptable transport for a business application.

## Rate limiting

`express-rate-limit` is a dependency and available for throttling. Note: the change history shows
that **account-lockout and IP-based rate limiters were removed** at one point during the UI/UX
refresh, back when login was still a password-checking server route. If you operate EDC on an
untrusted network, review and (re)enable appropriate rate limiting on public endpoints — most
notably the Bat-Signal share lookup (`GET /api/v1/share/{token}`), the one public route that takes
an unguessable-token credential — as part of hardening.

## Audit trail

Every mutation is recorded to the immutable `deal_audit_log` (with `entity_id` for point-in-time
reconstruction). Risk dispositions, stage overrides, interventions, and configuration changes
(`settings_change_log`, with rollback) are all auditable — providing accountability for who
changed what and why. User-management actions (create/role-change/deactivate/reactivate/delete)
land in `settings_change_log` under `module: "users"` and show up in the same Settings → Change
Log viewer. There is no app-managed password to reset or audit anymore — "create a user" invites a
Catalyst project user, and Catalyst itself sends the set-password email. Deleting a user is a hard
delete — no table references `commanders.id` by foreign key, so it can never orphan or cascade,
but pre-existing audit rows that name that person (a plain string, not a reference) are unaffected
and remain attributable.

## Reporting a vulnerability

If you discover a security issue, please **do not** open a public issue. Contact the maintainers
privately (see repository owner) so it can be triaged and fixed before disclosure.

> ⚠️ **Public-repository note.** This repository is public and includes internal product
> requirement documents, improvement proposals, and competitor battlecard reference data. That
> content was published intentionally by the project owner. Do not add real credentials, customer
> data, or genuinely sensitive material to the repo or its history.
