// Presentational cell renderers, keyed by column id. Pure display — no data
// fetching, no state. Shared by the table (Phase 1+) and the card list.
import { Link } from "wouter";
import { Trophy, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { daysUntil } from "@/components/dashboard/widgets/_shared";
import { formatDate } from "@/lib/format";
import { formatCurrency } from "@/components/cockpit/use-invalidate";
import { RISK_LEVEL_CLASS, RISK_LEVEL_LABEL, type RiskLevel } from "@/components/cockpit/risk/risk-model";
import { HEALTH_BADGE_CLASS, HEALTH_SHORT_LABEL, OUTCOME_CLASS, OUTCOME_LABEL, type Outcome } from "@/lib/semantic-colors";
import { VELOCITY_LABEL } from "./model/velocity";
import { terminalOutcome } from "./model/board";
import { rowAccent } from "./model/row-accent";
import type { ColumnId, Health, RosterRow, VelocityBucket } from "./model/roster-types";

// `terminalOutcome` lives in the pure board model and `rowAccent` in the pure
// row-accent model; both re-exported here so the three row-rendering surfaces
// keep importing everything they need from one place.
export { terminalOutcome, rowAccent };

/**
 * Both status pills share this: one width, centred content, so the Status
 * column reads as a column instead of a ragged edge.
 *
 * 80px is sized to the widest label the slot can hold — "Attention" measures
 * 74.9px. It only works alongside HEALTH_SHORT_LABEL below: the long
 * "Needs Attention" is 114.5px, which would force every "Won" out to a block
 * 51px wider than its text. Re-measure before widening a label.
 */
const STATUS_PILL = "min-w-20 justify-center";

export function HealthBadge({ health }: { health: Health }) {
  return (
    <Badge
      variant={health === "RED" ? "destructive" : health === "YELLOW" ? "default" : "secondary"}
      className={cn(
        STATUS_PILL,
        health === "YELLOW" && HEALTH_BADGE_CLASS.YELLOW,
        health === "GREEN" && HEALTH_BADGE_CLASS.GREEN,
      )}
    >
      {/* Short form on purpose — see STATUS_PILL. The filter list keeps the long
          wording, where there is room for it. */}
      {HEALTH_SHORT_LABEL[health]}
    </Badge>
  );
}

// Deliberately built on the same <Badge> as HealthBadge rather than on
// TerminalStageBadge's hand-rolled span: it stands in the same column, so it
// has to match the health pill's geometry exactly (px-2.5 py-0.5 text-xs
// rounded-md, plus STATUS_PILL's width). Only the fill differs.
// TerminalStageBadge stays small because its remaining job is the board
// *column header*, a different slot.
export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const Icon = outcome === "won" ? Trophy : Ban;
  return (
    <Badge variant="default" className={cn(STATUS_PILL, "gap-1", OUTCOME_CLASS[outcome].badge)}>
      <Icon className="h-3 w-3" aria-hidden /> {OUTCOME_LABEL[outcome]}
    </Badge>
  );
}

/**
 * Health measures risk of *not closing*, which a decided deal no longer
 * carries — so a terminal stage shows its outcome in the slot a live deal uses
 * for health. One dispatch point, so the table, card list, preview and board
 * card can't drift apart.
 */
export function StatusBadge({ row }: { row: RosterRow }) {
  const outcome = terminalOutcome(row.salesStage);
  return outcome ? <OutcomeBadge outcome={outcome} /> : <HealthBadge health={row.healthStatus} />;
}

export function ScoreCell({ score, delta }: { score: number | null; delta?: number | null }) {
  if (score == null) return <span className="text-muted-foreground">—</span>;
  const tone =
    score >= 70 ? "text-emerald-600 dark:text-emerald-400" : score >= 40 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  const showTrend = delta != null && delta !== 0;
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className={cn("font-mono", tone)}>{score}</span>
      {showTrend && (
        <span
          className={cn("text-[10px]", delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}
          aria-label={`${delta > 0 ? "up" : "down"} ${Math.abs(delta)} vs last week`}
        >
          {delta > 0 ? "▲" : "▼"}
          {Math.abs(delta)}
        </span>
      )}
    </span>
  );
}

// Days since the deal's last meaningful activity. Ages amber past 2 weeks, red
// past a month — a stale-deal cue mirroring Vivun's "Last: N ago" column.
const LAST_ACTIVITY_WARN = 14;
const LAST_ACTIVITY_STALE = 30;
export function LastActivityCell({ days }: { days: number | null }) {
  if (days == null) return <span className="text-muted-foreground">—</span>;
  const tone =
    days >= LAST_ACTIVITY_STALE
      ? "text-red-600 dark:text-red-400 font-medium"
      : days >= LAST_ACTIVITY_WARN
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground";
  return <span className={cn("font-mono text-xs tabular-nums", tone)}>act. {days}d</span>;
}

/**
 * `decided` renders the same em-dash as missing data, and that is the honest
 * output: risk is computed at read time and never stored, so the number on a
 * closed deal is not the risk it carried at close — it is a fresh calculation
 * against today's dates (Temporal Pressure keys off daysToClose), and it drifts
 * for as long as the deal sits there. Showing nothing beats showing that.
 */
export function RiskCell({
  score,
  level,
  decided = false,
}: {
  score: number | null;
  level: RiskLevel | null;
  decided?: boolean;
}) {
  if (decided || score == null || !level) return <span className="text-muted-foreground">—</span>;
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

/**
 * The date stays — it is a real fact about the deal. Only the overdue tone is
 * suppressed when `decided`: `daysUntil < 0` is true of every past date, so a
 * deal that closed successfully in June was being painted like a crisis.
 */
export function CloseDateCell({ iso, decided = false }: { iso: string | null | undefined; decided?: boolean }) {
  const label = formatDate(iso);
  const overdue = !decided && (daysUntil(iso) ?? 1) < 0;
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
        className={cn(
          "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          OUTCOME_CLASS.won.bg,
          OUTCOME_CLASS.won.text,
        )}
      >
        <Trophy className="h-3 w-3" aria-hidden /> Won
      </span>
    );
  }
  return (
    <span
      title="Closed-Lost"
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        OUTCOME_CLASS.lost.bg,
        OUTCOME_CLASS.lost.text,
      )}
    >
      <Ban className="h-3 w-3" aria-hidden /> Lost
    </span>
  );
}

/** Dispatcher used by the table body. `select` and the deal-name link are handled by the row. */
export function RosterCellContent({ columnId, row }: { columnId: ColumnId; row: RosterRow }) {
  // Computed once per row: a decided deal keeps its facts (TCV, gates, dates)
  // and loses its live signals (health, risk, overdue urgency).
  const decided = terminalOutcome(row.salesStage) != null;
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
      return <StatusBadge row={row} />;
    case "riskLevel":
      return <RiskCell score={row.riskScore} level={row.riskLevel} decided={decided} />;
    case "score":
      return <ScoreCell score={row.score} delta={row.scoreDelta} />;
    case "gatesPct":
      return <GatesCell pct={row.gatesPct} />;
    case "velocity":
      return <VelocityCell bucket={row.velocity} delta={row.deltaDays} />;
    case "lastActivity":
      return <LastActivityCell days={row.daysSinceLastActivity} />;
    case "accountManager":
      return <span className="text-muted-foreground">{row.accountManager}</span>;
    case "technicalLead":
      return <span className="text-muted-foreground">{row.technicalLead}</span>;
    case "expectedCloseDate":
      return <CloseDateCell iso={row.expectedCloseDate} decided={decided} />;
    default:
      return null;
  }
}

