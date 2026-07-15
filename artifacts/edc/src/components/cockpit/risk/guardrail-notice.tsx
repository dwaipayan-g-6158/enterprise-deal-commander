import { AlertTriangle } from "lucide-react";

// The "stage advancement is blocked by active risk" alert. Presentational only —
// shared by the Edit Deal sheet and the Kanban board's stage-override dialog so
// the two surfaces can't drift. Each caller supplies its own override-reason
// input around this notice.
export function GuardrailNotice({
  message,
  patternCodes,
}: {
  message: string;
  patternCodes: string[];
}) {
  return (
    <div className="flex gap-2 text-destructive">
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <div>
        <p className="font-semibold text-sm">Stage Guardrail</p>
        <p className="text-sm">{message}</p>
        {patternCodes.length > 0 && (
          <p className="text-xs font-mono mt-1">{patternCodes.join(", ")}</p>
        )}
      </div>
    </div>
  );
}
