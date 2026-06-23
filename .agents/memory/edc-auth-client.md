---
name: EDC auth & client wiring
description: Auth login field quirk and where the generated API client/hooks live for the EDC app
---

**Login field:** The login endpoint body field is `email` (string, no email-format validation) but it is matched against `commanders.username`. The seeded default commander has username `commander` (not an email). So you log in with `{ email: "commander", password: "..." }`. Frontend login form labels it generically; keep the field name `email`.

**API client:** React Query hooks are generated into `@workspace/api-client-react` (`lib/api-client-react/src/generated/api.ts`); Zod payload schemas into `@workspace/api-zod` (`lib/api-zod/src/generated/api.ts`). Both regenerate from the OpenAPI spec via `pnpm --filter @workspace/api-spec run codegen`.

**Routing:** All API routes are under `/api/v1/*` (health at `/api/healthz`). Web app calls relative paths; the shared proxy + session cookie handle auth automatically — no base URL or bearer token config needed in the browser.
