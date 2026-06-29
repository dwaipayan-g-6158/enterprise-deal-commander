import { ShieldAlert, AlertTriangle, Ban } from "lucide-react";
import { type DealRisk } from "./risk-model";

type ActivePatterns = NonNullable<DealRisk["activePatterns"]>;

export function ActivePatternsList({ patterns }: { patterns: ActivePatterns }) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
        Active Patterns ({patterns.length})
      </p>
      <ul className="space-y-1.5">
        {patterns.map((p) => {
          const isRed = p.severity === "RED";
          return (
            <li key={p.code} className="flex items-start gap-2 text-sm">
              {isRed ? (
                <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <div className="flex-1">
                <span className="font-mono text-xs">{p.code}</span>
                {p.message ? <span className="text-muted-foreground"> — {p.message}</span> : null}
                {p.isStageGuardrail ? (
                  <span className="inline-flex items-center gap-1 ml-2 text-[11px] text-muted-foreground align-middle">
                    <Ban className="h-3 w-3 shrink-0" aria-hidden="true" />
                    blocks advancement
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
