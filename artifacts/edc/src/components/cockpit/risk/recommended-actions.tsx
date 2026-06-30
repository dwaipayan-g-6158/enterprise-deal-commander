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
      <div className="rounded-md border border-border/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 bg-muted/40">
              <th className="text-left text-[10px] uppercase tracking-wide font-medium text-muted-foreground px-3 py-2 w-24">
                Priority
              </th>
              <th className="text-left text-[10px] uppercase tracking-wide font-medium text-muted-foreground px-3 py-2">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a: RiskAction, idx: number) => {
              const { Icon, className } = priorityPresentation(a.priority);
              return (
                <tr
                  key={`${a.priority}-${a.patternCode ?? idx}`}
                  className={cn(
                    "border-b border-border/40 last:border-0 align-top",
                    idx % 2 === 1 ? "bg-muted/20" : "bg-transparent",
                  )}
                >
                  <td className="px-3 py-2.5 w-24 align-top">
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <Icon className={cn("h-3.5 w-3.5 shrink-0", className)} aria-hidden="true" />
                      <span className={cn("text-[10px] font-bold uppercase tracking-wide leading-none", className)}>
                        {a.priority}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <p className="leading-snug">{a.action}</p>
                    {a.patternCode ? (
                      <code className="mt-1.5 inline-block text-[9px] font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5 border border-border/60">
                        {a.patternCode}
                      </code>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
