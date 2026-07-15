import { useMemo, useState } from "react";
import type { PipelineStage } from "@workspace/api-client-react";
import { buildBoard, type BandBy, type BoardStage } from "../model/board";
import type { RowActions } from "../row-context-menu";
import type { RosterRow } from "../model/roster-types";
import { BoardColumn } from "./board-column";
import type { StageMoveApi } from "./use-stage-move";

// The Kanban board: a horizontally scrollable rail of stage columns over the
// already-filtered/sorted rows. All intelligence lives on the cards; moving a
// card between columns changes the deal's stage through the shared move API,
// and dropping onto a terminal column asks the parent to open the close dialog.
export function RosterBoard({
  rows,
  stages,
  readOnly,
  stageFilter,
  bandBy,
  onCardClick,
  onRequestClose,
  rowActions,
  moveApi,
}: {
  rows: RosterRow[];
  stages: PipelineStage[];
  readOnly: boolean;
  /** filters.stage — stage names; when non-empty, only these columns render. */
  stageFilter: string[];
  bandBy: BandBy;
  onCardClick: (row: RosterRow) => void;
  onRequestClose: (row: RosterRow, stage: BoardStage) => void;
  rowActions: RowActions;
  moveApi: StageMoveApi;
}) {
  const [dragActive, setDragActive] = useState(false);

  const columns = useMemo(() => {
    const all = buildBoard(rows, stages, bandBy);
    if (stageFilter.length === 0) return all;
    const allow = new Set(stageFilter);
    return all.filter((c) => allow.has(c.stage.name));
  }, [rows, stages, stageFilter, bandBy]);

  // Non-terminal stages power the "Move to stage" context submenu.
  const moveStages = useMemo<BoardStage[]>(
    () => buildBoard([], stages).map((c) => c.stage).filter((s) => s.terminal === null),
    [stages],
  );

  const requestClose = (dealId: string, stage: BoardStage) => {
    const row = rows.find((r) => r.id === dealId);
    if (row) onRequestClose(row, stage);
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
            onTerminalDrop={(dealId) => requestClose(dealId, column.stage)}
          />
        ))}
      </div>
    </div>
  );
}
