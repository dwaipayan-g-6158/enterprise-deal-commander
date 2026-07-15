// Pure board model for the Kanban view. No React/JSX so it stays node-testable,
// mirroring the derive-rows split. Turns the flat, already-filtered+sorted
// RosterRow[] into per-stage columns with At-Risk / On-Track sections and
// value/count rollups, and carries the small helpers the drag layer needs.
import type { PipelineStage } from "@workspace/api-client-react";
import type { RosterRow } from "./roster-types";

// A deal's sales stage can be terminal (the deal is decided) while its lifecycle
// state is still "active". Detected by name — the pipeline_stages lookup has no
// terminal flag. Relocated here from cells.tsx (which now re-exports it) so the
// board model and the table badge share one source of truth.
export function terminalOutcome(stage: string | null | undefined): "won" | "lost" | null {
  if (!stage) return null;
  const s = stage.toLowerCase();
  if (/closed.?won/.test(s)) return "won";
  if (/closed.?lost/.test(s)) return "lost";
  return null;
}

export interface BoardStage {
  id: number;
  name: string;
  sortOrder: number;
  /** "won" | "lost" for terminal columns (view-only in v1), null otherwise. */
  terminal: "won" | "lost" | null;
}

/** How a column's cards are banded into sections (Vivun's GROUP BY analog). */
export type BandBy = "none" | "risk" | "health" | "committed";

export interface BoardSection {
  key: string;
  /** null → render without a header (single-band columns). */
  label: string | null;
  rows: RosterRow[];
}

export interface BoardColumn {
  stage: BoardStage;
  /** Ordered, non-empty bands of the column's deals. */
  sections: BoardSection[];
  dealCount: number;
  /** Sum of normalizedTCV across the column (cross-currency comparable). */
  totalTCV: number;
}

/**
 * At-risk predicate for the risk band. The enrichment `riskLevel` is the source
 * of truth (HIGH is the top band per classifyRisk). When enrichment hasn't
 * landed yet, fall back to the legacy 3-state health (RED ⇒ HIGH), the same
 * convention healthToRiskLevel encodes.
 */
export function isAtRisk(row: RosterRow): boolean {
  return row.riskLevel === "HIGH" || (row.riskLevel == null && row.healthStatus === "RED");
}

interface BandDef {
  key: string;
  label: string;
  match: (row: RosterRow) => boolean;
}

// Ordered band definitions per mode. Rows are assigned to the first matching
// band, so the trailing catch-all bands ("On Track"/"The Rest") absorb the rest.
function bandsFor(bandBy: BandBy): BandDef[] {
  switch (bandBy) {
    case "risk":
      return [
        { key: "atRisk", label: "At Risk", match: isAtRisk },
        { key: "onTrack", label: "On Track", match: () => true },
      ];
    case "health":
      return [
        { key: "red", label: "Red", match: (r) => r.healthStatus === "RED" },
        { key: "yellow", label: "Yellow", match: (r) => r.healthStatus === "YELLOW" },
        { key: "green", label: "Green", match: () => true },
      ];
    case "committed":
      return [
        { key: "committed", label: "Committed", match: (r) => r.committed === true },
        { key: "rest", label: "The Rest", match: () => true },
      ];
    case "none":
    default:
      return [{ key: "all", label: "", match: () => true }];
  }
}

export function toBoardStage(stage: PipelineStage): BoardStage {
  return {
    id: stage.id,
    name: stage.stageName,
    sortOrder: stage.sortOrder,
    terminal: terminalOutcome(stage.stageName),
  };
}

/**
 * Group the flat, pre-filtered/sorted rows into one column per pipeline stage,
 * each split into bands per `bandBy`. Every stage yields a column (empty ones
 * included), ordered by sortOrder. Empty bands are dropped; a column with a
 * single remaining band renders it header-less. Rows keep their incoming order
 * within each band (the active roster sort). Rows whose salesStageId isn't in
 * the lookup are dropped defensively.
 */
export function buildBoard(rows: RosterRow[], stages: PipelineStage[], bandBy: BandBy = "risk"): BoardColumn[] {
  const ordered = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);
  const bands = bandsFor(bandBy);
  const columns = new Map<number, { stage: BoardStage; buckets: RosterRow[][]; dealCount: number; totalTCV: number }>();
  for (const s of ordered) {
    columns.set(s.id, { stage: toBoardStage(s), buckets: bands.map(() => []), dealCount: 0, totalTCV: 0 });
  }
  for (const row of rows) {
    const col = columns.get(row.salesStageId);
    if (!col) continue; // unknown stage — defensive
    let idx = bands.findIndex((b) => b.match(row));
    if (idx < 0) idx = bands.length - 1;
    col.buckets[idx].push(row);
    col.dealCount += 1;
    col.totalTCV += row.normalizedTCV ?? 0;
  }
  return ordered.map((s) => {
    const col = columns.get(s.id)!;
    const sections: BoardSection[] = bands
      .map((b, i) => ({ key: b.key, label: b.label || null, rows: col.buckets[i] }))
      .filter((sec) => sec.rows.length > 0);
    // A single remaining band needs no header.
    if (sections.length === 1) sections[0] = { ...sections[0], label: null };
    return { stage: col.stage, sections, dealCount: col.dealCount, totalTCV: col.totalTCV };
  });
}

export type MoveIntent = "same" | "forward" | "backward";

export function moveIntent(fromSortOrder: number, toSortOrder: number): MoveIntent {
  if (fromSortOrder === toSortOrder) return "same";
  return toSortOrder > fromSortOrder ? "forward" : "backward";
}

export interface GuardrailInfo {
  message: string;
  patternCodes: string[];
}

/**
 * Recognize the server's 409 STAGE_GUARDRAIL response (ApiError shape:
 * `{ status, data: { error: { code, message, patternCodes } } }`). Returns the
 * guardrail payload to drive the override dialog, or null for any other error.
 */
export function extractGuardrail(err: unknown): GuardrailInfo | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { status?: number; data?: { error?: { code?: string; message?: string; patternCodes?: string[] } } };
  if (e.status !== 409) return null;
  const apiErr = e.data?.error;
  if (!apiErr) return null;
  const isGuardrail = apiErr.code === "STAGE_GUARDRAIL" || (apiErr.patternCodes?.length ?? 0) > 0;
  if (!isGuardrail) return null;
  return {
    message: apiErr.message ?? "Stage advancement is blocked by active risk patterns.",
    patternCodes: apiErr.patternCodes ?? [],
  };
}
