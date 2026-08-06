import { describe, it, expect } from "vitest";

/**
 * End-to-end proof that a raw, uncaught ZodError reaching app.ts's error
 * middleware (src/app.ts, the branch added alongside the HttpError branch)
 * comes back as a legible 400 in the standard sendError envelope, not an
 * unexplained 500 -- see task-1-brief.md.
 *
 * Skipped post-Catalyst-migration (Slice 4): this test needed a real,
 * authenticated request reaching deep into a real handler's own
 * `SomeBody.parse()` call, which meant minting a session cookie via
 * issueSession over a Postgres-backed commanders row — both of which no
 * longer exist. Every route in this app is now behind requireAuth, which
 * resolves identity via a real Zoho Catalyst session that no unit test can
 * manufacture (same "Data Store isn't reachable from localhost" limitation
 * as everywhere else in this migration) — there is no authenticated-but-
 * Catalyst-free route left to redirect this test at. Retire or rewrite as an
 * integration test against the deployed AppSail app once Slice 6 seeding
 * lands; until then, index.rbac.test.ts's own ZodError-adjacent coverage
 * (bad-payload 400s from Zod-validated bodies, exercised via its test-actor
 * header bypass) is the closest surviving local coverage of "a bad body
 * comes back as 400."
 */
describe.skip("app.ts error middleware: raw ZodError -> 400", () => {
  it("POST /api/v2/playbooks with an invalid body is 400, not 500", () => {
    expect(true).toBe(true);
  });
});
