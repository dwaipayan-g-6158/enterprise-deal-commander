import { useFlowRecycle } from "./use-flow";
import { useListPipelineStages } from "@workspace/api-client-react";
import type { RecycleExit as RecycleExitData, WaterfallStep } from "@workspace/engine";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { money } from "@/lib/format";

// Terminal stages don't have deals "leaving" them in the normal sense (there's
// nowhere further to recycle from or exit to), so by-stage recycle/exit rate
// tables exclude them — matching the terminal-detection-by-name convention
// used server-side in loadFlowStages (analytics.ts).
const isTerminalStageName = (name: string) => name === "Closed-Won" || name === "Closed-Lost";

// Waterfall rows are colored by semantic outcome (kind), not by the sign of
// the delta — "Won" is a good outcome and reads green even though it's a
// subtraction from the open-pipeline bucket; "Lost" reads red for the same
// reason. "ending" (Still open) is a running total, not a delta, so it's
// rendered as a plain, unsigned subtotal.
function WaterfallRow({ step }: { step: WaterfallStep }) {
  const abs = Math.abs(step.delta);
  if (step.kind === "ending") {
    return (
      <div className="flex justify-between text-sm tabular-nums font-semibold pt-2 mt-1 border-t border-border/60">
        <span>{step.label}</span>
        <span className="font-mono">{money(abs)}</span>
      </div>
    );
  }
  const color = step.kind === "won" ? "text-emerald-500" : step.kind === "lost" ? "text-red-500" : "text-foreground";
  const prefix = step.delta > 0 ? "+" : step.delta < 0 ? "-" : "";
  return (
    <div className="flex justify-between text-sm tabular-nums">
      <span className="text-muted-foreground">{step.label}</span>
      <span className={`font-mono ${color}`}>
        {prefix}
        {money(abs)}
      </span>
    </div>
  );
}

function RecycleRateTable({
  recycleRateByStage,
  stageNameMap,
}: {
  recycleRateByStage: Record<number, number>;
  stageNameMap: Record<number, string>;
}) {
  const entries = Object.entries(recycleRateByStage)
    .map(([k, v]) => ({ stageId: Number(k), rate: v }))
    .filter(({ stageId }) => !isTerminalStageName(stageNameMap[stageId] ?? ""));
  if (entries.length === 0) return null;
  const stageName = (id: number) => stageNameMap[id] ?? `Stage ${id}`;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">Recycle rate by stage</span>
        <InfoTooltip>
          Of the deals that entered each stage, the % later sent backward to an earlier stage.
        </InfoTooltip>
      </div>
      <div className="space-y-1">
        {entries.map(({ stageId, rate }) => (
          <div key={stageId} className="flex justify-between text-sm tabular-nums">
            <span className="text-muted-foreground">{stageName(stageId)}</span>
            <span className="font-mono">{rate}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExitRateTable({
  exitWonRateByStage,
  exitLostRateByStage,
  stageNameMap,
}: {
  exitWonRateByStage: Record<number, number>;
  exitLostRateByStage: Record<number, number>;
  stageNameMap: Record<number, string>;
}) {
  const entries = Object.entries(exitWonRateByStage)
    .map(([k, v]) => ({ stageId: Number(k), won: v, lost: exitLostRateByStage[Number(k)] ?? 0 }))
    .filter(({ stageId }) => !isTerminalStageName(stageNameMap[stageId] ?? ""));
  if (entries.length === 0) return null;
  const stageName = (id: number) => stageNameMap[id] ?? `Stage ${id}`;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">Exit rate by stage</span>
        <InfoTooltip>
          Of the deals that entered each stage, the % that closed Won vs. Lost directly from there.
        </InfoTooltip>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-muted-foreground">
            <th className="text-left font-normal"> </th>
            <th className="text-right font-normal pl-3">Won</th>
            <th className="text-right font-normal pl-3">Lost</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(({ stageId, won, lost }) => (
            <tr key={stageId}>
              <td className="text-muted-foreground py-0.5">{stageName(stageId)}</td>
              <td className="text-right font-mono tabular-nums pl-3 text-emerald-500">{won}%</td>
              <td className="text-right font-mono tabular-nums pl-3 text-red-500">{lost}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RecycleExit() {
  const query = useFlowRecycle();
  const data = query.data?.data as RecycleExitData | undefined;
  const { data: stagesData } = useListPipelineStages();
  const stageNameMap: Record<number, string> = Object.fromEntries(
    (stagesData?.data ?? []).map((s) => [s.id, s.stageName]),
  );

  if (query.isError) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 text-sm text-destructive">
        We couldn't load recycle and exit data.
      </div>
    );
  }

  if (query.isLoading || !data) {
    return <div className="bg-card border border-border rounded-lg p-6 h-48 animate-pulse" />;
  }

  const hasWaterfall = data.waterfall && data.waterfall.length > 0;
  const hasExitRates =
    Object.keys(data.exitWonRateByStage ?? {}).some((k) => !isTerminalStageName(stageNameMap[Number(k)] ?? ""));
  const hasRecycleRates =
    Object.keys(data.recycleRateByStage ?? {}).some((k) => !isTerminalStageName(stageNameMap[Number(k)] ?? ""));

  return (
    <div className="bg-card border border-border rounded-lg p-6 space-y-5">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-semibold">Recycle &amp; Exit</h3>
        <InfoTooltip>
          <strong>Recycle</strong> = a deal sent backward to an earlier stage (rework, re-scoping,
          stalled approval). <strong>Exit</strong> = a deal closed Won or Lost. Rates are computed
          per-stage as (recycled or exited from stage) ÷ (deals that entered that stage).
        </InfoTooltip>
      </div>

      {/* Overall recycle rate — prominent display */}
      <div>
        <div className="text-xs text-muted-foreground uppercase tracking-wider">Overall recycle rate</div>
        <div className="text-3xl font-bold font-mono tabular-nums mt-1">{data.overallRecycleRate}%</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {data.recycledDealCount} deal{data.recycledDealCount === 1 ? "" : "s"} sent back at least once
          {data.recycledValue > 0 ? ` · ${money(data.recycledValue)} in recycled value` : ""}
        </div>
      </div>

      {/* Waterfall: value bridge from Created through Won/Lost to Still open */}
      {hasWaterfall && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Value bridge</span>
            <InfoTooltip>
              Created (all pipeline entries) minus Won and Lost exits leaves what&apos;s Still open —
              recycling isn&apos;t shown here since it moves deals between stages without changing
              total pipeline value.
            </InfoTooltip>
          </div>
          <div className="space-y-1.5">
            {data.waterfall.map((step) => (
              <WaterfallRow key={step.label} step={step} />
            ))}
          </div>
        </div>
      )}

      {hasRecycleRates && (
        <RecycleRateTable recycleRateByStage={data.recycleRateByStage} stageNameMap={stageNameMap} />
      )}

      {hasExitRates && (
        <ExitRateTable
          exitWonRateByStage={data.exitWonRateByStage}
          exitLostRateByStage={data.exitLostRateByStage}
          stageNameMap={stageNameMap}
        />
      )}

      {/* Empty state if no meaningful data */}
      {!hasWaterfall && !hasExitRates && !hasRecycleRates && (
        <div className="text-sm text-muted-foreground">No transition data available yet.</div>
      )}
    </div>
  );
}
