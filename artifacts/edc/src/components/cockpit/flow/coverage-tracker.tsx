import { Link } from "wouter";
import { useFlowCoverage } from "./use-flow";
import { formatNum } from "@/lib/format";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface CoverageData {
  total: number | null;
  qualified: number | null;
  weighted: number | null;
  aiAdjusted: number | null;
  netNew: number | null;
  caveats?: string[];
}

const RATIOS: { key: keyof CoverageData; label: string; note: string }[] = [
  {
    key: "total",
    label: "Total",
    note: "All open pipeline value ÷ this period's revenue target — the rawest, most optimistic coverage read.",
  },
  {
    key: "qualified",
    label: "Qualified",
    note: "Open value in every stage past Discovery ÷ target — excludes unvetted top-of-funnel deals.",
  },
  {
    key: "weighted",
    label: "Weighted",
    note: "Σ(deal value × its win probability %) ÷ target. Deals without a win probability are excluded.",
  },
  {
    key: "aiAdjusted",
    label: "AI-Adjusted",
    note: "Σ(deal value × AI-scored win probability) ÷ target, using the model score instead of the manually set win %. Unscored deals are excluded.",
  },
  {
    key: "netNew",
    label: "Net-New",
    note: "Value landed this period ÷ the coverage gap still left after weighted pipeline. Blank when the gap is already covered — there's nothing left to backfill.",
  },
];

const tone = (r: number | null) =>
  r == null ? "text-muted-foreground" : r >= 3 ? "text-emerald-500" : r >= 2 ? "text-amber-500" : "text-red-500";

export function CoverageTracker() {
  const query = useFlowCoverage();
  const data = query.data?.data as CoverageData | undefined;

  if (query.isError) return <div className="text-sm text-destructive">We couldn't load coverage data.</div>;

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
            <div className="flex items-center gap-1 text-xs text-muted-foreground uppercase tracking-wider">
              <span>{m.label}</span>
              <InfoTooltip>
                {m.note} Read as a multiple of target: 3x+ is on track (green), 2-3x is tight (amber),
                under 2x is at risk (red).
              </InfoTooltip>
            </div>
            <div className={`text-3xl font-bold font-mono mt-1 ${tone(v ?? null)}`}>
              {v == null ? "—" : `${formatNum(v)}x`}
            </div>
            {noTarget && (
              <div className="text-[11px] text-muted-foreground mt-1">
                No target set —{" "}
                <Link href="/settings" className="underline hover:text-foreground">
                  set one in Settings → Targets
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
