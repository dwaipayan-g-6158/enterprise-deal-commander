import { Bookmark, Save, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { SavedView } from "./model/roster-types";

// Horizontal, scrollable strip of view pills (built-in + custom) plus the
// save / save-as / manage actions. The active view shows a "modified" dot when
// the current filters have diverged from it.
export function SavedViewTabs({
  allViews,
  activeId,
  dirty,
  canSaveToActive,
  onSelect,
  onSaveToActive,
  onSaveAs,
  onManage,
}: {
  allViews: SavedView[];
  activeId: string | null;
  dirty: boolean;
  canSaveToActive: boolean;
  onSelect: (sv: SavedView) => void;
  onSaveToActive: () => void;
  onSaveAs: () => void;
  onManage: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b pb-2">
      <ScrollArea className="flex-1">
        <div className="flex items-center gap-1.5">
          {allViews.map((v) => {
            const active = v.id === activeId;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onSelect(v)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted",
                )}
              >
                {v.name}
                {active && dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-label="modified" />}
              </button>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <div className="flex items-center gap-1 shrink-0">
        {canSaveToActive && (
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={onSaveToActive}>
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
        )}
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onSaveAs}>
          <Bookmark className="h-3.5 w-3.5" /> Save as
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onManage} aria-label="Manage views">
          <Settings2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
