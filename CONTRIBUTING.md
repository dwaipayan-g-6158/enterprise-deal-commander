# Contributing to Enterprise Deal Commander

Thanks for your interest in contributing! This guide covers how to set up the
project, the conventions we follow, and how to get a change merged. Please also
read the [Code of Conduct](./CODE_OF_CONDUCT.md).

For a deeper walkthrough of the codebase, see [`docs/development.md`](./docs/development.md)
and [`docs/architecture.md`](./docs/architecture.md).

## Table of contents

- [Ground rules](#ground-rules)
- [Development setup](#development-setup)
- [Project conventions](#project-conventions)
- [Making a change](#making-a-change)
- [Coding standards](#coding-standards)
- [Testing](#testing)
- [Commit & PR guidelines](#commit--pr-guidelines)

## Ground rules

1. **Use pnpm.** The `preinstall` hook rejects `npm` and `yarn`. Install [pnpm](https://pnpm.io) first.
2. **The OpenAPI spec is the source of truth.** Never hand-edit generated code under `lib/api-*/src/generated/**`. Change `lib/api-spec/openapi.yaml` and re-run codegen.
3. **Keep the engine pure.** `lib/engine` performs no DB/network calls and must stay isomorphic (no `Date.now()`, `new Date()`, or `Math.random()` in scoring paths). All external data arrives as function arguments.
4. **Never lower the supply-chain guard.** Do not disable or reduce `minimumReleaseAge` in `pnpm-workspace.yaml`.
5. **Never use `push-force`** on the database (truncate risk).

## Development setup

```bash
# Prerequisites: Node 24, pnpm, PostgreSQL 16
pnpm install

# API server env
cp artifacts/api-server/.env.example artifacts/api-server/.env   # set DATABASE_URL, SESSION_SECRET

# Schema + seed
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run seed

# Run (two terminals)
pnpm --filter @workspace/api-server run dev     # API on :5000
pnpm --filter @workspace/edc run dev            # Vite frontend
```

See [`docs/installation.md`](./docs/installation.md) for OS-specific notes.

## Project conventions

- **Monorepo layout:** apps in `artifacts/*`, shared libraries in `lib/*`, one-off scripts in `scripts/`. Workspace packages are named `@workspace/<name>`.
- **Contract-first API:** edit `lib/api-spec/openapi.yaml`, then run:
  ```bash
  pnpm --filter @workspace/api-spec run codegen
  ```
  This regenerates the server-side Zod validators (`@workspace/api-zod`) and the client-side React Query hooks (`@workspace/api-client-react`). Do **not** change `info.title` in the spec — it drives codegen filenames.
- **Database:** edit Drizzle schema in `lib/db/src/schema/*.ts`, then apply with `pnpm --filter @workspace/db run push`. Phase 2 durable-history tables live in the `edc_v2` Postgres schema.
- **API server rebuilds on every start** (esbuild inlines workspace deps), so re-run the dev script after route/schema edits.
- **Express route ordering:** register literal paths (e.g. `/gates/batch`) *before* param paths (`/gates/:gateCode`).
- **Read the memory notes.** `.agents/memory/MEMORY.md` indexes hard-won gotchas (esbuild build/run, post-merge schema sync, cache generation guard, briefing export privacy, snapshot payload). Read the relevant note before touching those areas.

## Making a change

1. Create a feature branch from `main`: `git checkout -b feat/short-description`.
2. Make your change following the conventions above.
3. Run `pnpm run typecheck` and `pnpm run build`.
4. Add/update tests and run the relevant suite.
5. Open a pull request using the template.

## Coding standards

- **Formatting:** Prettier (`prettier` is the workspace devDependency). Match the existing style; there is no separate ESLint config.
- **TypeScript:** `strict`-family options are on (see `tsconfig.base.json`). Prefer explicit types at package boundaries.
- **Naming:** use the canonical domain vocabulary from [`docs/glossary.md`](./docs/glossary.md) (Deal Commander, technical gate, pattern alert, health status, normalized TCV, etc.). Consistency between code, UI, and docs is intentional.
- **Purity & isomorphism:** anything that must run in the browser Risk Simulator belongs in `@workspace/engine` and must be pure.
- **Small, focused units:** keep files single-purpose; a file that grows large is usually doing too much.

## Testing

Tests use **Vitest** and live next to source as `*.test.ts`.

```bash
# whole package
pnpm --filter @workspace/engine run test
pnpm --filter @workspace/api-server run test

# single file
pnpm --filter @workspace/api-server exec vitest run src/lib/cache.test.ts

# single test by name
pnpm --filter @workspace/api-server exec vitest run src/lib/cache.test.ts -t "generation guard"
```

The engine has isomorphic parity tests ensuring server and browser produce identical risk output. API-server tests that need a database expect a reachable `DATABASE_URL`.

## Commit & PR guidelines

- Write imperative, descriptive commit subjects (e.g. `feat: add pipeline coverage tracker`).
- Keep PRs focused; note any API-contract or schema changes explicitly.
- Fill in the PR checklist (typecheck, build, tests, codegen/schema regeneration).
- Include before/after screenshots for UI changes.
