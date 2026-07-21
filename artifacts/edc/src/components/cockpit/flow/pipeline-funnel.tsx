import { useState } from "react";
import { useFlowFunnel } from "./use-flow";
import type { FunnelRow } from "@workspace/engine";

export function PipelineFunnel() {
  const query = useFlowFunnel();
  const data = query.data?.data as FunnelRow[] | undefined;
  const [mode, setMode] = useState<"count" | "value">("value");

  if (query.isError) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 text-sm text-destructive">
        We couldn't load the pipeline funnel.
      </div>
    );
  }

  if (query.isLoading || !data) {
    return <div className="bg-card border border-border rounded-lg p-6 h-48 animate-pulse" />;
  }

  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">
        No funnel data yet.
      </div>
    );
  }

  const max = Math.max(
    1,
    ...data.map((r) => (mode === "value" ? r.totalValue : r.dealCount)),
  );

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold">Pipeline Funnel</h3>
        <button
          className="text-xs text-muted-foreground underline"
          onClick={() => setMode(mode === "value" ? "count" : "value")}
        >
          {mode === "value" ? "Show count" : "Show value"}
        </button>
      </div>
      <div className="space-y-3">
        {data.map((r) => {
          const v = mode === "value" ? r.totalValue : r.dealCount;
          const widthPct = Math.max(4, (v / max) * 100);
          const label =
            mode === "value"
              ? `$${r.totalValue.toLocaleString("en-US")}`
              : `${r.dealCount} deal${r.dealCount !== 1 ? "s" : ""}`;
          const convLabel =
            r.convToNextPct != null ? ` · ${r.convToNextPct}% next` : "";
          return (
            <div key={r.stageId}>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>{r.stageName}</span>
                <span className="font-mono tabular-nums">
                  {label}
                  {convLabel}
                </span>
              </div>
              <div
                className="h-8 rounded-md bg-primary/80"
                style={{
                  width: `${widthPct}%`,
                  transition: "width 400ms ease-out",
                }}
              />
              {r.avgDaysInStage != null && (
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  avg {r.avgDaysInStage}d in stage
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
