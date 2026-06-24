import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Materialized-view refresh registry for Phase 2 analytics.
 *
 * Views (true Postgres materialized views) or JS-backed maintained rollup
 * tables register here and are refreshed on a schedule by the periodic job (or
 * on demand after large mutations) without rewiring startup. The portfolio
 * rollups (`edc_v2.portfolio_rollups`) register a custom `refresh` because
 * their values come from the in-process intelligence engine, not SQL.
 */

export interface MaterializedView {
  /** Fully-qualified view name, e.g. `edc_v2.portfolio_rollup`. */
  name: string;
  /** Refresh concurrently (requires a unique index on the view). */
  concurrently?: boolean;
  /**
   * Custom refresh implementation. When provided it is used instead of the SQL
   * `REFRESH MATERIALIZED VIEW` statement — this lets JS-backed maintained
   * rollup tables (whose values come from the in-process intelligence engine,
   * not SQL) register alongside true Postgres materialized views.
   */
  refresh?: () => Promise<void>;
}

const registry = new Map<string, MaterializedView>();

export function registerMaterializedView(view: MaterializedView): void {
  registry.set(view.name, view);
}

export function listMaterializedViews(): MaterializedView[] {
  return [...registry.values()];
}

async function refreshOne(view: MaterializedView): Promise<void> {
  if (view.refresh) {
    await view.refresh();
    return;
  }
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
