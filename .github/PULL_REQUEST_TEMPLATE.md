<!-- Thanks for contributing to Enterprise Deal Commander! -->

## What & why

<!-- What does this PR change, and why? Link any related issue: Closes #123 -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / tech debt
- [ ] Documentation
- [ ] Build / CI / tooling

## Checklist

- [ ] `pnpm run typecheck` passes
- [ ] `pnpm run build` passes
- [ ] Relevant tests added/updated and `pnpm --filter <pkg> run test` passes
- [ ] If the API contract changed, I edited `lib/api-spec/openapi.yaml` and ran `pnpm --filter @workspace/api-spec run codegen` (I did **not** hand-edit generated files)
- [ ] If the DB schema changed, I updated `lib/db/src/schema/*` and applied it (`pnpm --filter @workspace/db run push`)
- [ ] I followed the existing code style (Prettier) and the conventions in `CONTRIBUTING.md`

## Screenshots / notes

<!-- UI changes: before/after screenshots. Anything reviewers should know. -->
