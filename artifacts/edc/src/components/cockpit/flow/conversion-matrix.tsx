import { useFlowConversionMatrix } from "./use-flow";
import { useListPipelineStages } from "@workspace/api-client-react";
import type { MatrixCell } from "@workspace/engine";

// Inline rgba colors to avoid Tailwind JIT dynamic opacity class generation failures.
// forward=emerald(16,185,129), stagnation=amber(245,158,11), regression=red(239,68,68)
function cellBg(cell: MatrixCell): string | undefined {
  if (cell.n === 0) return undefined;
  // opacity bucket: 0.1 at low rates, up to 0.55 at 100%
  const opacity = Math.min(0.55, 0.1 + (cell.rate / 100) * 0.45);
  if (cell.kind === "forward") return `rgba(16,185,129,${opacity.toFixed(2)})`;
  if (cell.kind === "stagnation") return `rgba(245,158,11,${opacity.toFixed(2)})`;
  return `rgba(239,68,68,${opacity.toFixed(2)})`;
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
      <h3 className="text-sm font-semibold mb-4">Conversion Matrix</h3>
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
                <td
                  key={cell.toId}
                  className={`h-11 min-w-[64px] text-center font-mono tabular-nums border border-border/40${cell.significant ? " ring-1 ring-primary/30" : ""}`}
                  style={{
                    backgroundColor: cellBg(cell),
                  }}
                >
                  {cell.n > 0 ? `${cell.rate}%` : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex gap-4 text-[11px] text-muted-foreground">
        <span>
          <span
            className="inline-block w-3 h-3 rounded-sm mr-1 align-middle"
            style={{ backgroundColor: "rgba(16,185,129,0.35)" }}
          />
          Forward
        </span>
        <span>
          <span
            className="inline-block w-3 h-3 rounded-sm mr-1 align-middle"
            style={{ backgroundColor: "rgba(245,158,11,0.35)" }}
          />
          Stagnation
        </span>
        <span>
          <span
            className="inline-block w-3 h-3 rounded-sm mr-1 align-middle"
            style={{ backgroundColor: "rgba(239,68,68,0.35)" }}
          />
          Regression
        </span>
      </div>
    </div>
  );
}
