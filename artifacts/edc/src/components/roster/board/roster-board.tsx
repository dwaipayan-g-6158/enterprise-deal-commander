import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import type { PipelineStage } from "@workspace/api-client-react";
import { buildBoard, type BoardStage } from "../model/board";
import type { RowActions } from "../row-context-menu";
import type { RosterRow } from "../model/roster-types";
import { BoardColumn } from "./board-column";
import type { StageMoveApi } from "./use-stage-move";

// The Kanban board: a horizontally scrollable rail of stage columns over the
// already-filtered/sorted rows. All intelligence lives on the cards; moving a
// card between columns changes the deal's stage through the shared move API.
export function RosterBoard({
  rows,
  stages,
  readOnly,
  stageFilter,
  onCardClick,
  rowActions,
  moveApi,
}: {
  rows: RosterRow[];
  stages: PipelineStage[];
  readOnly: boolean;
  /** filters.stage — stage names; when non-empty, only these columns render. */
  stageFilter: string[];
  onCardClick: (row: RosterRow) => void;
  rowActions: RowActions;
  moveApi: StageMoveApi;
}) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [dragActive, setDragActive] = useState(false);

  const columns = useMemo(() => {
    const all = buildBoard(rows, stages);
    if (stageFilter.length === 0) return all;
    const allow = new Set(stageFilter);
    return all.filter((c) => allow.has(c.stage.name));
  }, [rows, stages, stageFilter]);

  // Non-terminal stages power the "Move to stage" context submenu.
  const moveStages = useMemo<BoardStage[]>(
    () => buildBoard([], stages).map((c) => c.stage).filter((s) => s.terminal === null),
    [stages],
  );

  const onTerminalDrop = (dealId: string) => {
    toast({
      title: "Closed stages are set from the cockpit",
      description: "Open the deal to record a won/lost outcome.",
      action: (
        <ToastAction altText="Open deal cockpit" onClick={() => navigate(`/deals/${dealId}`)}>
          Open cockpit
        </ToastAction>
      ),
    });
  };

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-3">
        {columns.map((column) => (
          <BoardColumn
            key={column.stage.id}
            column={column}
            readOnly={readOnly}
            dragActive={dragActive}
            movingIds={moveApi.movingIds}
            onCardClick={onCardClick}
            rowActions={rowActions}
            moveStages={moveStages}
            onMoveStage={(row, stage) => moveApi.move(row.id, stage)}
            onDragStart={() => setDragActive(true)}
            onDragEnd={() => setDragActive(false)}
            onDropDeal={(dealId, stage) => moveApi.move(dealId, stage)}
            onTerminalDrop={onTerminalDrop}
          />
        ))}
      </div>
    </div>
  );
}
