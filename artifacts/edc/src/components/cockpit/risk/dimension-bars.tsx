import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  classifyRisk,
  sortDimensionsDesc,
  RISK_LEVEL_CLASS,
  type RiskDimension,
} from "./risk-model";
import { dimensionBarSegments } from "./risk-presentation";

export function DimensionBars({ dimensions }: { dimensions: RiskDimension[] }) {
  const sorted = sortDimensionsDesc(dimensions);
  return (
    <div className="space-y-2">
      {sorted.map((dim) => {
        const level = classifyRisk(dim.score);
        const cls = RISK_LEVEL_CLASS[level];
        const { basePct, ampPct, amplified } = dimensionBarSegments(dim);
        const ariaLabel =
          `${dim.name}: risk ${dim.score} of 100` +
          (amplified
            ? `, amplified ${dim.amplification} by ${dim.contributingPatterns?.join(", ")}`
            : "");
        return (
          <div key={dim.name}>
            <div className="flex items-center gap-3" role="img" aria-label={ariaLabel}>
              <span className="w-44 truncate text-sm" title={dim.name}>
                {dim.name}
              </span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
                <div className={cn("h-full", cls.fill)} style={{ width: `${basePct}%` }} />
                {amplified ? (
                  <div
                    className={cn("h-full opacity-70 brightness-75", cls.fill)}
                    style={{ width: `${ampPct}%` }}
                  />
                ) : null}
              </div>
              <span className="font-mono tabular-nums text-sm w-8 text-right">{dim.score}</span>
            </div>
            {amplified ? (
              <div className={cn("flex items-center gap-1 text-[11px] mt-0.5 pl-[11.75rem]", cls.text)}>
                <TrendingUp className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>
                  +{dim.amplification} · {dim.contributingPatterns?.join(", ")} active
                </span>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
