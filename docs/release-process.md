# Release Process, Versioning & Migration

- [Current state](#current-state)
- [Versioning strategy](#versioning-strategy)
- [Cutting a release](#cutting-a-release)
- [Changelog policy](#changelog-policy)
- [Migration guides](#migration-guides)

## Current state

The project currently has **no git tags and no formal releases**; the root package version is
pinned at `0.0.0`, and development happened on a local/Replit workflow. The [CHANGELOG](../CHANGELOG.md)
is reconstructed (inferred) from commit history. This document describes the **intended** process
going forward now that the project is on GitHub.

## Versioning strategy

Adopt **Semantic Versioning** (`MAJOR.MINOR.PATCH`) while the project is pre-1.0 (`0.x`):

- **`0.MINOR.x`** — a `MINOR` bump for each feature epoch (a new analytics module, Risk Engine
  changes, etc.); `PATCH` for fixes.
- Breaking API/schema changes are called out explicitly in the changelog and, once past `1.0`,
  drive a `MAJOR` bump.
- The **API is versioned in the path** (`/api/v1`, `/api/v2`) independently of the app version;
  add `/api/v3` rather than breaking `v1`/`v2` consumers.

## Cutting a release

Suggested flow:

1. Ensure `main` is green: `pnpm install`, `pnpm run typecheck`, `pnpm run build`, and the test
   suites pass.
2. Update the version (root and/or affected packages) and move the relevant `Unreleased` entries
   in [CHANGELOG.md](../CHANGELOG.md) under a new version heading with the date.
3. Commit: `chore(release): vX.Y.Z`.
4. Tag: `git tag vX.Y.Z && git push --tags`.
5. Create a GitHub Release from the tag, pasting the changelog section.
6. (Optional) Trigger a deploy per [build-and-deploy.md](./build-and-deploy.md).

## Changelog policy

Follow [Keep a Changelog](https://keepachangelog.com): group entries under **Added / Changed /
Deprecated / Removed / Fixed / Security**, newest first, with an `Unreleased` section at the top.
Every user-visible change gets a line.

## Migration guides

### Phase 1 → Phase 2 (in-repo)

Phase 2 is additive — it does not replace Phase 1:

- **Schema:** Phase 2 tables live in the separate `edc_v2` Postgres schema; Phase 1 (`edc`) tables
  are unchanged. Apply with `pnpm --filter @workspace/db run push`.
- **API:** Phase 2 endpoints are under `/api/v2`; `/api/v1` is untouched.
- **Backfill:** to get Flow analytics on pre-existing deals, run the `backfill:transitions` script
  to populate `edc_v2.pipeline_transitions`.
- **Behavioral change:** governance health moved from the pattern-weight roll-up to the Risk
  Engine v2 composite level. RED patterns still gate stage advancement.

### Planned: migration to Zoho Catalyst

A future migration targets **Zoho Catalyst** (serverless functions + hosted data). No Catalyst
configuration exists in the repo yet. To keep that migration smooth, prefer:

- Stateless request handlers (the event bus is in-process today; a Catalyst move would likely
  externalize it).
- Port-agnostic configuration via environment variables.
- Keeping the pure engine free of runtime/platform dependencies (it already is).

Track this in [roadmap.md](./roadmap.md).
