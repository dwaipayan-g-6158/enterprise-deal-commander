import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { RISK_LEVEL_CLASS, RISK_LEVEL_LABEL, type DealRisk } from "./risk-model";
import { DimensionBars } from "./dimension-bars";
import { RecommendedActions } from "./recommended-actions";
import { RiskRadar } from "./risk-radar";

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

        {/* Dimensions left, radar right — 2-col at @md to minimise scrolling. */}
        {dimensions.length ? (
          <div className="@container">
            <div className="grid grid-cols-1 @md:grid-cols-2 gap-4 items-center">
              <DimensionBars dimensions={dimensions} />
              <RiskRadar dimensions={dimensions} level={risk.riskLevel} />
            </div>
          </div>
        ) : null}

        {risk.topDrivers?.length ? (
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              Top Risk Drivers
            </p>
            <div className="rounded-md border border-border/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40">
                    <th className="text-left text-[10px] uppercase tracking-wide font-medium text-muted-foreground px-3 py-2 w-36">
                      Dimension
                    </th>
                    <th className="text-left text-[10px] uppercase tracking-wide font-medium text-muted-foreground px-3 py-2">
                      Factor
                    </th>
                    <th className="text-right text-[10px] uppercase tracking-wide font-medium text-muted-foreground px-3 py-2 w-14">
                      Impact
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {risk.topDrivers.map((d, idx) => (
                    <tr
                      key={`${d.dimension}-${idx}`}
                      className={cn(
                        "border-b border-border/40 last:border-0 align-top",
                        idx % 2 === 1 ? "bg-muted/20" : "bg-transparent",
                      )}
                    >
                      <td className="px-3 py-2 align-top w-36">
                        <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                          {d.dimension}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top leading-snug">{d.factor}</td>
                      <td className="px-3 py-2 align-top text-right font-mono tabular-nums text-muted-foreground w-14">
                        {Number.isFinite(d.impact) ? d.impact : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {risk.recommendedActions?.length ? (
          <RecommendedActions actions={risk.recommendedActions} />
        ) : null}
      </CardContent>
    </Card>
  );
}
