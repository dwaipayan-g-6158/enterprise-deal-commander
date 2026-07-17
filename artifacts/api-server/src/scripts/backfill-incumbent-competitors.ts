import { isNotNull } from "drizzle-orm";
import { db, enterpriseDeals, dealCompetitors } from "@workspace/db";
import { logger } from "../lib/logger";

// One-time backfill: mirror every existing deal's single "incumbent" FK
// (enterprise_deals.competitor_id) into the Competitive Landscape join table
// (edc_v2.deal_competitors), the same way new/edited deals are seeded going
// forward (see seedIncumbentCompetitor in routes/deals.ts). Idempotent via the
// deal_competitor_uq (deal_id, competitor_id) constraint — safe to re-run.
async function backfillIncumbentCompetitors() {
  const rows = await db
    .select({ id: enterpriseDeals.id, competitorId: enterpriseDeals.competitorId })
    .from(enterpriseDeals)
    .where(isNotNull(enterpriseDeals.competitorId));

  if (rows.length === 0) {
    logger.info("No deals with an incumbent competitor — nothing to backfill.");
    return 0;
  }

  const inserted = await db
    .insert(dealCompetitors)
    .values(
      rows.map((r) => ({
        dealId: r.id,
        competitorId: r.competitorId as number,
        status: "Active",
      })),
    )
    .onConflictDoNothing()
    .returning({ id: dealCompetitors.id });

  return inserted.length;
}

async function main() {
  logger.info("Backfilling incumbent competitors into deal_competitors...");
  const count = await backfillIncumbentCompetitors();
  logger.info({ count }, `Backfill complete: ${count} row(s) inserted.`);
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "Backfill failed");
  process.exit(1);
});
