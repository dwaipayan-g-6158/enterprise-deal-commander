#!/bin/bash
set -e

pnpm install --frozen-lockfile

# Apply schema changes. `drizzle-kit push` is interactive and, with stdin closed
# during post-merge, gets EOF on any confirmation prompt. It currently always
# prompts because of a phantom diff on the existing `deals_account_deal_unique`
# constraint (the constraint and a unique data set already exist in the DB), so
# the prompt is spurious. By project convention, real schema changes are applied
# via direct SQL, so a failed/aborted push here is non-fatal and must not break
# the merge. Never auto-force: --force could truncate tables to satisfy the
# spurious prompt and destroy data.
pnpm --filter @workspace/db run push || echo "drizzle push skipped (interactive prompt / no-op); schema is applied via direct SQL"
