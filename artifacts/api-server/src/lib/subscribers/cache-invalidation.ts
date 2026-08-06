import { dealEvents } from "../events";
import { invalidateDeal } from "../cache";

/**
 * Invalidates cached, deal-derived data (intelligence + summaries) whenever a
 * deal mutates. This is what makes the cache abstraction "mutation-invalidated"
 * — reads stay fast while writes immediately drop stale entries. `health.changed`
 * is derived from another mutation that already invalidated, so it is skipped.
 *
 * This used to also drop the precomputed `edc_v2.portfolio_rollups` in lockstep.
 * That whole subsystem is gone — see lib/cache.ts's note and the Catalyst
 * migration section of .agents/memory/edc-phase2-backbone.md.
 */
export function registerCacheInvalidation(): () => void {
  return dealEvents.on((event) => {
    if (event.type === "health.changed") return;
    invalidateDeal(event.dealId);
  });
}
