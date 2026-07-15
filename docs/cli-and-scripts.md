# CLI & Scripts Reference

EDC has **no end-user CLI** — it's a web app. This page documents the developer-facing commands:
the pnpm scripts and the maintenance scripts. All commands run from the repo root.

- [Root scripts](#root-scripts)
- [Per-package scripts](#per-package-scripts)
- [Maintenance scripts](#maintenance-scripts)
- [Running a single test](#running-a-single-test)
- [Filtering & recursion cheatsheet](#filtering--recursion-cheatsheet)

## Root scripts

Defined in the root `package.json`:

| Command | What it does |
|---|---|
| `pnpm install` | Install the workspace. A `preinstall` hook removes stray lockfiles and **rejects npm/yarn**. |
| `pnpm run build` | `typecheck` then a recursive `pnpm -r --if-present run build`. |
| `pnpm run typecheck` | `typecheck:libs` (via `tsc --build`) then per-artifact + scripts `tsc --noEmit`. |
| `pnpm run typecheck:libs` | `tsc --build` over the referenced libraries only. |

## Per-package scripts

Invoke with `pnpm --filter <package> run <script>`.

### `@workspace/api-server`
| Script | Description |
|---|---|
| `dev` | Build (esbuild) then start the API server on port 5000. **Re-run after route/schema edits** (workspace deps are inlined at build time). |
| `build` | `node ./build.mjs` → `dist/index.mjs`, `dist/seed.mjs`. |
| `start` | `node dist/index.mjs`. |
| `seed` | Seed the database (`node dist/seed.mjs`). |
| `test` | Vitest suite. |
| `typecheck` | `tsc --noEmit`. |

### `@workspace/edc`
| Script | Description |
|---|---|
| `dev` | Vite dev server (`--host 0.0.0.0`; needs `PORT` + `BASE_PATH`). |
| `build` | Vite production build → `dist/`. |
| `serve` | `vite preview` of the build. |
| `test` | Vitest. |
| `typecheck` | `tsc --noEmit`. |

### `@workspace/api-spec`
| Script | Description |
|---|---|
| `codegen` | Orval regenerates Zod validators + React Query hooks from `openapi.yaml`, then re-typechecks libs. Run after any contract change. |

### `@workspace/db`
| Script | Description |
|---|---|
| `push` | `drizzle-kit push` — apply the schema to the dev database (may prompt on a TTY). |
| `push-force` | **Do not use** — truncate risk. |

### `@workspace/engine`
| Script | Description |
|---|---|
| `test` | Vitest (pure isomorphic tests, incl. server/browser parity). |

## Maintenance scripts

`@workspace/scripts` (run via `tsx`):

| Script | Description |
|---|---|
| `backfill:transitions` | Backfill `edc_v2.pipeline_transitions` from historical data (needed for Flow analytics on pre-existing deals). |
| `build-single` | Produce a single-origin bundle (SPA copied into the API server's `dist/public`). |
| `hello` | Trivial smoke script. |
| `scripts/post-merge.sh` | Post-merge helper (schema push, etc.). |

## Running a single test

```bash
# a single file
pnpm --filter @workspace/api-server exec vitest run src/lib/cache.test.ts

# a single test by name
pnpm --filter @workspace/api-server exec vitest run src/lib/cache.test.ts -t "generation guard"
```

## Filtering & recursion cheatsheet

| Pattern | Effect |
|---|---|
| `pnpm --filter @workspace/edc run <s>` | Run `<s>` in one package. |
| `pnpm -r run <s>` | Run `<s>` in every package that defines it. |
| `pnpm -r --if-present run build` | Recursive build, skipping packages without a `build` script. |
| `pnpm --filter "./artifacts/**" run typecheck` | Filter by path glob. |
