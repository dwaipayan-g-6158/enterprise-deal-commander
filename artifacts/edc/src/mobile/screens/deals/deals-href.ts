// Relative imports: node-tested through a vitest config with no alias resolution.
import { encodeRosterUrl } from "../../../components/roster/model/roster-url";
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  type GroupBy,
  type RosterFilters,
  type RosterView,
  type SortSpec,
} from "../../../components/roster/model/roster-types";

/**
 * A link into the Deals tab, filtered.
 *
 * ## This is what replaced eight drill-down dialogs
 *
 * The desktop dashboard answers "which deals is that number about?" with a
 * modal per figure — eight of them, each a bespoke list with its own empty
 * state. On a phone the answer already exists and is better: the Deals tab, with
 * the filter applied and the URL saying so. It is shareable, the back gesture
 * undoes it, and it is the same list the reader already knows how to work.
 *
 * ## Built through the codec, never by hand
 *
 * `encodeRosterUrl` is the same function `decodeRosterUrl` is tested against, so
 * a link built here is a link the Deals screen can definitely parse. Hand-writing
 * `?health=RED` would have been shorter and would have silently produced an
 * unfiltered list — the key is `h`, and a key the decoder does not recognise is
 * dropped without complaint.
 */
export function dealsHref(
  filters: Partial<RosterFilters> = {},
  view: { sort?: SortSpec[]; group?: GroupBy } = {},
): string {
  const full: RosterView = {
    filters: { ...DEFAULT_FILTERS, ...filters },
    sort: view.sort ?? DEFAULT_SORT,
    group: view.group ?? "none",
  };
  const query = encodeRosterUrl(full);
  return query ? `/deals?${query}` : "/deals";
}

/**
 * Filter dimensions narrowing the list, counted as dimensions rather than as
 * values — three selected stages is one decision, not three. The badge on the
 * Filter button reads this.
 *
 * The two range pairs count once each for the same reason: a reader who set both
 * a minimum and a maximum TCV made one choice about size.
 *
 * Search is deliberately excluded. It has its own visible field in the dock, and
 * a badge counting something the reader can already read is noise.
 */
export function countActiveFilters(f: RosterFilters): number {
  let n = 0;
  if (f.stage.length) n++;
  if (f.health.length) n++;
  if (f.velocity.length) n++;
  if (f.accountManager.length) n++;
  if (f.technicalLead.length) n++;
  if (f.tags.length) n++;
  if (f.tcvMin != null || f.tcvMax != null) n++;
  if (f.scoreMin != null || f.scoreMax != null) n++;
  if (f.closePreset !== "any") n++;
  if (f.hasCompetitors != null) n++;
  if (f.committed != null) n++;
  if (f.closure !== "open") n++;
  if (f.state !== "active") n++;
  return n;
}

/** The four figures on the Command Center that have a filtered list behind them. */
export const DEALS_LINKS = {
  /** Deals the engine has flagged red. */
  red: () => dealsHref({ health: ["RED"] }),
  /** Deals that have stopped moving against their stage benchmark. */
  stalled: () => dealsHref({ velocity: ["STALLED", "SLOW"] }, { sort: [{ key: "velocity", dir: "desc" }] }),
  /** Deals due inside thirty days, soonest first. */
  closingSoon: () =>
    dealsHref({ closePreset: "30d" }, { sort: [{ key: "expectedCloseDate", dir: "asc" }] }),
  /** The whole open pipeline, biggest first. */
  all: () => dealsHref(),
} as const;
