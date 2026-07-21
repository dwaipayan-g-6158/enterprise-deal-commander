import { useFlowHealthScore } from "./use-flow";

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
      <div className="text-xs text-muted-foreground uppercase tracking-wider mt-2">Pipeline Pulse</div>
      <div className="w-full mt-4 space-y-1.5">
        {Object.entries(subScores).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-24 capitalize truncate">{k}</span>
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
        ))}
      </div>
    </div>
  );
}
