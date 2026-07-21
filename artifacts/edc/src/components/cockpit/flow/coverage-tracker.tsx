import { useFlowCoverage } from "./use-flow";

interface CoverageData {
  total: number | null;
  qualified: number | null;
  weighted: number | null;
  aiAdjusted: number | null;
  netNew: number | null;
  caveats?: string[];
}

const RATIOS: { key: keyof CoverageData; label: string }[] = [
  { key: "total", label: "Total" },
  { key: "qualified", label: "Qualified" },
  { key: "weighted", label: "Weighted" },
  { key: "aiAdjusted", label: "AI-Adjusted" },
  { key: "netNew", label: "Net-New" },
];

const tone = (r: number | null) =>
  r == null ? "text-muted-foreground" : r >= 3 ? "text-emerald-500" : r >= 2 ? "text-amber-500" : "text-red-500";

export function CoverageTracker() {
  const query = useFlowCoverage();
  const data = query.data?.data as CoverageData | undefined;

  if (query.isError) return <div className="text-sm text-destructive">We couldn't load coverage data. Nothing else on this page is affected.</div>;

  if (query.isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {RATIOS.map((m) => (
          <div key={m.key} className="bg-card border border-border rounded-lg p-4 h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  // When no quarterly target is set the engine returns all-null ratios.
  const noTarget = data != null && RATIOS.every((m) => (data[m.key] as number | null) == null);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
      {RATIOS.map((m) => {
        const v = data?.[m.key] as number | null | undefined;
        return (
          <div key={m.key} className="bg-card border border-border rounded-lg p-4 shadow-sm">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">{m.label}</div>
            <div className={`text-3xl font-bold font-mono mt-1 ${tone(v ?? null)}`}>
              {v == null ? "—" : `${v.toFixed(2)}x`}
            </div>
            {noTarget && (
              <div className="text-[11px] text-muted-foreground mt-1">Set a target</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
