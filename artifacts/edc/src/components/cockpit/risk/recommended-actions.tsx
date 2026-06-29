import { cn } from "@/lib/utils";
import { sortActions, type RiskAction } from "./risk-model";
import { priorityPresentation } from "./risk-presentation";

export function RecommendedActions({ actions }: { actions: RiskAction[] }) {
  const sorted = sortActions(actions);
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
        Recommended Actions
      </p>
      <ul className="space-y-1.5">
        {sorted.map((a, idx) => {
          const { Icon, className } = priorityPresentation(a.priority);
          return (
            <li key={`${a.priority}-${a.patternCode ?? idx}`} className="flex items-start gap-2 text-sm">
              <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", className)} aria-hidden="true" />
              <span className={cn("text-[10px] font-semibold uppercase tracking-wide shrink-0 mt-0.5", className)}>
                {a.priority}
              </span>
              <span className="flex-1">{a.action}</span>
              {a.patternCode ? (
                <span className="font-mono text-[10px] text-muted-foreground shrink-0 mt-0.5">
                  {a.patternCode}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
