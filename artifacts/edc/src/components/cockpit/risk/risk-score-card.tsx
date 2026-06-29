import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { RISK_LEVEL_CLASS, RISK_LEVEL_LABEL, type DealRisk } from "./risk-model";
import { DimensionBars } from "./dimension-bars";
import { ActivePatternsList } from "./active-patterns-list";
import { StageGuardrailBanner } from "./stage-guardrail-banner";
import { RecommendedActions } from "./recommended-actions";

export function RiskScoreCard({ risk, className }: { risk: DealRisk; className?: string }) {
  const cls = RISK_LEVEL_CLASS[risk.riskLevel];
  const dimensions = risk.dimensions ?? [];

  return (
    <Card className={cn("border-l-4", cls.border, className)}>
      <CardContent className="p-6 space-y-6">
        {/* Composite score header — HIGHER = worse (opposite of close score). */}
        <div className="flex items-end gap-3">
          <div className={cn("text-5xl font-bold font-mono tabular-nums leading-none", cls.text)}>
            {risk.compositeScore}
          </div>
          <div className="flex flex-col gap-1.5 pb-1">
            <span className="text-xs text-muted-foreground">/ 100 risk</span>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit",
                cls.bg,
                cls.text,
                cls.border,
              )}
            >
              {risk.riskLabel ?? RISK_LEVEL_LABEL[risk.riskLevel]}
            </span>
          </div>
        </div>

        {/* Dimensions. F4 wraps this region in a 2-col @md grid + adds the radar as a sibling. */}
        {dimensions.length ? (
          <div className="risk-dimensions">
            <DimensionBars dimensions={dimensions} />
          </div>
        ) : null}

        {risk.activePatterns?.length ? <ActivePatternsList patterns={risk.activePatterns} /> : null}

        {risk.stageGuardrail?.active ? <StageGuardrailBanner guardrail={risk.stageGuardrail} /> : null}

        {risk.topDrivers?.length ? (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Top Risk Drivers
            </p>
            <ul className="space-y-1">
              {risk.topDrivers.map((d, idx) => (
                <li key={`${d.dimension}-${idx}`} className="flex items-center gap-3 text-sm">
                  <span className="flex-1">
                    {d.dimension} — {d.factor}
                  </span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {Number.isFinite(d.impact) ? d.impact : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {risk.recommendedActions?.length ? (
          <RecommendedActions actions={risk.recommendedActions} />
        ) : null}
      </CardContent>
    </Card>
  );
}
