/**
 * TransitionSankey — stage transition flow visualization.
 *
 * Approach: recharts `Sankey` with self-loop and backward-edge filtering.
 *
 * recharts Sankey (d3-sankey underneath) rejects self-links and can loop
 * on cycles caused by backward transitions (regression). To ensure a safe,
 * acyclic graph we:
 *   1. Filter self-loops (source === target — stagnation events).
 *   2. Keep only links where source node sort-index < target node sort-index
 *      (forward + exit transitions). Backward/regression links are omitted.
 *   3. Map string node IDs to numeric recharts indices.
 *
 * If the filtered link set is empty we fall back to a plain top-transitions
 * list rather than rendering a broken chart.
 */
import { Sankey, Tooltip } from "recharts";
import { useFlowSankey } from "./use-flow";

interface SankeyNodeRaw {
  id: string;
  label: string;
}

interface SankeyLinkRaw {
  source: string;
  target: string;
  value: number;
}

interface SankeyData {
  nodes: SankeyNodeRaw[];
  links: SankeyLinkRaw[];
}

export function TransitionSankey() {
  const query = useFlowSankey("count");
  const raw = query.data?.data as SankeyData | undefined;

  if (query.isError) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 text-sm text-destructive">
        We couldn't load transition data. Nothing else on this page is affected.
      </div>
    );
  }

  if (query.isLoading || !raw) {
    return <div className="bg-card border border-border rounded-lg p-6 h-64 animate-pulse" />;
  }

  if (!raw.nodes || raw.nodes.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">
        No transitions yet.
      </div>
    );
  }

  // Build numeric index map for recharts (expects numeric source/target).
  const idx = new Map<string, number>(raw.nodes.map((n, i) => [n.id, i]));
  const nodes = raw.nodes.map((n) => ({ name: n.label }));

  // Filter to acyclic forward-only links:
  // keep links where source index < target index (implies forward flow) and
  // drop self-loops (source === target).
  const links = raw.links
    .map((l) => ({
      source: idx.get(l.source) ?? -1,
      target: idx.get(l.target) ?? -1,
      value: Math.max(1, l.value), // recharts Sankey requires value > 0
    }))
    .filter((l) => l.source >= 0 && l.target >= 0 && l.source !== l.target && l.source < l.target);

  // Fallback: if no forward links remain (all data is backward or stagnation),
  // show a plain sorted list of the top transitions instead.
  if (links.length === 0) {
    const sorted = [...raw.links]
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    const labelOf = new Map(raw.nodes.map((n) => [n.id, n.label]));
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="text-sm font-semibold mb-4">Stage Transitions</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Top transitions (flow diagram unavailable — no forward transitions in current data)
        </p>
        <div className="space-y-1">
          {sorted.map((l, i) => (
            <div key={i} className="flex justify-between text-sm tabular-nums">
              <span className="text-muted-foreground">
                {labelOf.get(l.source) ?? l.source} &rarr; {labelOf.get(l.target) ?? l.target}
              </span>
              <span className="font-mono">{l.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-4">Stage Transitions</h3>
      <div className="w-full overflow-x-auto">
        <Sankey
          width={720}
          height={320}
          data={{ nodes, links }}
          nodePadding={20}
          nodeWidth={12}
          link={{ stroke: "hsl(var(--muted-foreground) / 0.4)" }}
          margin={{ top: 8, right: 24, bottom: 8, left: 24 }}
        >
          <Tooltip
            formatter={(value: number) => [value, "Transitions"]}
          />
        </Sankey>
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">
        Forward transitions only. Self-loops and regressions are excluded from the flow diagram.
      </p>
    </div>
  );
}
