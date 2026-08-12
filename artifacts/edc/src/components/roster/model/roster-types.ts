// Deal Roster — shared type model. Pure types only (no React/JSX) so the
// headless layer (url codec, velocity, derived-rows) stays node-testable.
import type { Deal } from "@workspace/api-client-react";
import type { RiskLevel } from "@/components/cockpit/risk/risk-model";
// Re-exported rather than re-declared: HEALTH_LABEL/HEALTH_CLASS are keyed by
// this union, so a local copy of it could drift from the maps it indexes.
// Relative path because this model layer is node-tested through a vitest config
// with no alias resolution (same reason _shared.tsx imports it this way).
import type { Health } from "../../../lib/semantic-colors";

export type { Deal, Health };

export type DealState = "active" | "archived" | "deleted";
/** Whether a deal's *pipeline stage* is terminal (Closed-Won/Closed-Lost), independent
 * of `DealState` (archived/deleted). "open" (default) hides terminal-stage deals from
 * the roster; "closed" shows only them; "all" applies no closure filter. */
export type DealClosure = "open" | "closed" | "all";
export type Density = "comfortable" | "compact" | "ultra";
/** Desktop (lg+) roster presentation: classic table, Kanban board, or timeline. */
export type ViewMode = "table" | "board" | "timeline";

/**
 * Client-derived velocity bucket. The backend only emits FAST/NORMAL/SLOW
 * (SLOW = daysInStage > benchmark*1.5); we escalate to STALLED past
 * benchmark*2 and add NO_DATE when there is no benchmark signal. See velocity.ts.
 */
export type VelocityBucket = "FAST" | "NORMAL" | "SLOW" | "STALLED" | "NO_DATE";

/** Raw per-deal enrichment from GET /v2/analytics/roster. */
export interface RosterEnrichment {
  id: string;
  dealName: string;
  score: number | null;
  /** Predictive-score change vs ~7 days ago; null when there's no baseline. */
  scoreDelta?: number | null;
  gatesPct: number;
  daysInStage: number;
  /** Days since the newest meaningful activity-log entry; null if none. */
  daysSinceLastActivity?: number | null;
  /**
   * Null when the deal's stage has no usable benchmark: it's closed (no
   * pipeline motion left to benchmark), it's the only open deal in its stage,
   * or the median across the others is 0 days. Mirrors `benchmarkDays` on
   * GET /v2/analytics/velocity — both now come from the same
   * `computeVelocityRows` helper, so the two endpoints can't disagree about
   * the same deal. `deriveVelocityBucket` maps this case to NO_DATE ("—").
   */
  benchmarkDays: number | null;
  deltaDays: number | null;
  velocityStatus: "FAST" | "NORMAL" | "SLOW" | "INSUFFICIENT_DATA";
  riskScore?: number | null;
  riskLevel?: RiskLevel | null;
}

/** A deal merged with its enrichment + the client-derived velocity bucket. */
export interface RosterRow extends Deal {
  score: number | null;
  scoreDelta: number | null;
  gatesPct: number;
  daysInStage: number | null;
  daysSinceLastActivity: number | null;
  benchmarkDays: number | null;
  deltaDays: number | null;
  riskScore: number | null;
  riskLevel: RiskLevel | null;
  velocity: VelocityBucket;
  /** From the Phase 6 backend search extension: where the term matched. */
  matchedIn?: string[];
}

/** Columns that can be shown/hidden/reordered. `select` is fixed (not in registry). */
export type ColumnId =
  | "dealName"
  | "accountName"
  | "salesStage"
  | "calculatedTCV"
  | "healthStatus"
  | "riskLevel"
  | "score"
  | "gatesPct"
  | "velocity"
  | "lastActivity"
  | "accountManager"
  | "technicalLead"
  | "expectedCloseDate";

export type GroupBy = "none" | "salesStage" | "healthStatus" | "accountManager";

export type CloseDatePreset = "any" | "overdue" | "30d" | "60d" | "90d" | "quarter";

export interface SortSpec {
  key: ColumnId;
  dir: "asc" | "desc";
}

/** Everything that defines *which* rows show and in what order. Shareable via URL. */
export interface RosterFilters {
  search: string;
  state: DealState;
  closure: DealClosure;
  stage: string[];
  health: Health[];
  velocity: VelocityBucket[];
  /**
   * Keep only deals that have sat in their stage longer than this many days.
   *
   * Deliberately separate from `velocity`. The velocity buckets are *relative* —
   * they compare a deal against the median of its stage peers — so a deal with
   * no peers has no benchmark, buckets to NO_DATE, and drops out of every
   * velocity filter. The dashboard's "Stalled" figure is *absolute*
   * (`daysInStage > stale_stage_days`), so counting with one and filtering with
   * the other produced a tile reading 2 above a list reading 0. This dimension
   * is the absolute rule, expressed so a link can carry it.
   */
  staleMinDays: number | null;
  // "More filters"
  tcvMin: number | null;
  tcvMax: number | null;
  scoreMin: number | null;
  scoreMax: number | null;
  closePreset: CloseDatePreset;
  accountManager: string[];
  technicalLead: string[];
  tags: string[];
  hasCompetitors: boolean | null;
  committed: boolean | null;
}

export interface RosterView {
  filters: RosterFilters;
  sort: SortSpec[];
  group: GroupBy;
}

/** A named, persisted view (built-in defaults + user custom). */
export interface SavedView {
  id: string;
  name: string;
  builtIn?: boolean;
  view: RosterView;
  /** Optional per-view visible-column set; falls back to the global column layout. */
  columns?: ColumnId[];
}

/** Column layout persisted in localStorage. */
export interface ColumnLayout {
  visible: ColumnId[];
  order: ColumnId[];
  width: Partial<Record<ColumnId, number>>;
}

export const DEFAULT_FILTERS: RosterFilters = {
  search: "",
  state: "active",
  closure: "open",
  stage: [],
  health: [],
  velocity: [],
  staleMinDays: null,
  tcvMin: null,
  tcvMax: null,
  scoreMin: null,
  scoreMax: null,
  closePreset: "any",
  accountManager: [],
  technicalLead: [],
  tags: [],
  hasCompetitors: null,
  committed: null,
};

/**
 * Fallback for the `stale_stage_days` engine threshold, mirroring the server's
 * own default in `computeSummary`.
 *
 * Only a fallback. Anywhere the live threshold is reachable — the Command
 * screen reads it off the intelligence summary — that value wins, so a team who
 * has retuned the threshold in Settings gets a list that still matches the
 * figure they clicked. This exists for the static built-in view, which has no
 * query to read.
 */
export const DEFAULT_STALE_STAGE_DAYS = 21;

export const DEFAULT_SORT: SortSpec[] = [{ key: "calculatedTCV", dir: "desc" }];

export const DEFAULT_VIEW: RosterView = {
  filters: DEFAULT_FILTERS,
  sort: DEFAULT_SORT,
  group: "none",
};
