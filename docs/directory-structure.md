# Directory & File Structure

An annotated map of the repository. Paths are relative to the repo root
(`Deal-Commander/`). Generated and git-ignored paths are marked.

```
Deal-Commander/
├── README.md                     # Front door
├── LICENSE                       # MIT
├── CONTRIBUTING.md               # How to contribute
├── CODE_OF_CONDUCT.md
├── CHANGELOG.md                  # Inferred milestone history
├── CLAUDE.md                     # Guidance for AI coding agents
├── package.json                  # Root workspace scripts + shared devDeps
├── pnpm-workspace.yaml           # Workspace globs, dependency catalog, supply-chain policy
├── pnpm-lock.yaml                # Lockfile (pnpm only)
├── .npmrc                        # pnpm settings
├── tsconfig.json                 # Root project references
├── tsconfig.base.json            # Shared TypeScript compiler options
├── .gitignore
│
├── .github/                      # (added for the public repo)
│   ├── workflows/ci.yml          # CI: install → typecheck → build → tests
│   ├── ISSUE_TEMPLATE/           # Bug & feature templates
│   └── PULL_REQUEST_TEMPLATE.md
│
├── artifacts/                    # ── Deployable apps ──
│   ├── api-server/               # @workspace/api-server (Express 5, :5000)
│   │   ├── src/
│   │   │   ├── index.ts          # Entry: validate PORT, listen, registerSubscribers()
│   │   │   ├── app.ts            # App assembly: middleware, router mount, SPA fallback, error handler
│   │   │   ├── seed.ts           # Database seeding
│   │   │   ├── routes/           # v1 routers: auth, deals, gates, blockers, crosssells,
│   │   │   │   │                 #   intelligence, dispositions, interventions, audit,
│   │   │   │   │                 #   batsignal, shared, lookups, settings-audit, health
│   │   │   │   └── v2/           # v2 routers: index, crud, analytics, config, exports
│   │   │   └── lib/              # Server logic: intelligence.ts (DB→engine bridge),
│   │   │       │                 #   auth, events, cache, audit, scoring, advisor, etc.
│   │   │       └── subscribers/  # Event-bus subscribers (activity, snapshot, health, cache, …)
│   │   ├── build.mjs             # esbuild bundler → dist/*.mjs
│   │   ├── vitest.config.ts
│   │   ├── .env.example          # (copy to .env; git-ignored)
│   │   └── dist/                 # Build output (git-ignored)
│   │
│   ├── edc/                      # @workspace/edc (React 19 + Vite + Tailwind v4 + shadcn/ui)
│   │   ├── src/
│   │   │   ├── main.tsx          # Bootstrap
│   │   │   ├── App.tsx           # Routes (wouter) + providers
│   │   │   ├── index.css         # Tailwind v4 CSS-based config
│   │   │   ├── pages/            # dashboard, deals, deal-cockpit, portfolio, autopsy,
│   │   │   │                     #   analytics, memory, memory-detail, settings, login, share, …
│   │   │   ├── components/
│   │   │   │   ├── cockpit/      # Feature components (briefing-mode, risk-simulator,
│   │   │   │   │   │             #   technical-gates, blockers-panel, cross-sell-panel, …)
│   │   │   │   │   ├── charts/   # forecast-fan, health-donut, winloss-donut
│   │   │   │   │   ├── flow/     # pipeline-funnel, conversion-matrix, transition-sankey, …
│   │   │   │   │   ├── risk/     # risk-radar, risk-score-card, dimension-bars, …
│   │   │   │   │   └── v2/       # competitive-panel, stakeholders-panel, playbook-panel, …
│   │   │   │   └── ui/           # Generated shadcn/ui primitives
│   │   │   ├── hooks/            # use-local-storage-state, use-media-query, use-toast, …
│   │   │   └── lib/              # format.ts, utils.ts (cn helper)
│   │   ├── vite.config.ts        # Dev proxy (/api → :5000) + PWA config
│   │   ├── components.json       # shadcn/ui config (new-york style)
│   │   ├── vitest.config.ts
│   │   └── .env.example
│   │
│   └── mockup-sandbox/           # @workspace/mockup-sandbox — UI playground (NOT shipped)
│
├── lib/                          # ── Shared libraries ──
│   ├── engine/                   # @workspace/engine (pure, isomorphic)
│   │   └── src/
│   │       ├── index.ts          # riskPatterns[] (15), processDealIntelligence, recommendations
│   │       ├── dimensions.ts     # Risk Engine v2 — 7 dimensional scorers
│   │       ├── risk-v2.ts        # computeUnifiedRisk (Layer 1+2+3 synthesis)
│   │       ├── risk-v2-types.ts  # Shared types
│   │       ├── scoring.ts        # Predictive scoring
│   │       ├── simulation.ts     # Pipeline simulation
│   │       ├── custom-patterns.ts, ramp.ts, nlc.ts, flow.ts, loss-risk.ts, contextual-patterns.ts
│   │
│   ├── db/                       # @workspace/db (Drizzle)
│   │   ├── src/
│   │   │   ├── index.ts          # pg Pool + drizzle(pool, { schema })
│   │   │   └── schema/           # auth, deals, lookups, edc_v2, edc_v2_intel, settings
│   │   ├── drizzle.config.ts     # + drizzle.local.config.ts
│   │   └── sql/                  # Ad-hoc SQL
│   │
│   ├── api-spec/                 # @workspace/api-spec
│   │   ├── openapi.yaml          # ★ API source of truth (~124 endpoints)
│   │   └── orval.config.ts       # Codegen config
│   ├── api-zod/                  # @workspace/api-zod (generated Zod validators)
│   └── api-client-react/         # @workspace/api-client-react (generated React Query hooks)
│
├── scripts/                      # @workspace/scripts (tsx)
│   ├── (backfill:transitions, build-single, hello)
│   ├── post-merge.sh
│   └── sql/
│
├── docs/                         # ── This documentation set ──
│   ├── README.md                 # Documentation index
│   ├── *.md                      # Section docs (this file, architecture, api-reference, …)
│   ├── assets/                   # Screenshots / diagrams
│   └── product/                  # PRDs + improvement proposals
│       ├── EDC-Phase-1-PRD.md
│       ├── EDC-Phase-2-PRD.md
│       └── improvements/
│
├── attached_assets/              # Original PRD markdown (timestamped filenames)
│
├── .agents/memory/               # Engineering gotcha notes
│   └── MEMORY.md                 # Index of the notes below
│
└── docs/superpowers/, docs/changes/   # Historical implementation plans, specs & change logs
```

## Where things live — quick reference

| I want to change… | Go to |
|---|---|
| A risk pattern or the dimensional model | `lib/engine/src/index.ts`, `dimensions.ts`, `risk-v2.ts` |
| The database schema | `lib/db/src/schema/*.ts` |
| An API endpoint | `lib/api-spec/openapi.yaml` → `codegen` → `artifacts/api-server/src/routes/*` |
| The DB→engine input assembly | `artifacts/api-server/src/lib/intelligence.ts` |
| A page or UI component | `artifacts/edc/src/pages/*`, `artifacts/edc/src/components/*` |
| Event-bus behavior | `artifacts/api-server/src/lib/events.ts`, `.../subscribers/*` |
| Build config | `artifacts/api-server/build.mjs`, `artifacts/edc/vite.config.ts` |
