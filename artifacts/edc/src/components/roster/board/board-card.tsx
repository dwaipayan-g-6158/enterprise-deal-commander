import { memo } from "react";
import { Link } from "wouter";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/components/cockpit/use-invalidate";
import {
  HealthBadge,
  RiskCell,
  ScoreCell,
  GatesCell,
  VelocityCell,
  CloseDateCell,
  LastActivityCell,
  TerminalStageBadge,
  HEALTH_BORDER,
  RISK_BORDER,
} from "../cells";
import { RowContextMenu, type RowActions } from "../row-context-menu";
import type { BoardStage } from "../model/board";
import type { Health, RosterRow } from "../model/roster-types";

export const DEAL_DND_MIME = "application/x-edc-deal";

// One deal on the board. Mirrors the mobile RosterCardList card, reusing the
// same cell renderers, but adds drag + click-to-preview + a stage-move context
// menu. Draggable only when the board is interactive and the deal isn't terminal
// or mid-move. Memoized because a board can hold a few hundred of these.
export const BoardCard = memo(function BoardCard({
  row,
  readOnly,
  terminal,
  moving,
  onCardClick,
  rowActions,
  moveStages,
  onMoveStage,
  onDragStart,
  onDragEnd,
}: {
  row: RosterRow;
  readOnly: boolean;
  terminal: boolean;
  moving: boolean;
  onCardClick: (row: RosterRow) => void;
  rowActions: RowActions;
  /** Non-terminal stages for the "Move to stage" submenu; omit to hide it. */
  moveStages?: BoardStage[];
  onMoveStage: (row: RosterRow, stage: BoardStage) => void;
  onDragStart: (dealId: string) => void;
  onDragEnd: () => void;
}) {
  const draggable = !readOnly && !terminal && !moving;

  const actions: RowActions = {
    ...rowActions,
    moveTo: moveStages
      ? { stages: moveStages, currentStageId: row.salesStageId, onMove: onMoveStage }
      : undefined,
  };

  return (
    <RowContextMenu row={row} actions={actions}>
      <div
        role="listitem"
        tabIndex={0}
        aria-label={`${row.dealName}, ${row.accountName}, ${formatCurrency(row.calculatedTCV ?? 0, row.dealCurrency)}, ${row.salesStage}`}
        draggable={draggable}
        onDragStart={(e) => {
          e.dataTransfer.setData(DEAL_DND_MIME, row.id);
          e.dataTransfer.effectAllowed = "move";
          onDragStart(row.id);
        }}
        onDragEnd={onDragEnd}
        onClick={() => onCardClick(row)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onCardClick(row);
          }
        }}
        className={cn(
          "rounded-lg border bg-card p-3 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
          moving && "opacity-60 pointer-events-none",
          row.riskLevel ? RISK_BORDER[row.riskLevel] : HEALTH_BORDER[row.healthStatus as Health],
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold leading-tight">{row.accountName}</span>
          <HealthBadge health={row.healthStatus} />
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <Link
            href={`/deals/${row.id}`}
            className="text-xs text-muted-foreground hover:underline focus-visible:outline-none focus-visible:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.dealName}
          </Link>
          <TerminalStageBadge stage={row.salesStage} />
          {row.committed && (
            <span
              title="Committed"
              className="inline-flex items-center gap-0.5 rounded-sm bg-emerald-500/15 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400"
            >
              <Check className="h-3 w-3" aria-hidden /> Committed
            </span>
          )}
        </div>
        <p className="mt-1.5 font-mono text-lg font-bold tabular-nums">
          {formatCurrency(row.calculatedTCV ?? 0, row.dealCurrency)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            Risk <RiskCell score={row.riskScore} level={row.riskLevel} />
          </span>
          <span className="inline-flex items-center gap-1">
            Score <ScoreCell score={row.score} delta={row.scoreDelta} />
          </span>
          <GatesCell pct={row.gatesPct} />
          <VelocityCell bucket={row.velocity} delta={row.deltaDays} />
          {row.daysInStage != null && <span className="tabular-nums">{row.daysInStage}d in stage</span>}
          <LastActivityCell days={row.daysSinceLastActivity} />
          <span className="inline-flex items-center gap-1">
            Close <CloseDateCell iso={row.expectedCloseDate} />
          </span>
        </div>
      </div>
    </RowContextMenu>
  );
});
