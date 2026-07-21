import { useFlowConversionMatrix } from "./use-flow";
import { useListPipelineStages } from "@workspace/api-client-react";
import type { MatrixCell } from "@workspace/engine";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Inline rgba colors to avoid Tailwind JIT dynamic opacity class generation failures.
// win=deep emerald(5,150,105), forward=emerald(16,185,129), stagnation=amber(245,158,11),
// regression=orange(249,115,22), loss=red(239,68,68).
//
// kind is decided by the engine's terminal-flag check BEFORE any sortOrder
// comparison (see computeConversionMatrix in @workspace/engine): a move into
// Closed-Lost is always "loss" (red), never "forward" (green), regardless of
// where Closed-Lost sorts among the other stages.
const KIND_RGB: Record<MatrixCell["kind"], string> = {
  win: "5,150,105",
  forward: "16,185,129",
  stagnation: "245,158,11",
  regression: "249,115,22",
  loss: "239,68,68",
};
const KIND_LABEL: Record<MatrixCell["kind"], string> = {
  win: "Win",
  forward: "Forward",
  stagnation: "Stagnation",
  regression: "Regression",
  loss: "Loss",
};

function cellBg(cell: MatrixCell): string | undefined {
  if (cell.n === 0) return undefined;
  // opacity bucket: 0.15 at low rates, up to 0.6 at 100%
  const opacity = Math.min(0.6, 0.15 + (cell.rate / 100) * 0.45);
  return `rgba(${KIND_RGB[cell.kind]},${opacity.toFixed(2)})`;
}

export function ConversionMatrix() {
  const query = useFlowConversionMatrix();
  const data = query.data?.data as MatrixCell[][] | undefined;
  const { data: stagesData } = useListPipelineStages();
  const stageNameMap: Record<number, string> = Object.fromEntries(
    (stagesData?.data ?? []).map((s) => [s.id, s.stageName]),
  );
  const stageName = (id: number) => stageNameMap[id] ?? `Stage ${id}`;

  if (query.isError) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 text-sm text-destructive">
        We couldn't load the conversion matrix.
      </div>
    );
  }

  if (query.isLoading || !data) {
    return <div className="bg-card border border-border rounded-lg p-6 h-48 animate-pulse" />;
  }

  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">
        No transition data yet.
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 overflow-x-auto">
      <div className="flex items-center gap-1.5 mb-1">
        <h3 className="text-sm font-semibold">Conversion Matrix</h3>
        <InfoTooltip>
          For every pair of stages, the rate is (transitions From → To) ÷ (all transitions out of
          From) within the trailing window — read a row as "of the deals that left this stage, what
          share went where." A move into Closed-Won or Closed-Lost is always colored by that outcome,
          never by stage order, so losses are never mistaken for progress. An outlined cell deviates
          significantly (p&lt;0.05) from the portfolio's overall forward-rate.
        </InfoTooltip>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Read a row: of deals that left <span className="font-medium">From</span>, the % that moved to
        each <span className="font-medium">To</span> stage.
      </p>
      <TooltipProvider>
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="w-20 text-right pr-2 text-muted-foreground font-normal">From \ To</th>
              {data[0]?.map((cell) => (
                <th
                  key={cell.toId}
                  className="h-8 min-w-[64px] px-2 text-center font-normal text-muted-foreground border border-border/40"
                >
                  {stageName(cell.toId)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={row[0]?.fromId ?? i}>
                <td className="pr-2 text-right text-muted-foreground font-normal">
                  {row[0]?.fromId !== undefined ? stageName(row[0].fromId) : ""}
                </td>
                {row.map((cell) => (
                  <Tooltip key={cell.toId}>
                    <TooltipTrigger asChild>
                      <td
                        className={`h-11 min-w-[64px] text-center font-mono tabular-nums border border-border/40${cell.significant ? " ring-1 ring-primary/30" : ""}`}
                        style={{
                          backgroundColor: cellBg(cell),
                        }}
                      >
                        {cell.n > 0 ? `${cell.rate}%` : "—"}
                      </td>
                    </TooltipTrigger>
                    {cell.n > 0 && (
                      <TooltipContent>
                        {stageName(cell.fromId)} → {stageName(cell.toId)}: {cell.rate}% ({cell.n}{" "}
                        transition{cell.n === 1 ? "" : "s"}) — {KIND_LABEL[cell.kind]}
                        {cell.significant ? ", statistically significant vs. portfolio baseline" : ""}
                      </TooltipContent>
                    )}
                  </Tooltip>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TooltipProvider>
      <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
        {(["win", "forward", "stagnation", "regression", "loss"] as const).map((k) => (
          <span key={k}>
            <span
              className="inline-block w-3 h-3 rounded-sm mr-1 align-middle"
              style={{ backgroundColor: `rgba(${KIND_RGB[k]},0.4)` }}
            />
            {KIND_LABEL[k]}
          </span>
        ))}
      </div>
    </div>
  );
}
