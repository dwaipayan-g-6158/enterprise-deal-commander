# Security Notes

This page describes EDC's current security posture. It reflects the code as written; it is not a
formal security audit.

- [Authentication & sessions](#authentication--sessions)
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
- **Enforcement:** `requireAuth` middleware validates the cookie and attaches `req.actor`. All
  `/api/v2` routes and nearly all `/api/v1` routes require it.
- **Public endpoints (no auth):** `GET /api/healthz`, `POST /api/v1/auth/login`, and
  `GET /api/v1/share/{token}` (Bat-Signal).
- **Login field mapping:** the `email` login field maps to `commanders.username`.

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
changed what and why.

## Reporting a vulnerability

If you discover a security issue, please **do not** open a public issue. Contact the maintainers
privately (see repository owner) so it can be triaged and fixed before disclosure.

> ⚠️ **Public-repository note.** This repository is public and includes internal product
> requirement documents, improvement proposals, and competitor battlecard reference data. That
> content was published intentionally by the project owner. Do not add real credentials, customer
> data, or genuinely sensitive material to the repo or its history.
