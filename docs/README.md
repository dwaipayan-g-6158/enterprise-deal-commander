# Enterprise Deal Commander — Documentation

Welcome. This is the complete documentation set for **Enterprise Deal Commander (EDC)**.
It is written for someone who has never seen the project before — start at the top and
follow the links, or jump to what you need.

> Every factual claim here was verified against the source (the OpenAPI contract, the
> engine source, the Catalyst Data Store schema, and the build scripts). Where something is an
> inference rather than a verified fact, it is called out explicitly.

## Getting started

| # | Doc | What it covers |
|---|---|---|
| 1 | [User Manual](./user-manual.md) | The complete guide for end users and admins — what EDC is, getting started, every screen, and admin tasks |
| 2 | [Overview](./overview.md) | Superseded by the User Manual — now a pointer to [What EDC is](./user-manual.md#what-edc-is) |
| 3 | [Installation](./installation.md) | Requirements, dependencies, and step-by-step setup — developer-focused; the User Manual's [Getting started](./user-manual.md#getting-started) covers just using a running instance |
| 4 | [Quick start](./quickstart.md) | Superseded by the User Manual for the "using the app" walkthrough; still points here for local dev setup |
| 5 | [Usage guide](./usage.md) | Superseded by the User Manual — now a pointer to [Screen-by-screen guide](./user-manual.md#screen-by-screen-guide) |

## Understanding the system

| # | Doc | What it covers |
|---|---|---|
| 6 | [Architecture](./architecture.md) | System design, package graph, data flow, event bus |
| 7 | [Directory & file structure](./directory-structure.md) | Annotated tree of the repository |
| 8 | [The intelligence / risk engine](./risk-engine.md) | 15 risk patterns + the 7-dimension Risk Engine v2 |
| 9 | [Data model](./data-model.md) | Data Store tables (Phase 1 + `v2_`-prefixed Phase 2), relationships |
| 10 | [CATALYST_SCHEMA.md](./CATALYST_SCHEMA.md) | The authoritative table-by-table Data Store manifest and type mapping — cited as source of truth by most other docs |
| 11 | [catalyst-datastore-constraints.md](./catalyst-datastore-constraints.md) | The Row API's real constraints (no `WHERE` clause, no FK cascade, concurrency limit, second-granularity datetimes) |

## Reference

| # | Doc | What it covers |
|---|---|---|
| 12 | [Configuration](./configuration.md) | Config files, environment variables, engine thresholds |
| 13 | [API reference](./api-reference.md) | Every REST endpoint (v1 + v2), auth, error format |
| 14 | [CLI & scripts](./cli-and-scripts.md) | All pnpm scripts and maintenance scripts |
| 15 | [Build & deployment](./build-and-deploy.md) | Build pipeline and deployment options |
| 16 | [Glossary](./glossary.md) | Canonical domain vocabulary |

## Operating & extending

| # | Doc | What it covers |
|---|---|---|
| 17 | [Troubleshooting & FAQ](./troubleshooting.md) | Common errors, logging, debugging, FAQ |
| 18 | [Security](./security.md) | Auth, secrets, supply-chain policy, share links |
| 19 | [Performance & limitations](./performance-and-limitations.md) | Caching, scale, known issues, limits |
| 20 | [Development](./development.md) | Dev setup, testing, coding standards, best practices |
| 21 | [Release process](./release-process.md) | Versioning, releases, migration guides |
| 22 | [Roadmap](./roadmap.md) | Phase 2 status and the improvement proposals |
| 23 | [Credits](./credits.md) | Acknowledgements and license |
| 24 | [changes/](./changes/) | Dated technical change records (migrations and major feature slices), e.g. the Catalyst migration |

## Product source documents

The original product requirement documents and improvement proposals live under
[`product/`](./product/):

- [Phase 1 PRD](./product/EDC-Phase-1-PRD.md) — "Executive War Room Edition"
- [Phase 2 PRD](./product/EDC-Phase-2-PRD.md) — "Sovereign Intelligence Edition"
- [Improvement proposals](./product/improvements/) — nine standalone feature proposals

## Contributing

See [`../CONTRIBUTING.md`](../CONTRIBUTING.md) and [`../CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md).
