import { Ban } from "lucide-react";
import { type DealRisk } from "./risk-model";

type StageGuardrail = NonNullable<DealRisk["stageGuardrail"]>;

export function StageGuardrailBanner({ guardrail }: { guardrail: StageGuardrail }) {
  if (!guardrail.active) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 border-l-4 border-l-destructive bg-destructive/10 rounded-md p-3 text-sm text-destructive"
    >
      <Ban className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
      <span>{guardrail.message ?? "Stage advancement is blocked."}</span>
    </div>
  );
}
