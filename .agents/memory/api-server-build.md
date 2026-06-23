---
name: api-server build & run
description: How the api-server artifact builds and why route/script changes need a rebuild + restart
---

The api-server artifact is bundled with esbuild (`build.mjs`) into `dist/*.mjs`, then run with plain `node`. The dev/start workflow loads the bundle into a long-running Node process.

**Rule:** after editing any server source (routes, app wiring), the running workflow keeps serving the OLD bundle until you `restart_workflow`. A stale process returns 404 for newly-added routes even though typecheck passes. Always restart the api-server workflow after route changes before curl-testing.

**One-off scripts (e.g. seed):** Node cannot resolve the `workspace` export condition for `@workspace/*` TS packages directly. So scripts are added as extra esbuild entryPoints in `build.mjs` and run from `dist/` (e.g. `seed` script = `pnpm run build && node dist/seed.mjs`). Do not try `tsx`/`node --strip-types` on files importing workspace packages.
