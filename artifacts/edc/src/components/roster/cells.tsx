// Presentational cell renderers, keyed by column id. Pure display — no data
// fetching, no state. Shared by the table (Phase 1+) and the card list.
import { Link } from "wouter";
import { Trophy, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { shortDate, daysUntil } from "@/components/dashboard/widgets/_shared";
import { formatCurrency } from "@/components/cockpit/use-invalidate";
import { RISK_LEVEL_CLASS, RISK_LEVEL_LABEL, type RiskLevel } from "@/components/cockpit/risk/risk-model";
import { VELOCITY_LABEL } from "./model/velocity";
import { terminalOutcome } from "./model/board";
import type { ColumnId, Health, RosterRow, VelocityBucket } from "./model/roster-types";

// `terminalOutcome` moved to the pure board model; re-exported here so existing
// importers (and the table badge below) keep their import path.
export { terminalOutcome };

export function HealthBadge({ health }: { health: string }) {
  return (
    <Badge
      variant={health === "RED" ? "destructive" : health === "YELLOW" ? "default" : "secondary"}
      className={cn(
        health === "YELLOW" && "bg-amber-500 hover:bg-amber-600 text-white",
        health === "GREEN" && "bg-emerald-500 hover:bg-emerald-600 text-white",
      )}
    >
      {health}
    </Badge>
  );
}

export function ScoreCell({ score }: { score: number | null }) {
  if (score == null) return <span className="text-muted-foreground">—</span>;
  const tone =
    score >= 70 ? "text-emerald-600 dark:text-emerald-400" : score >= 40 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  return <span className={cn("font-mono", tone)}>{score}</span>;
}

export function RiskCell({ score, level }: { score: number | null; level: RiskLevel | null }) {
  if (score == null || !level) return <span className="text-muted-foreground">—</span>;
  const c = RISK_LEVEL_CLASS[level];
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`Risk ${score}, ${RISK_LEVEL_LABEL[level]}`}>
      <span className={cn("font-mono font-semibold tabular-nums", c.text)}>{score}</span>
      <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} aria-hidden />
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{level}</span>
    </span>
  );
}

export function GatesCell({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-muted-foreground tabular-nums">{pct}%</span>
    </div>
  );
}

const VELOCITY_TONE: Record<VelocityBucket, string> = {
  STALLED: "text-red-600 dark:text-red-400 font-medium",
  SLOW: "text-amber-600 dark:text-amber-400",
  NORMAL: "text-muted-foreground",
  FAST: "text-emerald-600 dark:text-emerald-400",
  NO_DATE: "text-muted-foreground",
};

export function VelocityCell({ bucket, delta }: { bucket: VelocityBucket; delta: number | null }) {
  if (bucket === "NO_DATE") return <span className="text-muted-foreground">—</span>;
  const showDelta = delta != null && delta !== 0 && (bucket === "SLOW" || bucket === "STALLED" || bucket === "FAST");
  return (
    <span className={cn("inline-flex items-center gap-1", VELOCITY_TONE[bucket])}>
      {VELOCITY_LABEL[bucket]}
      {showDelta && <span className="font-mono text-xs tabular-nums">{delta > 0 ? `+${delta}d` : `${delta}d`}</span>}
    </span>
  );
}

export function TcvCell({ row }: { row: RosterRow }) {
  return <span className="font-mono tabular-nums">{formatCurrency(row.calculatedTCV ?? 0, row.dealCurrency)}</span>;
}

export function CloseDateCell({ iso }: { iso: string | null | undefined }) {
  const label = shortDate(iso);
  const overdue = (daysUntil(iso) ?? 1) < 0;
  return <span className={cn("font-mono text-xs tabular-nums", overdue ? "text-red-500" : "text-muted-foreground")}>{label ?? "—"}</span>;
}

const MATCH_LABEL: Record<string, string> = {
  notes: "Strategic Notes",
  stakeholder: "Stakeholder",
  decision: "Decision",
  blocker: "Blocker",
};

// When a search matched a deal somewhere other than its visible name/account
// (e.g. a stakeholder or a strategic note), surface where — otherwise the row's
// presence looks unexplained.
function MatchedInHint({ sources }: { sources?: string[] }) {
  if (!sources?.length) return null;
  const extra = sources.filter((s) => s !== "name").map((s) => MATCH_LABEL[s]).filter(Boolean);
  if (extra.length === 0) return null;
  return <span className="text-[10px] leading-tight text-muted-foreground">Found in {extra.join(", ")}</span>;
}

// A deal's sales stage can be terminal (the deal is decided) while its lifecycle
// state is still "active" (it hasn't been archived/deleted). Surface that outcome
// as a badge so Won / Lost deals are scannable without reading the Stage column.
export function TerminalStageBadge({ stage }: { stage: string | null | undefined }) {
  const outcome = terminalOutcome(stage);
  if (!outcome) return null;
  if (outcome === "won") {
    return (
      <span
        title="Closed-Won"
        className="inline-flex items-center gap-1 rounded-sm bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400"
      >
        <Trophy className="h-3 w-3" aria-hidden /> Won
      </span>
    );
  }
  return (
    <span
      title="Closed-Lost"
      className="inline-flex items-center gap-1 rounded-sm bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-400"
    >
      <Ban className="h-3 w-3" aria-hidden /> Lost
    </span>
  );
}

/** Dispatcher used by the table body. `select` and the deal-name link are handled by the row. */
export function RosterCellContent({ columnId, row }: { columnId: ColumnId; row: RosterRow }) {
  switch (columnId) {
    case "dealName":
      return (
        <div className="flex flex-col">
          <span className="flex items-center gap-1.5">
            <Link
              href={`/deals/${row.id}`}
              className="font-medium hover:underline focus-visible:outline-none focus-visible:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {row.dealName}
            </Link>
            <TerminalStageBadge stage={row.salesStage} />
          </span>
          <MatchedInHint sources={row.matchedIn} />
        </div>
      );
    case "accountName":
      return <span>{row.accountName}</span>;
    case "salesStage":
      return <span className="text-muted-foreground">{row.salesStage}</span>;
    case "calculatedTCV":
      return <TcvCell row={row} />;
    case "healthStatus":
      return <HealthBadge health={row.healthStatus} />;
    case "riskLevel":
      return <RiskCell score={row.riskScore} level={row.riskLevel} />;
    case "score":
      return <ScoreCell score={row.score} />;
    case "gatesPct":
      return <GatesCell pct={row.gatesPct} />;
    case "velocity":
      return <VelocityCell bucket={row.velocity} delta={row.deltaDays} />;
    case "accountManager":
      return <span className="text-muted-foreground">{row.accountManager}</span>;
    case "technicalLead":
      return <span className="text-muted-foreground">{row.technicalLead}</span>;
    case "expectedCloseDate":
      return <CloseDateCell iso={row.expectedCloseDate} />;
    default:
      return null;
  }
}

export const HEALTH_BORDER: Record<Health, string> = {
  RED: "border-l-2 border-l-red-500",
  YELLOW: "border-l-2 border-l-amber-500",
  GREEN: "",
};

export const RISK_BORDER: Record<RiskLevel, string> = {
  HIGH: "border-l-2 border-l-red-500",
  ELEVATED: "border-l-2 border-l-orange-500",
  MODERATE: "border-l-2 border-l-amber-500",
  LOW: "",
};
