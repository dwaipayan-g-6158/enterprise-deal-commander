import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SavedView } from "./model/roster-types";

export function ManageViewsDialog({
  open,
  onOpenChange,
  views,
  onRename,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  views: SavedView[];
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage views</DialogTitle>
          <DialogDescription>Rename or delete your custom views. Built-in views can't be changed.</DialogDescription>
        </DialogHeader>
        {views.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No custom views yet. Save one and it'll show up here.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {views.map((v) => (
              <div key={v.id} className="flex items-center gap-2">
                <Input
                  defaultValue={v.name}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value.trim() !== v.name) onRename(v.id, e.target.value);
                  }}
                  aria-label={`Rename ${v.name}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(v.id)}
                  aria-label={`Delete ${v.name}`}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
