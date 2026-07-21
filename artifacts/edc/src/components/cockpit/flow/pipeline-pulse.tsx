import { useFlowHealthScore } from "./use-flow";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DEFAULT_HEALTH_BENCHMARKS, type HealthBenchmarks } from "@workspace/engine";

interface HealthScoreData {
  score: number;
  subScores: Record<string, number | null>;
}

const COLORS = (n: number) =>
  n >= 80 ? "text-emerald-500" : n >= 60 ? "text-amber-500" : n >= 40 ? "text-orange-500" : "text-red-500";
const FILL = (n: number) =>
  n >= 80 ? "stroke-emerald-500" : n >= 60 ? "stroke-amber-500" : n >= 40 ? "stroke-orange-500" : "stroke-red-500";
const BAR = (n: number) =>
  n >= 80 ? "bg-emerald-500" : n >= 60 ? "bg-amber-500" : n >= 40 ? "bg-orange-500" : "bg-red-500";

// Human-readable label/units for each benchmark-scored dimension. The actual
// floor/ceiling numbers are read from DEFAULT_HEALTH_BENCHMARKS (the same
// curve the /flow/health-score route scores against) so this copy can never
// drift out of sync with the engine.
const DIMENSION_INFO: Record<
  keyof HealthBenchmarks,
  { label: string; note: string; format: (v: number) => string }
> = {
  coverage: {
    label: "Coverage",
    note: "Qualified open pipeline value ÷ this period's revenue target.",
    format: (v) => `${v}x`,
  },
  velocity: {
    label: "Velocity",
    note: "Average days a deal spends per stage, across recent transitions (lower is better).",
    format: (v) => `${v}d`,
  },
  conversion: {
    label: "Conversion",
    note: "Win rate: exit_won ÷ (exit_won + exit_lost) across recorded stage transitions.",
    format: (v) => `${Math.round(v * 100)}%`,
  },
  generation: {
    label: "Generation",
    note: "Net-new pipeline value landed this period ÷ the coverage gap still left to backfill the target.",
    format: (v) => `${v}x`,
  },
  age: {
    label: "Age",
    note: "Share of open deals running past 1.5x their stage's typical (median) residence — the same threshold the Velocity widget calls \"SLOW\" (lower is better).",
    format: (v) => `${Math.round(v * 100)}%`,
  },
  attrition: {
    label: "Attrition",
    note: "Retention rate = 1 − overall recycle rate (deals sent back a stage).",
    format: (v) => `${Math.round(v * 100)}%`,
  },
};

function benchmarkLine(dim: keyof HealthBenchmarks): string {
  const b = DEFAULT_HEALTH_BENCHMARKS[dim];
  const { format } = DIMENSION_INFO[dim];
  return `Benchmark: ${format(b.floorValue)} → ${b.floorScore}, ${format(b.ceilValue)} → ${b.ceilScore}.`;
}

export function PipelinePulse() {
  const query = useFlowHealthScore();
  const data = query.data?.data as HealthScoreData | undefined;

  if (query.isError) return <div className="bg-card border border-border rounded-lg p-6 text-sm text-destructive">We couldn't load pipeline health.</div>;

  if (query.isLoading || !data) {
    return <div className="bg-card border border-border rounded-lg p-6 h-64 animate-pulse" />;
  }

  const score = Math.round(data.score ?? 0);
  const subScores = data.subScores ?? {};

  const r = 70;
  const c = 2 * Math.PI * r;
  const arc = (270 / 360) * c;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * arc;

  return (
    <div className="bg-card border border-border rounded-lg p-6 flex flex-col items-center">
      <svg viewBox="0 0 180 180" className="w-48 h-48" role="img" aria-label={`Pipeline pulse score ${score}`}>
        <circle
          cx="90"
          cy="90"
          r={r}
          fill="none"
          className="stroke-muted/20"
          strokeWidth="12"
          strokeDasharray={`${arc} ${c}`}
          strokeLinecap="round"
          transform="rotate(135 90 90)"
        />
        <circle
          cx="90"
          cy="90"
          r={r}
          fill="none"
          className={FILL(score)}
          strokeWidth="12"
          strokeDasharray={`${filled} ${c}`}
          strokeLinecap="round"
          transform="rotate(135 90 90)"
          style={{ transition: "stroke-dasharray 800ms ease-out" }}
        />
        <text
          x="90"
          y="98"
          textAnchor="middle"
          className={`fill-current ${COLORS(score)} font-mono font-bold`}
          fontSize={48}
        >
          {score}
        </text>
      </svg>
      <div className="flex items-center gap-1.5 mt-2">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">Pipeline Pulse</span>
        <InfoTooltip>
          A 0-100 composite of six dimensions, each scored against a fixed benchmark curve (not your
          historical average) so the score is meaningful from day one. The composite is the weighted
          mean of whichever dimensions have data; missing dimensions are excluded and the rest
          re-normalized.
        </InfoTooltip>
      </div>
      <div className="w-full mt-4 space-y-1.5">
        {Object.entries(subScores).map(([k, v]) => {
          const info = DIMENSION_INFO[k as keyof HealthBenchmarks] as
            | (typeof DIMENSION_INFO)[keyof HealthBenchmarks]
            | undefined;
          return (
            <div key={k} className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs text-muted-foreground w-24 shrink-0">
                <span className="capitalize truncate">{info?.label ?? k}</span>
                {info && (
                  <InfoTooltip className="h-3 w-3">
                    {info.note} {benchmarkLine(k as keyof HealthBenchmarks)}
                  </InfoTooltip>
                )}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-muted/30">
                {v != null && (
                  <div
                    className={`h-1.5 rounded-full ${BAR(v)}`}
                    style={{ width: `${Math.max(0, Math.min(100, v))}%`, transition: "width 800ms ease-out" }}
                  />
                )}
              </div>
              <span className="text-xs font-mono w-8 text-right">{v ?? "—"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
