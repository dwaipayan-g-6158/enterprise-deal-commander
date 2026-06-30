import { useFlowRecycle } from "./use-flow";
import type { RecycleExit as RecycleExitData, WaterfallStep } from "@workspace/engine";

const deltaColor = (delta: number) =>
  delta > 0 ? "text-emerald-500" : delta < 0 ? "text-red-500" : "text-muted-foreground";

const deltaPrefix = (delta: number) => (delta > 0 ? "+" : delta < 0 ? "-" : "");

function WaterfallRow({ step }: { step: WaterfallStep }) {
  const abs = Math.abs(step.delta);
  // Recycled step has delta===0 (count marker, not a value) — show as info row.
  if (step.kind === "recycled") {
    return (
      <div className="flex justify-between text-sm tabular-nums text-muted-foreground">
        <span>{step.label}</span>
        <span className="font-mono italic">count only</span>
      </div>
    );
  }
  return (
    <div className="flex justify-between text-sm tabular-nums">
      <span className="text-muted-foreground">{step.label}</span>
      <span className={`font-mono ${deltaColor(step.delta)}`}>
        {deltaPrefix(step.delta)}${abs.toLocaleString("en-US")}
      </span>
    </div>
  );
}

function ExitRateTable({ exitRateByStage }: { exitRateByStage: Record<number, number> }) {
  const entries = Object.entries(exitRateByStage).map(([k, v]) => ({
    stageId: Number(k),
    rate: v,
  }));
  if (entries.length === 0) return null;
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
        Exit rate by stage
      </div>
      <div className="space-y-1">
        {entries.map(({ stageId, rate }) => (
          <div key={stageId} className="flex justify-between text-sm tabular-nums">
            <span className="text-muted-foreground">Stage {stageId}</span>
            <span className="font-mono">{rate}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RecycleExit() {
  const query = useFlowRecycle();
  const data = query.data?.data as RecycleExitData | undefined;

  if (query.isError) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 text-sm text-destructive">
        Failed to load recycle and exit data.
      </div>
    );
  }

  if (query.isLoading || !data) {
    return <div className="bg-card border border-border rounded-lg p-6 h-48 animate-pulse" />;
  }

  const hasWaterfall = data.waterfall && data.waterfall.length > 0;
  const hasExitRates =
    data.exitRateByStage && Object.keys(data.exitRateByStage).length > 0;

  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-5">
      <h3 className="text-sm font-semibold">Recycle &amp; Exit</h3>

      {/* Overall recycle rate — prominent display */}
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-wider">
          Overall recycle rate
        </div>
        <div className="text-3xl font-bold font-mono tabular-nums mt-1">
          {data.overallRecycleRate}%
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          deals with at least one backward stage move
        </div>
      </div>

      {/* Waterfall: value flow breakdown */}
      {hasWaterfall && (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
            Value waterfall
          </div>
          <div className="space-y-1.5">
            {data.waterfall.map((step) => (
              <WaterfallRow key={step.label} step={step} />
            ))}
          </div>
        </div>
      )}

      {/* Exit rate by stage */}
      {hasExitRates && <ExitRateTable exitRateByStage={data.exitRateByStage} />}

      {/* Empty state if no meaningful data */}
      {!hasWaterfall && !hasExitRates && (
        <div className="text-sm text-muted-foreground">No transition data available yet.</div>
      )}
    </div>
  );
}
