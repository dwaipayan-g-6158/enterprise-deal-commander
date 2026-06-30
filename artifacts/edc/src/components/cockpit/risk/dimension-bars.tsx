import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  classifyRisk,
  sortDimensionsDesc,
  RISK_LEVEL_CLASS,
  type RiskDimension,
} from "./risk-model";
import { dimensionBarSegments } from "./risk-presentation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
          <div key={dim.name} className="flex items-center gap-3" role="img" aria-label={ariaLabel}>
            <span className="w-44 shrink-0 truncate text-sm" title={dim.name}>
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
            <span className="font-mono tabular-nums text-sm w-8 text-right shrink-0">{dim.score}</span>
            <div className="w-5 shrink-0 flex justify-center">
              {amplified ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className={cn("h-4 w-4 rounded flex items-center justify-center cursor-pointer hover:opacity-70 transition-opacity", cls.text)}
                      aria-label={`Amplification details for ${dim.name}`}
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="left" align="center" className="w-64 p-3 space-y-2.5">
                    <p className={cn("text-xs font-semibold", cls.text)}>
                      +{dim.amplification} risk amplification
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Active patterns driving this dimension&apos;s score up:
                    </p>
                    <div className="space-y-1">
                      {dim.contributingPatterns?.map((p) => (
                        <code
                          key={p}
                          className={cn(
                            "block text-[10px] font-mono rounded px-2 py-1 border",
                            cls.bg, cls.border, cls.text,
                          )}
                        >
                          {p}
                        </code>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
