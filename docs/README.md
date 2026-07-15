# Enterprise Deal Commander — Documentation

Welcome. This is the complete documentation set for **Enterprise Deal Commander (EDC)**.
It is written for someone who has never seen the project before — start at the top and
follow the links, or jump to what you need.

> Every factual claim here was verified against the source (the OpenAPI contract, the
> engine source, the Drizzle schema, and the build scripts). Where something is an
> inference rather than a verified fact, it is called out explicitly.

## Getting started

| # | Doc | What it covers |
|---|---|---|
| 1 | [Overview](./overview.md) | What EDC is, why it exists, the feature catalog, and who it's for |
| 2 | [Installation](./installation.md) | Requirements, dependencies, and step-by-step setup |
| 3 | [Quick start](./quickstart.md) | Your first end-to-end run and a guided tutorial |
| 4 | [Usage guide](./usage.md) | Common workflows, screen by screen |

## Understanding the system

| # | Doc | What it covers |
|---|---|---|
| 5 | [Architecture](./architecture.md) | System design, package graph, data flow, event bus |
| 6 | [Directory & file structure](./directory-structure.md) | Annotated tree of the repository |
| 7 | [The intelligence / risk engine](./risk-engine.md) | 15 risk patterns + the 7-dimension Risk Engine v2 |
| 8 | [Data model](./data-model.md) | Database schema (`edc` + `edc_v2`), tables, relationships |

## Reference

| # | Doc | What it covers |
|---|---|---|
| 9 | [Configuration](./configuration.md) | Config files, environment variables, engine thresholds |
| 10 | [API reference](./api-reference.md) | Every REST endpoint (v1 + v2), auth, error format |
| 11 | [CLI & scripts](./cli-and-scripts.md) | All pnpm scripts and maintenance scripts |
| 12 | [Build & deployment](./build-and-deploy.md) | Build pipeline and deployment options |
| 13 | [Glossary](./glossary.md) | Canonical domain vocabulary |

## Operating & extending

| # | Doc | What it covers |
|---|---|---|
| 14 | [Troubleshooting & FAQ](./troubleshooting.md) | Common errors, logging, debugging, FAQ |
| 15 | [Security](./security.md) | Auth, secrets, supply-chain policy, share links |
| 16 | [Performance & limitations](./performance-and-limitations.md) | Caching, scale, known issues, limits |
| 17 | [Development](./development.md) | Dev setup, testing, coding standards, best practices |
| 18 | [Release process](./release-process.md) | Versioning, releases, migration guides |
| 19 | [Roadmap](./roadmap.md) | Phase 2 status and the improvement proposals |
| 20 | [Credits](./credits.md) | Acknowledgements and license |

## Product source documents

The original product requirement documents and improvement proposals live under
[`product/`](./product/):

- [Phase 1 PRD](./product/EDC-Phase-1-PRD.md) — "Executive War Room Edition"
- [Phase 2 PRD](./product/EDC-Phase-2-PRD.md) — "Sovereign Intelligence Edition"
- [Improvement proposals](./product/improvements/) — nine standalone feature proposals

## Contributing

See [`../CONTRIBUTING.md`](../CONTRIBUTING.md) and [`../CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md).
