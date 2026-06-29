import { Columns3, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COLUMNS, COLUMN_ORDER, DEFAULT_VISIBLE } from "./model/roster-columns";
import type { ColumnId, ColumnLayout } from "./model/roster-types";

// Show/hide + reorder columns. No new dnd dependency — reordering is via
// up/down buttons (sufficient for ~11 columns and keyboard-accessible). Writes
// the full ColumnLayout, which the page persists to localStorage.
export function ColumnCustomizer({
  layout,
  onChange,
}: {
  layout: ColumnLayout;
  onChange: (next: ColumnLayout) => void;
}) {
  const visibleSet = new Set(layout.visible);
  const visibleCount = layout.visible.length;

  const toggle = (id: ColumnId) => {
    if (visibleSet.has(id)) {
      if (visibleCount <= 1) return; // keep at least one column
      onChange({ ...layout, visible: layout.visible.filter((c) => c !== id) });
    } else {
      onChange({ ...layout, visible: [...layout.visible, id] });
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    const next = [...layout.order];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...layout, order: next });
  };

  const reset = () =>
    onChange({ visible: [...DEFAULT_VISIBLE], order: [...COLUMN_ORDER], width: {} });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 cursor-pointer" aria-label="Customize columns">
          <Columns3 className="h-3.5 w-3.5" />
          Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Columns ({visibleCount} shown)</div>
        <div className="space-y-0.5 max-h-80 overflow-y-auto">
          {layout.order.map((id, index) => {
            const col = COLUMNS[id];
            if (!col) return null;
            const checked = visibleSet.has(id);
            return (
              <div key={id} className="flex items-center gap-2 rounded-sm px-2 py-1 hover:bg-muted">
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(id)}
                  disabled={checked && visibleCount <= 1}
                  aria-label={`Show ${col.label}`}
                />
                <span className="flex-1 text-sm">{col.label}</span>
                <div className="flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${col.label} up`}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => move(index, 1)}
                    disabled={index === layout.order.length - 1}
                    aria-label={`Move ${col.label} down`}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t mt-1 pt-1">
          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={reset}>
            Reset to default
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
