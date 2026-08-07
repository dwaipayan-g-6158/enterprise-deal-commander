# Build & Deployment

- [Build overview](#build-overview)
- [Typecheck](#typecheck)
- [Building each package](#building-each-package)
- [API server build (esbuild)](#api-server-build-esbuild)
- [Frontend build (Vite)](#frontend-build-vite)
- [Code generation (Orval)](#code-generation-orval)
- [Single-origin bundle](#single-origin-bundle)
- [Deployment](#deployment)

## Build overview

The root build orchestrates a typecheck followed by a recursive per-package build:

```bash
pnpm run build
# = pnpm run typecheck && pnpm -r --if-present run build
```

```mermaid
flowchart LR
    TC[pnpm run typecheck] --> B[pnpm -r run build]
    B --> ENG[engine: no build step]
    B --> API[api-server: esbuild → dist/*.mjs]
    B --> EDC[edc: vite build → dist/]
```

## Typecheck

```bash
pnpm run typecheck
# typecheck:libs → tsc --build (project references over lib/db, lib/engine, lib/api-*)
# then per-artifact + scripts → tsc --noEmit
```

Always run this before claiming a change compiles. It is the fastest full-repo correctness gate.

## Building each package

| Package | Command | Output |
|---|---|---|
| `@workspace/engine` | (none) | Pure TS, consumed directly — no build step. |
| `@workspace/api-server` | `pnpm --filter @workspace/api-server run build` | `dist/index.mjs` (esbuild) |
| `@workspace/edc` | `pnpm --filter @workspace/edc run build` | `dist/` static SPA (Vite) |
| `@workspace/api-zod`, `@workspace/api-client-react` | via codegen | `src/generated/**` |

## API server build (esbuild)

`artifacts/api-server/build.mjs` bundles `src/index.ts` — the server's only entry point — into a
single ESM file under `dist/` (`.mjs`). `src/seed.ts` used to sit beside it as a second entry
point; it was Drizzle-only and went with the rest of that layer — seeding is
`POST /api/v1/admin/seed` now (see [cli-and-scripts.md](./cli-and-scripts.md)), not a built
script. Key characteristics:

- **Workspace dependencies are inlined** into the bundle. This is why the `dev` script rebuilds
  on every start and why you must re-run it after editing routes, the engine, or the schema.
- A banner shims `require`/`__dirname` for the ESM output.
- A long `external` list keeps native modules out of the bundle.
- The `esbuild-plugin-pino` transport plugin is applied for structured logging.

The `dev` script = build (`node ./build.mjs`) then start (`node dist/index.mjs`).

## Frontend build (Vite)

`artifacts/edc` builds with Vite 7:

```bash
pnpm --filter @workspace/edc run build     # → dist/
pnpm --filter @workspace/edc run serve     # vite preview of the build
```

`vite.config.ts` also configures the **PWA** (manifest "Enterprise Deal Commander",
`StaleWhileRevalidate` caching of `/api/v[12]/` GETs except auth) and the dev proxy
(`/api` → `API_PROXY_TARGET`, default `http://localhost:5000`).

## Code generation (Orval)

The API client and validators are generated, not hand-written:

```bash
pnpm --filter @workspace/api-spec run codegen
```

Run this after **any** change to `lib/api-spec/openapi.yaml`. It regenerates `@workspace/api-zod`
and `@workspace/api-client-react`, then re-typechecks the libs. Do not hand-edit
`src/generated/**`, and do not change `info.title` in the spec.

## Single-origin bundle

For hosting the whole product behind one origin/port, the SPA can be built and served by the
Express process:

- `app.ts` optionally serves the built SPA from `dist/public` with an Express-5 `/{*splat}`
  fallback (so client-side routes resolve).
- `scripts/build-single.ts` and `scripts/post-merge.sh` support producing the single bundle
  (the built SPA is copied into the API server's `dist/public`).

In that mode you set the frontend `BASE_PATH` to the sub-path the app is mounted at.

## Deployment

The app deploys as a single **Zoho Catalyst AppSail** app (`catalyst.json` declares it). To deploy:

1. `pnpm --filter @workspace/scripts run build-appsail` — **run from PowerShell, not Git Bash**
   (Git Bash mangles `BASE_PATH` via MSYS path conversion, producing a broken build).
2. Deploy the resulting zip via the Catalyst **Console** — the app → Overview → **Create
   Deployment**. Never `catalyst deploy appsail` (the CLI nests the entry file and 500s), and
   never the AppSail list's "Deploy from Console" button (that one is first-time-creation only).
3. Set `EDC_JOB_SECRET` (required) and any optional env vars (see
   [configuration.md](./configuration.md)) in the Console's environment-variables panel before or
   after the first deploy.

There is still no CI-driven deploy pipeline — deploys are manually triggered from the Console.
