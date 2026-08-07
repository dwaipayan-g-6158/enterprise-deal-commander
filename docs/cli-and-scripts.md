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
| `build` | `node ./build.mjs` → `dist/index.mjs`. |
| `start` | `node dist/index.mjs`. |
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

### `@workspace/scripts`
| Script | Description |
|---|---|
| `build-appsail` | Builds the deployable AppSail bundle. **Run from PowerShell, not Git Bash.** Deploy the resulting zip via the Catalyst Console (app → Overview → Create Deployment) — never `catalyst deploy appsail` (it nests the entry file and 500s), and never the AppSail list's 'Deploy from Console' button (first-time creation only). |

### `@workspace/engine`
| Script | Description |
|---|---|
| `test` | Vitest (pure isomorphic tests, incl. server/browser parity). |

## Maintenance scripts

Seeding (`POST /api/v1/admin/seed?phase=lookups|config|deals|all`) and reconstructing pipeline-transition history (`POST /api/v1/admin/backfill-transitions`) are both HTTP endpoints against a running instance, admin-only via the RBAC gate — not CLI scripts, because deriving a Catalyst app handle needs a real request to come from.

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
