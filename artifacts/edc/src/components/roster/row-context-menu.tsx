import { Eye, ExternalLink, Link2, Archive, Trash2, RotateCcw, MoveRight, Check } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { BoardStage } from "./model/board";
import type { DealState, RosterRow } from "./model/roster-types";

/** Optional non-drag stage-move affordance (board view). */
export interface MoveToActions {
  /** Non-terminal stages a deal can be moved into. */
  stages: BoardStage[];
  currentStageId: number;
  onMove: (row: RosterRow, stage: BoardStage) => void;
}

export interface RowActions {
  state: DealState;
  onOpen: (row: RosterRow) => void;
  onPreview: (row: RosterRow) => void;
  onArchive: (row: RosterRow) => void;
  onDelete: (row: RosterRow) => void;
  onRestore: (row: RosterRow) => void;
  onCopyLink: (row: RosterRow) => void;
  /** When set (board view, active state), adds a "Move to stage" submenu. */
  moveTo?: MoveToActions;
}

export function RowContextMenu({
  row,
  actions,
  children,
}: {
  row: RosterRow;
  actions: RowActions;
  children: React.ReactNode;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={() => actions.onPreview(row)}>
          <Eye className="mr-2 h-4 w-4" /> Preview
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onOpen(row)}>
          <ExternalLink className="mr-2 h-4 w-4" /> Open cockpit
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.onCopyLink(row)}>
          <Link2 className="mr-2 h-4 w-4" /> Copy link
        </ContextMenuItem>
        {actions.moveTo && actions.state === "active" && (
          <>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <MoveRight className="mr-2 h-4 w-4" /> Move to stage
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-44">
                {actions.moveTo.stages.map((stage) => {
                  const current = stage.id === actions.moveTo!.currentStageId;
                  return (
                    <ContextMenuItem
                      key={stage.id}
                      disabled={current}
                      onSelect={() => actions.moveTo!.onMove(row, stage)}
                    >
                      {current && <Check className="mr-2 h-4 w-4" />}
                      <span className={current ? "" : "ml-6"}>{stage.name}</span>
                    </ContextMenuItem>
                  );
                })}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}
        <ContextMenuSeparator />
        {actions.state === "active" && (
          <ContextMenuItem onSelect={() => actions.onArchive(row)}>
            <Archive className="mr-2 h-4 w-4" /> Archive
          </ContextMenuItem>
        )}
        {(actions.state === "archived" || actions.state === "deleted") && (
          <ContextMenuItem onSelect={() => actions.onRestore(row)}>
            <RotateCcw className="mr-2 h-4 w-4" /> Restore
          </ContextMenuItem>
        )}
        {actions.state !== "deleted" && (
          <ContextMenuItem
            onSelect={() => actions.onDelete(row)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
