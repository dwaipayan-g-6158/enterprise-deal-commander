# Installation Guide

- [Requirements](#requirements)
- [1. Install the toolchain](#1-install-the-toolchain)
- [2. Clone the repository](#2-clone-the-repository)
- [3. Install dependencies](#3-install-dependencies)
- [4. Provision PostgreSQL](#4-provision-postgresql)
- [5. Configure environment variables](#5-configure-environment-variables)
- [6. Create the schema and seed data](#6-create-the-schema-and-seed-data)
- [7. Verify the install](#7-verify-the-install)
- [Platform notes](#platform-notes)

## Requirements

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | **24.x** | The monorepo targets Node 24. |
| **pnpm** | 9+ (10 recommended) | **Required.** `npm` and `yarn` are rejected by a `preinstall` hook. |
| **PostgreSQL** | **16** | Uses the `edc` and `edc_v2` schemas inside one database. |
| Git | any recent | To clone. |

There is **no Docker/compose** setup in the repository — you run Postgres and the Node
processes directly. Deployment historically targets **linux-x64** (native binaries for other
platforms are stripped in `pnpm-workspace.yaml`, except win32-x64 which is kept for local
Windows development).

### Key dependency versions (from the pnpm catalog)

| Area | Package | Version |
|---|---|---|
| Frontend | react / react-dom | `19.1.0` (pinned) |
| Frontend | vite | `^7.3.2` |
| Frontend | tailwindcss / @tailwindcss/vite | `^4.1.14` |
| Frontend | @tanstack/react-query | `^5.90.21` |
| Frontend | wouter | `^3.3.5` |
| Data | drizzle-orm | `^0.45.2` |
| Tooling | typescript | `~5.9.3` |
| Tooling | tsx | `^4.21.0` |
| Tooling | zod | `^3.25.76` |

## 1. Install the toolchain

Install Node 24 (via your OS package manager, [nvm](https://github.com/nvm-sh/nvm), or the
official installer), then enable pnpm. The simplest route is Corepack (bundled with Node):

```bash
corepack enable
corepack prepare pnpm@latest --activate

# verify
node -v    # v24.x
pnpm -v    # 9.x or 10.x
```

## 2. Clone the repository

```bash
git clone https://github.com/dwaipayan-g-6158/enterprise-deal-commander.git
cd enterprise-deal-commander
```

## 3. Install dependencies

```bash
pnpm install
```

Notes:
- This installs **all** workspace packages.
- A `preinstall` hook enforces pnpm; if you accidentally run `npm install` or `yarn`, it exits
  with `Use pnpm instead`.
- The **supply-chain guard** (`minimumReleaseAge: 1440`) requires any newly-published package
  version to be at least one day old. Do not disable it. This only affects fresh resolution, not
  installs from the committed lockfile.

## 4. Provision PostgreSQL

Create a database and a user. For local development:

```sql
CREATE DATABASE edc;
CREATE USER edc WITH PASSWORD 'edc';
GRANT ALL PRIVILEGES ON DATABASE edc TO edc;
```

The application creates and uses two schemas inside this database: `edc` (Phase 1) and `edc_v2`
(Phase 2). You do not need to create the schemas by hand — `drizzle-kit push` does that.

> On this project's Windows dev host, a portable PostgreSQL build is used; any reachable
> Postgres 16 instance works as long as `DATABASE_URL` points to it.

## 5. Configure environment variables

Copy the example env files and fill in real values:

```bash
cp artifacts/api-server/.env.example artifacts/api-server/.env
cp artifacts/edc/.env.example        artifacts/edc/.env
```

Minimum required for the API server (`artifacts/api-server/.env`):

```dotenv
DATABASE_URL=postgres://edc:edc@localhost:5432/edc
SESSION_SECRET=<a long random string, e.g. `openssl rand -hex 32`>
NODE_ENV=development
PORT=5000
```

Frontend (`artifacts/edc/.env`): `PORT`, `BASE_PATH=/`, and optionally `API_PROXY_TARGET`
(defaults to `http://localhost:5000`). Full reference: [configuration.md](./configuration.md).

## 6. Create the schema and seed data

```bash
# Push the Drizzle schema into the database (dev)
pnpm --filter @workspace/db run push

# Seed lookup tables + sample data
pnpm --filter @workspace/api-server run seed
```

> `drizzle-kit push` may present an interactive prompt for certain changes. **Never** use
> `push-force` (it can truncate data). For additive nullable columns, applying via direct SQL is
> an accepted workaround (see the memory notes).

## 7. Verify the install

```bash
# Typecheck every package — the fastest end-to-end sanity check
pnpm run typecheck

# Start the API server (port 5000)
pnpm --filter @workspace/api-server run dev
# → in a browser or curl:
curl http://localhost:5000/api/healthz

# In a second terminal, start the frontend
pnpm --filter @workspace/edc run dev
```

Open the Vite URL printed in the terminal and continue with the
[Quick Start](./quickstart.md).

## Platform notes

- **Windows:** win32-x64 native binaries (rollup, lightningcss, tailwind oxide, esbuild) are
  intentionally kept enabled so the app runs on a local Windows dev host. Use PowerShell or Git
  Bash; the pnpm commands are identical.
- **linux-x64:** the primary/deploy target. Everything works out of the box.
- **macOS / other:** native binaries for these platforms are stripped by the `overrides` block
  in `pnpm-workspace.yaml`. You may need to re-enable the relevant `@esbuild/*`, `rollup`, and
  `lightningcss` platform packages for your architecture, or develop inside a linux-x64
  container.
