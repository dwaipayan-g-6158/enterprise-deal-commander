# Development Guide

- [Setup](#setup)
- [The development loop](#the-development-loop)
- [Testing](#testing)
- [Coding standards](#coding-standards)
- [Best practices](#best-practices)
- [Working with the API contract](#working-with-the-api-contract)
- [Working with the database](#working-with-the-database)
- [Working with the engine](#working-with-the-engine)

## Setup

See [installation.md](./installation.md). In brief: Node 24 + pnpm + PostgreSQL 16, then
`pnpm install`, copy the `.env.example` files, `push` the schema, and `seed`.

## The development loop

Run two processes:

```bash
pnpm --filter @workspace/api-server run dev     # API on :5000 (rebuilds each start)
pnpm --filter @workspace/edc run dev            # Vite frontend with /api proxy
```

Typical inner loop:

1. Make a change.
2. If you edited routes / engine / schema, **restart the API dev script** (esbuild inlines
   workspace deps).
3. If you edited the API contract, run `codegen`.
4. `pnpm run typecheck`.
5. Run the relevant test suite.

## Testing

Tests use **Vitest**, colocated with source as `*.test.ts`.

```bash
pnpm --filter @workspace/engine run test        # pure, no DB
pnpm --filter @workspace/api-server run test     # needs a reachable DATABASE_URL
pnpm --filter @workspace/edc run test

# single file / single test
pnpm --filter @workspace/api-server exec vitest run src/lib/cache.test.ts
pnpm --filter @workspace/api-server exec vitest run src/lib/cache.test.ts -t "generation guard"
```

What's worth testing where:
- **Engine** — pure functions are ideal for table-driven tests; there are server/browser **parity**
  tests ensuring identical output. Add a test for every new pattern and dimension signal.
- **API server** — route behavior, the stage guardrail, cache generation guard, subscribers.
- **Frontend** — component logic and hooks.

## Coding standards

- **Formatter:** Prettier (default config; it's the workspace devDependency). No ESLint config —
  match the surrounding style.
- **TypeScript:** strict null checks on (`strictFunctionTypes` off). Type package boundaries
  explicitly. `moduleResolution: bundler`, ESNext modules.
- **Naming:** use the canonical vocabulary in [glossary.md](./glossary.md). Code, UI, and docs
  share one vocabulary on purpose.
- **File size:** keep modules single-purpose; a large file usually means it's doing too much.
- **Purity:** anything that must also run in the browser Risk Simulator belongs in
  `@workspace/engine` and must be pure (no `Date.now()`, `new Date()`, `Math.random()` in scoring).

## Best practices

- **Preserve the invariants** listed in [architecture.md](./architecture.md#key-invariants)
  (stage guardrail, audit `entity_id`, route ordering, health source).
- **Read the memory note** for any area with a documented gotcha before changing it
  (`.agents/memory/MEMORY.md`).
- **Never** weaken the supply-chain guard or use `push-force`.
- **Regenerate, don't hand-edit** generated API code.
- Prefer additive, reversible schema changes; remember the post-merge sync caveat.

## Working with the API contract

```bash
# 1. edit lib/api-spec/openapi.yaml
# 2. regenerate the client + validators
pnpm --filter @workspace/api-spec run codegen
# 3. implement/adjust the route in artifacts/api-server/src/routes/**
# 4. use the new generated hook in artifacts/edc
```

Register literal routes before param routes (`/gates/batch` before `/gates/:gateCode`). Don't
change `info.title`.

## Working with the database

```bash
# 1. edit lib/db/src/schema/*.ts
# 2. apply
pnpm --filter @workspace/db run push
```

Phase 2 durable tables go in the `edc_v2` schema. See [data-model.md](./data-model.md).

## Working with the engine

- Add new logic to `lib/engine/src` as pure functions; export from `index.ts`.
- A new **risk pattern** goes in the `riskPatterns` array with `code`, `severity`, `weight`,
  `evaluate`, `formatMessage`, and `explain` (always provide a `clearsWhen`).
- A new **dimension signal** goes in `dimensions.ts` with an explicit weight; the weighted-mean
  normalizer absorbs weights of signals you don't push.
- Wire any new DB-sourced input through `artifacts/api-server/src/lib/intelligence.ts` — the engine
  itself must stay DB-free.
