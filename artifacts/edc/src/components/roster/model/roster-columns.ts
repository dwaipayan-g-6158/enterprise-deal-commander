// Column registry — the single source of truth for the table header order,
// widths, sortability, sort comparators, and CSV/JSON export values. Cell
// *rendering* lives in the table component (keyed by column id); this file is
// kept JSX-free so it stays node-testable and importable by the export hook.
import type { ColumnId, RosterRow } from "./roster-types";
import { VELOCITY_LABEL, VELOCITY_RANK } from "./velocity";

const HEALTH_RANK: Record<string, number> = { RED: 3, YELLOW: 2, GREEN: 1 };

export interface ColumnDef {
  id: ColumnId;
  label: string;
  align: "left" | "right" | "center";
  defaultWidth: number;
  sortable: boolean;
  /** Numeric columns right-align and use a monospace cell. */
  numeric?: boolean;
  /** Sort/group/filter value (also the default export value when no exportValue). */
  accessor: (row: RosterRow) => string | number | null;
  /** Custom comparator (asc). Falls back to accessor compare. */
  comparator?: (a: RosterRow, b: RosterRow) => number;
  /** Plain-text value for CSV/JSON export. */
  exportValue?: (row: RosterRow) => string;
}

function numCompare(a: number | null, b: number | null): number {
  const av = a ?? Number.NEGATIVE_INFINITY;
  const bv = b ?? Number.NEGATIVE_INFINITY;
  return av - bv;
}

function strCompare(a: string | null, b: string | null): number {
  return (a ?? "").localeCompare(b ?? "");
}

export const COLUMNS: Record<ColumnId, ColumnDef> = {
  dealName: {
    id: "dealName",
    label: "Deal",
    align: "left",
    defaultWidth: 220,
    sortable: true,
    accessor: (r) => r.dealName,
    comparator: (a, b) => strCompare(a.dealName, b.dealName),
  },
  accountName: {
    id: "accountName",
    label: "Account",
    align: "left",
    defaultWidth: 180,
    sortable: true,
    accessor: (r) => r.accountName,
    comparator: (a, b) => strCompare(a.accountName, b.accountName),
  },
  salesStage: {
    id: "salesStage",
    label: "Stage",
    align: "left",
    defaultWidth: 150,
    sortable: true,
    accessor: (r) => r.salesStage,
    // Stage order is meaningful; sort by pipeline position, not alphabetically.
    comparator: (a, b) => a.salesStageId - b.salesStageId,
  },
  calculatedTCV: {
    id: "calculatedTCV",
    label: "TCV",
    align: "right",
    defaultWidth: 130,
    sortable: true,
    numeric: true,
    accessor: (r) => r.calculatedTCV ?? 0,
    comparator: (a, b) => numCompare(a.calculatedTCV ?? 0, b.calculatedTCV ?? 0),
    exportValue: (r) => String(r.calculatedTCV ?? 0),
  },
  healthStatus: {
    id: "healthStatus",
    label: "Health",
    align: "left",
    defaultWidth: 110,
    sortable: true,
    accessor: (r) => r.healthStatus,
    comparator: (a, b) => (HEALTH_RANK[a.healthStatus] ?? 0) - (HEALTH_RANK[b.healthStatus] ?? 0),
  },
  riskLevel: {
    id: "riskLevel",
    label: "Risk",
    align: "right",
    defaultWidth: 110,
    sortable: true,
    numeric: true,
    accessor: (r) => r.riskScore,
    comparator: (a, b) => numCompare(a.riskScore, b.riskScore),
    exportValue: (r) => (r.riskScore == null ? "" : String(r.riskScore)),
  },
  score: {
    id: "score",
    label: "Score",
    align: "right",
    defaultWidth: 90,
    sortable: true,
    numeric: true,
    accessor: (r) => r.score,
    comparator: (a, b) => numCompare(a.score, b.score),
    exportValue: (r) => (r.score == null ? "" : String(r.score)),
  },
  gatesPct: {
    id: "gatesPct",
    label: "Gates",
    align: "left",
    defaultWidth: 130,
    sortable: true,
    accessor: (r) => r.gatesPct,
    comparator: (a, b) => numCompare(a.gatesPct, b.gatesPct),
    exportValue: (r) => `${r.gatesPct}%`,
  },
  velocity: {
    id: "velocity",
    label: "Velocity",
    align: "left",
    defaultWidth: 120,
    sortable: true,
    accessor: (r) => r.velocity,
    comparator: (a, b) => VELOCITY_RANK[a.velocity] - VELOCITY_RANK[b.velocity],
    exportValue: (r) => VELOCITY_LABEL[r.velocity],
  },
  lastActivity: {
    id: "lastActivity",
    label: "Last Activity",
    align: "right",
    defaultWidth: 120,
    sortable: true,
    numeric: true,
    accessor: (r) => r.daysSinceLastActivity,
    comparator: (a, b) => numCompare(a.daysSinceLastActivity, b.daysSinceLastActivity),
    exportValue: (r) => (r.daysSinceLastActivity == null ? "" : `${r.daysSinceLastActivity}d`),
  },
  accountManager: {
    id: "accountManager",
    label: "Account Mgr",
    align: "left",
    defaultWidth: 150,
    sortable: true,
    accessor: (r) => r.accountManager,
    comparator: (a, b) => strCompare(a.accountManager, b.accountManager),
  },
  technicalLead: {
    id: "technicalLead",
    label: "Tech Lead",
    align: "left",
    defaultWidth: 150,
    sortable: true,
    accessor: (r) => r.technicalLead,
    comparator: (a, b) => strCompare(a.technicalLead, b.technicalLead),
  },
  expectedCloseDate: {
    id: "expectedCloseDate",
    label: "Close",
    align: "right",
    defaultWidth: 110,
    sortable: true,
    accessor: (r) => r.expectedCloseDate ?? null,
    comparator: (a, b) => strCompare(a.expectedCloseDate ?? null, b.expectedCloseDate ?? null),
    exportValue: (r) => r.expectedCloseDate ?? "",
  },
};

/** Header order. Column visibility/reorder/width overrides are applied on top (Phase 3). */
export const COLUMN_ORDER: ColumnId[] = [
  "dealName",
  "accountName",
  "salesStage",
  "calculatedTCV",
  "healthStatus",
  "riskLevel",
  "score",
  "gatesPct",
  "velocity",
  "lastActivity",
  "expectedCloseDate",
  "accountManager",
  "technicalLead",
];

/** Columns shown by default (the rest are opt-in via the column customizer). */
export const DEFAULT_VISIBLE: ColumnId[] = [
  "dealName",
  "accountName",
  "salesStage",
  "calculatedTCV",
  "healthStatus",
  "riskLevel",
  "score",
  "gatesPct",
  "velocity",
  "expectedCloseDate",
];

export function getComparator(col: ColumnDef): (a: RosterRow, b: RosterRow) => number {
  if (col.comparator) return col.comparator;
  return (a, b) => {
    const av = col.accessor(a);
    const bv = col.accessor(b);
    if (typeof av === "number" || typeof bv === "number") {
      return numCompare(av as number | null, bv as number | null);
    }
    return strCompare(av as string | null, bv as string | null);
  };
}
