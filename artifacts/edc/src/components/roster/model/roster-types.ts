// Deal Roster — shared type model. Pure types only (no React/JSX) so the
// headless layer (url codec, velocity, derived-rows) stays node-testable.
import type { Deal } from "@workspace/api-client-react";
import type { RiskLevel } from "@/components/cockpit/risk/risk-model";

export type { Deal };

export type Health = "GREEN" | "YELLOW" | "RED";
export type DealState = "active" | "archived" | "deleted";
export type Density = "comfortable" | "compact" | "ultra";

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
  gatesPct: number;
  daysInStage: number;
  benchmarkDays: number;
  deltaDays: number;
  velocityStatus: "FAST" | "NORMAL" | "SLOW";
  riskScore?: number | null;
  riskLevel?: RiskLevel | null;
}

/** A deal merged with its enrichment + the client-derived velocity bucket. */
export interface RosterRow extends Deal {
  score: number | null;
  gatesPct: number;
  daysInStage: number | null;
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
  stage: string[];
  health: Health[];
  velocity: VelocityBucket[];
  // "More filters"
  tcvMin: number | null;
  tcvMax: number | null;
  scoreMin: number | null;
  scoreMax: number | null;
  closePreset: CloseDatePreset;
  accountManager: string[];
  technicalLead: string[];
  tags: string[];
  hasBlockers: boolean | null;
  hasCompetitors: boolean | null;
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
  stage: [],
  health: [],
  velocity: [],
  tcvMin: null,
  tcvMax: null,
  scoreMin: null,
  scoreMax: null,
  closePreset: "any",
  accountManager: [],
  technicalLead: [],
  tags: [],
  hasBlockers: null,
  hasCompetitors: null,
};

export const DEFAULT_SORT: SortSpec[] = [{ key: "calculatedTCV", dir: "desc" }];

export const DEFAULT_VIEW: RosterView = {
  filters: DEFAULT_FILTERS,
  sort: DEFAULT_SORT,
  group: "none",
};
