import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { compactCurrency } from "@/components/dashboard/widgets/_shared";
import { TerminalStageBadge } from "../cells";
import { BoardCard, DEAL_DND_MIME } from "./board-card";
import type { BoardColumn as BoardColumnData, BoardStage } from "../model/board";
import type { RowActions } from "../row-context-menu";
import type { RosterRow } from "../model/roster-types";

function SectionCards({
  label,
  rows,
  render,
}: {
  label: string | null;
  rows: RosterRow[];
  render: (row: RosterRow) => React.ReactNode;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2">
      {label && (
        <div className="sticky top-0 z-[1] bg-muted/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
          {label} ({rows.length})
        </div>
      )}
      {rows.map(render)}
    </div>
  );
}

// One stage column: a value/count rollup header, then an At-Risk band above an
// On-Track band. Dropping onto a terminal column (Closed-Won/Lost) opens the
// close-out dialog instead of a plain move.
export function BoardColumn({
  column,
  readOnly,
  dragActive,
  movingIds,
  onCardClick,
  rowActions,
  moveStages,
  onMoveStage,
  onDragStart,
  onDragEnd,
  onDropDeal,
  onTerminalDrop,
}: {
  column: BoardColumnData;
  readOnly: boolean;
  dragActive: boolean;
  movingIds: Set<string>;
  onCardClick: (row: RosterRow) => void;
  rowActions: RowActions;
  moveStages?: BoardStage[];
  onMoveStage: (row: RosterRow, stage: BoardStage) => void;
  onDragStart: (dealId: string) => void;
  onDragEnd: () => void;
  onDropDeal: (dealId: string, stage: BoardStage) => void;
  onTerminalDrop: (dealId: string) => void;
}) {
  const { stage, sections, dealCount, totalTCV } = column;
  const terminal = stage.terminal !== null;
  const droppable = !terminal && !readOnly; // plain move target
  const closable = terminal && !readOnly; // close-out target (won/lost)
  const [isOver, setIsOver] = useState(false);
  const depth = useRef(0);

  // Both move targets and close targets accept a drop; only a read-only column
  // (archived/deleted state) accepts nothing.
  const acceptsDrop = droppable || closable;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    depth.current = 0;
    setIsOver(false);
    const dealId = e.dataTransfer.getData(DEAL_DND_MIME);
    if (!dealId) return;
    if (closable) onTerminalDrop(dealId);
    else if (droppable) onDropDeal(dealId, stage);
  };

  const renderCard = (row: RosterRow) => (
    <BoardCard
      key={row.id}
      row={row}
      readOnly={readOnly}
      terminal={terminal}
      moving={movingIds.has(row.id)}
      onCardClick={onCardClick}
      rowActions={rowActions}
      moveStages={terminal || readOnly ? undefined : moveStages}
      onMoveStage={onMoveStage}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    />
  );

  return (
    <div
      role="group"
      aria-label={`${stage.name}, ${dealCount} deal${dealCount === 1 ? "" : "s"}, ${compactCurrency(totalTCV)}`}
      onDragEnter={
        acceptsDrop
          ? (e) => {
              e.preventDefault();
              depth.current += 1;
              setIsOver(true);
            }
          : undefined
      }
      onDragOver={
        acceptsDrop
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }
          : undefined
      }
      onDragLeave={
        acceptsDrop
          ? () => {
              depth.current -= 1;
              if (depth.current <= 0) {
                depth.current = 0;
                setIsOver(false);
              }
            }
          : undefined
      }
      onDrop={acceptsDrop ? handleDrop : undefined}
      className={cn(
        "flex w-[300px] shrink-0 flex-col rounded-lg border bg-muted/20 transition-opacity",
        isOver && droppable && "ring-2 ring-primary",
        isOver && closable && stage.terminal === "won" && "ring-2 ring-emerald-500/70",
        isOver && closable && stage.terminal === "lost" && "ring-2 ring-rose-500/70",
        terminal && "bg-muted/40",
        // Read-only terminal columns can't receive a close — fade while dragging.
        terminal && !closable && dragActive && !isOver && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold">{stage.name}</h3>
          <TerminalStageBadge stage={stage.name} />
        </div>
        <span className="shrink-0 text-right text-xs text-muted-foreground">
          <span className="font-mono font-medium text-foreground">{compactCurrency(totalTCV)}</span>
          <br />
          {dealCount} deal{dealCount === 1 ? "" : "s"}
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-2 max-h-[calc(100vh-19rem)]">
        {dealCount === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
            {isOver && closable ? "Drop to close" : isOver && droppable ? "Drop to move here" : "All clear"}
          </div>
        ) : (
          sections.map((section) => (
            <SectionCards key={section.key} label={section.label} rows={section.rows} render={renderCard} />
          ))
        )}
      </div>
    </div>
  );
}
