import { Eye, ExternalLink, Link2, Archive, Trash2, RotateCcw } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { DealState, RosterRow } from "./model/roster-types";

export interface RowActions {
  state: DealState;
  onOpen: (row: RosterRow) => void;
  onPreview: (row: RosterRow) => void;
  onArchive: (row: RosterRow) => void;
  onDelete: (row: RosterRow) => void;
  onRestore: (row: RosterRow) => void;
  onCopyLink: (row: RosterRow) => void;
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
