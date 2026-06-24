import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Materialized-view refresh scaffolding for future Phase 2 analytics.
 *
 * Later milestones will introduce Postgres materialized views (e.g. portfolio
 * rollups, momentum aggregates) backed by the edc_v2 history tables. This
 * registry + refresher provides the mechanism now so those views can be
 * registered and refreshed on a schedule (or on demand after large mutations)
 * without rewiring startup. The registry is intentionally empty today — the
 * point of this milestone is the swappable mechanism, not specific views.
 */

export interface MaterializedView {
  /** Fully-qualified view name, e.g. `edc_v2.portfolio_rollup`. */
  name: string;
  /** Refresh concurrently (requires a unique index on the view). */
  concurrently?: boolean;
}

const registry = new Map<string, MaterializedView>();

export function registerMaterializedView(view: MaterializedView): void {
  registry.set(view.name, view);
}

export function listMaterializedViews(): MaterializedView[] {
  return [...registry.values()];
}

async function refreshOne(view: MaterializedView): Promise<void> {
  const mode = view.concurrently ? "CONCURRENTLY " : "";
  await db.execute(
    sql.raw(`REFRESH MATERIALIZED VIEW ${mode}${view.name}`),
  );
}

/** Refresh all registered materialized views. Never throws. */
export async function refreshMaterializedViews(): Promise<void> {
  const views = listMaterializedViews();
  if (views.length === 0) return;
  for (const view of views) {
    try {
      await refreshOne(view);
      logger.debug({ view: view.name }, "Refreshed materialized view");
    } catch (err) {
      logger.error({ err, view: view.name }, "Failed to refresh materialized view");
    }
  }
}
