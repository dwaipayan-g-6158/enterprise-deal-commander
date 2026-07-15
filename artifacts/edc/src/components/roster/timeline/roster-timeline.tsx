import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { compactCurrency } from "@/components/dashboard/widgets/_shared";
import { BoardCard } from "../board/board-card";
import { buildTimeline } from "../model/timeline";
import type { RowActions } from "../row-context-menu";
import type { RosterRow } from "../model/roster-types";

// Read-only Timeline view: the same horizontal rail as the board, but columns
// are close-date months (Overdue first, "No close date" last) instead of stages.
// Cards are not draggable here — stage moves stay in the board.
export function RosterTimeline({
  rows,
  onCardClick,
  rowActions,
}: {
  rows: RosterRow[];
  onCardClick: (row: RosterRow) => void;
  rowActions: RowActions;
}) {
  const columns = useMemo(() => buildTimeline(rows, Date.now()), [rows]);

  const noop = () => {};

  if (columns.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No deals to place on the timeline.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-3">
        {columns.map((col) => (
          <div
            key={col.key}
            role="group"
            aria-label={`${col.label}, ${col.dealCount} deal${col.dealCount === 1 ? "" : "s"}, ${compactCurrency(col.totalTCV)}`}
            className={cn(
              "flex w-[300px] shrink-0 flex-col rounded-lg border bg-muted/20",
              col.kind === "overdue" && "border-red-500/40",
            )}
          >
            <div className="flex items-start justify-between gap-2 border-b px-3 py-2">
              <h3
                className={cn(
                  "text-sm font-semibold",
                  col.kind === "overdue" && "text-red-600 dark:text-red-400",
                  col.kind === "none" && "text-muted-foreground",
                )}
              >
                {col.label}
              </h3>
              <span className="shrink-0 text-right text-xs text-muted-foreground">
                <span className="font-mono font-medium text-foreground">{compactCurrency(col.totalTCV)}</span>
                <br />
                {col.dealCount} deal{col.dealCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-2 max-h-[calc(100vh-19rem)]">
              {col.rows.map((row) => (
                <BoardCard
                  key={row.id}
                  row={row}
                  readOnly
                  terminal={false}
                  moving={false}
                  onCardClick={onCardClick}
                  rowActions={rowActions}
                  onMoveStage={noop}
                  onDragStart={noop}
                  onDragEnd={noop}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
