# Configuration Reference

- [Environment variables](#environment-variables)
- [Configuration files](#configuration-files)
- [Engine thresholds](#engine-thresholds)
- [Risk Engine v2 weights & boundaries](#risk-engine-v2-weights--boundaries)
- [The pnpm catalog & supply-chain policy](#the-pnpm-catalog--supply-chain-policy)
- [TypeScript configuration](#typescript-configuration)

## Environment variables

Environment variables are loaded per app from a `.env` file in that app's directory. `.env`
files are git-ignored — copy the provided `.env.example` files.

### API server (`artifacts/api-server/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string. The app uses the `edc` and `edc_v2` schemas within this database. |
| `SESSION_SECRET` | ✅ (prod) | dev fallback constant | Secret used to sign the HS256 session JWT. In production the server **requires** this; in dev a constant fallback is used if unset. Generate with `openssl rand -hex 32`. |
| `NODE_ENV` | — | `development` | `development` or `production`. In production, session cookies are marked `Secure`. |
| `PORT` | — | `5000` | Port the Express server listens on. |

### Frontend (`artifacts/edc/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | ✅ (dev script) | — | Port for the Vite dev/preview server. |
| `BASE_PATH` | ✅ (dev script) | — | Base path the SPA is served under. `/` for local dev; a sub-path when embedded in the API server. |
| `API_PROXY_TARGET` | — | `http://localhost:5000` | Where the dev server proxies `/api` requests. |

## Configuration files

| File | Purpose |
|---|---|
| `pnpm-workspace.yaml` | Workspace globs, the dependency **catalog** (shared version pins), the `minimumReleaseAge` supply-chain guard, and native-binary `overrides`. |
| `.npmrc` | pnpm settings (`auto-install-peers=false`, `strict-peer-dependencies=false`). |
| `tsconfig.base.json` | Shared TypeScript compiler options (ESNext modules, `moduleResolution: bundler`, `customConditions: ["workspace"]`, strict null checks). |
| `tsconfig.json` (root) | Project references pointing at the buildable libs. |
| `lib/api-spec/orval.config.ts` | Orval codegen configuration (OpenAPI → Zod + React Query hooks). |
| `lib/db/drizzle.config.ts` | Drizzle Kit config (postgresql dialect, schema location). A `drizzle.local.config.ts` variant also exists. |
| `artifacts/edc/vite.config.ts` | Vite build, the `/api` dev proxy, and PWA (Workbox) configuration. |
| `artifacts/edc/components.json` | shadcn/ui configuration (new-york style, path aliases). |
| `artifacts/api-server/build.mjs` | esbuild bundler settings. |
| `artifacts/*/vitest.config.ts`, `lib/engine/vitest.config.ts` | Test runner config. |

There is **no ESLint config** — Prettier is the only formatter (workspace devDependency, default
config). There is **no `tailwind.config`** — Tailwind v4 is configured in CSS
(`artifacts/edc/src/index.css`).

## Engine thresholds

The intelligence engine is tuned by a set of thresholds (the `EngineThresholds` shape in
`lib/engine/src/index.ts`). These are seeded into the `engine_thresholds` lookup table and can be
adjusted; the engine reads them at evaluation time and marks each alert's thresholds as
`default` or `tuned` (F2 provenance).

| Threshold key | Meaning |
|---|---|
| `elephant_tcv_threshold` | TCV above which a deal is a strategic "elephant". |
| `mega_deal_tcv_threshold` | TCV above which a deal is a "mega-deal" (Discount Trap). |
| `stale_stage_days` | Days in stage before validation is considered stalled. |
| `ghost_pipeline_days` | Days without updates before a deal is a "ghost". |
| `phantom_champion_days` | Days active without executive alignment (Phantom Champion). |
| `close_date_warning_days` | Days-to-close window that triggers close-date pressure. |
| `gate_completion_warn_pct` | Expected minimum gate completion near close. |
| `reporting_currency` | The single currency all thresholds/TCV are compared in. |
| `momentum_drop_pct` | Velocity drop % that flags a self-referential slowdown (F8). |
| `momentum_window_days` | The window used to compute a deal's own momentum. |
| `momentum_min_gate_pct` | Minimum gate progress below which momentum decel is critical. |
| `low_attach_rate_threshold` | Cross-sell attach-rate floor (Low-Attach Elephant, F13). |
| `competitive_stall_days` | Days a displacement deal can stall before flagging. |
| `suite_bundle_min_components` | À-la-carte components that justify a suite-bundle upsell. |
| `poc_max_validation_days` | Max PoC duration in Validation without locked criteria. |
| `siem_high_volume_log_sources` | Log-source count that signals a large SIEM environment. |

See [risk-engine.md](./risk-engine.md) for how each threshold feeds a specific pattern.

## Risk Engine v2 weights & boundaries

Risk Engine v2 combines 7 dimensional scores into a composite. Two optional inputs let you tune
it without code changes (they are passed into the engine and can be sourced from settings):

- **`riskWeights`** — the relative weight of each of the 7 dimensions in the composite.
- **`riskBoundaries`** — the composite-score cutoffs that map to the risk levels
  `LOW → MODERATE → ELEVATED → HIGH`.

When omitted, the engine uses built-in defaults. The composite level maps to governance health
as: `HIGH → RED`, `ELEVATED`/`MODERATE → YELLOW`, `LOW → GREEN`.

## The pnpm catalog & supply-chain policy

`pnpm-workspace.yaml` centralizes shared dependency versions under `catalog:` so every package
uses the same version. Packages reference them as `"react": "catalog:"`, etc.

The **supply-chain guard** is a critical, non-negotiable setting:

```yaml
minimumReleaseAge: 1440        # packages must be ≥ 1 day old before install
minimumReleaseAgeExclude: []   # allowlist for impeccably-trusted, urgent exceptions
```

Do **not** disable or lower it. If you must install a package before the 1-day window, add it to
`minimumReleaseAgeExclude` only for a trusted publisher, and remove the exception once the window
passes.

The `overrides` block strips native binaries for platforms other than linux-x64 (the deploy
target), keeping win32-x64 enabled for local Windows development. `esbuild` is pinned to
`0.27.3`.

## TypeScript configuration

- `tsconfig.base.json` holds shared options; each package extends it.
- The root `tsconfig.json` uses **project references**; `pnpm run typecheck:libs` runs
  `tsc --build` across the referenced libraries, then each app is typechecked with `tsc --noEmit`.
- Strict null checks are on; `strictFunctionTypes` is off.

Run a full typecheck with:

```bash
pnpm run typecheck
```
