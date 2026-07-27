# Security Notes

This page describes EDC's current security posture. It reflects the code as written; it is not a
formal security audit.

- [Authentication & sessions](#authentication--sessions)
- [Authorization (RBAC)](#authorization-rbac)
- [Secrets](#secrets)
- [Bat-Signal share links](#bat-signal-share-links)
- [Supply-chain policy](#supply-chain-policy)
- [Transport & cookies](#transport--cookies)
- [Rate limiting](#rate-limiting)
- [Audit trail](#audit-trail)
- [Reporting a vulnerability](#reporting-a-vulnerability)

## Authentication & sessions

- **Password storage:** bcrypt hashes (`bcryptjs`). Plaintext passwords are never stored.
- **Sessions:** on login the server issues an **HS256 JWT** signed with `SESSION_SECRET`, placed
  in an `edc_session` cookie with `httpOnly`, `sameSite: lax`, `Secure` in production, and a
  **7-day TTL**.
- **Enforcement:** `requireAuth` is registered **once**, centrally, in `routes/index.ts` (not
  per-router) and covers everything below it — all `/api/v2` routes and nearly all `/api/v1`
  routes. It's async: every request re-resolves `commanders.role` / `is_active` from the DB and
  attaches `req.actor`, rather than trusting a claim baked into the (7-day) cookie.
- **Public endpoints (no auth):** `GET /api/healthz`, `POST /api/v1/auth/login`,
  `POST /api/v1/auth/logout`, and `GET /api/v1/share/{token}` (Bat-Signal).
- **Login field mapping:** the `email` login field maps to `commanders.username`, matched
  case-insensitively.

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
- **Role is never a JWT claim.** It's read from the `commanders` row on every request, so
  demoting or deactivating an account takes effect on that account's *next* request — not after
  the cookie's remaining TTL. A claim-based role would let a revoked account keep write access for
  up to 7 days.
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
- `SESSION_SECRET` is **required in production**; a dev fallback constant exists only for local
  convenience. Always set a strong, unique value in any shared/hosted environment
  (`openssl rand -hex 32`).
- `DATABASE_URL` contains database credentials — treat it as a secret.

## Bat-Signal share links

The Bat-Signal (F7) is a **48-hour, signed-JWT, read-only** public link to a *single deal's risk
card* (`GET /api/v1/share/{token}`). Considerations:

- The token is a signed JWT with a short (48h) expiry — treat the URL itself as the credential;
  anyone with the link can view that one risk card until it expires.
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

## Transport & cookies

- In production, session cookies are `Secure` — **serve EDC over HTTPS** (behind a TLS-terminating
  reverse proxy). Over plain HTTP in production the cookie won't be sent and auth will fail.
- CORS and `cookie-parser` are configured in `app.ts`.

## Rate limiting

`express-rate-limit` is a dependency and available for throttling. Note: the change history shows
that **account-lockout and IP-based rate limiters were removed** at one point during the UI/UX
refresh. If you operate EDC on an untrusted network, review and (re)enable appropriate rate
limiting on the auth endpoints as part of hardening.

## Audit trail

Every mutation is recorded to the immutable `deal_audit_log` (with `entity_id` for point-in-time
reconstruction). Risk dispositions, stage overrides, interventions, and configuration changes
(`settings_change_log`, with rollback) are all auditable — providing accountability for who
changed what and why. User-management actions (create/role-change/deactivate/reactivate/delete/
password-reset) land in `settings_change_log` under `module: "users"` and show up in the same
Settings → Change Log viewer; password resets never write the hash or plaintext, only
`{ passwordChanged: true }`. Deleting a user is a hard delete — no table references
`commanders.id` by foreign key, so it can never orphan or cascade, but pre-existing audit rows
that name that person (a plain string, not a reference) are unaffected and remain attributable.

## Reporting a vulnerability

If you discover a security issue, please **do not** open a public issue. Contact the maintainers
privately (see repository owner) so it can be triaged and fixed before disclosure.

> ⚠️ **Public-repository note.** This repository is public and includes internal product
> requirement documents, improvement proposals, and competitor battlecard reference data. That
> content was published intentionally by the project owner. Do not add real credentials, customer
> data, or genuinely sensitive material to the repo or its history.
