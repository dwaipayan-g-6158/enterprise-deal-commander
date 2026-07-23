import { Settings2, ArrowUp, ArrowDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { moveRow } from "@/lib/dashboard-layout/row-order";

const ROW_LABELS: Record<string, string> = {
  "vital-signs": "Pipeline Vital Signs",
  "health-risk-alerts": "Health, Risk & Alerts",
  "actions-forecast": "Next Actions & Forecast",
  "stage-gate-funnel": "Stage & Gate Funnels",
  "deal-roster": "Deal Roster",
  "close-timeline-activity": "Close Timeline & Activity",
  "velocity-competitive": "Velocity & Competitive",
  "simulation-band": "Simulation Band",
  "memory-insights": "Deal Memory Insights",
};

// Adaptive Dashboard, lightweight (PRD 4.8, descoped from the PRD's literal
// behavioral tracking engine — see the design spec). Purely a manual
// pin/reorder control: nothing here ever moves on its own.
export function CustomizeLayoutControl({
  rowOrder,
  onReorder,
  onReset,
}: {
  rowOrder: string[];
  onReorder: (next: string[]) => void;
  onReset: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <Settings2 className="h-3 w-3" />
          Customize Layout
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <p className="text-sm font-medium mb-2">Dashboard layout</p>
        <ul className="space-y-1">
          {rowOrder.map((id, index) => (
            <li key={id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{ROW_LABELS[id] ?? id}</span>
              <span className="flex gap-1 shrink-0">
                <button
                  type="button"
                  aria-label={`Move ${ROW_LABELS[id] ?? id} up`}
                  disabled={index === 0}
                  onClick={() => onReorder(moveRow(rowOrder, id, "up"))}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-30 disabled:pointer-events-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${ROW_LABELS[id] ?? id} down`}
                  disabled={index === rowOrder.length - 1}
                  onClick={() => onReorder(moveRow(rowOrder, id, "down"))}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-30 disabled:pointer-events-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
        <Button type="button" variant="outline" size="sm" className="mt-3 w-full min-h-[44px]" onClick={onReset}>
          Reset to Default
        </Button>
      </PopoverContent>
    </Popover>
  );
}
