/**
 * TransitionSankey — stage transition flow infographic.
 *
 * The Sankey diagram, by construction, can only ever show *forward*
 * progression: recharts' Sankey (d3-sankey underneath) rejects self-links and
 * loops on cycles caused by backward transitions, so we filter to source
 * index < target index (see `links` below). That means the diagram alone
 * hides recycling and every exit outcome. Two things compensate for that:
 * a breakdown panel below (accounts for every transition — advance / recycle
 * / won / lost, count + TCV — sourced from the engine's
 * computeTransitionBreakdown, always shown regardless of whether there's
 * enough forward-link data to draw a diagram), and a stage icon rail above
 * (a narrative spine showing every stage in order with its throughput, so the
 * pipeline's shape reads at a glance even before looking at the flow lines).
 *
 * Approach for the diagram itself:
 *   1. Filter self-loops (source === target — stagnation events).
 *   2. Keep only links where source node sort-index < target node sort-index
 *      (forward + exit transitions). Backward/regression links are omitted.
 *   3. Map string node IDs to numeric recharts indices.
 * If the filtered link set is empty, the diagram is skipped in favor of the
 * breakdown panel (which is informative on its own).
 *
 * Illustrative layer: recharts' <Sankey> accepts `node`/`link` render-prop
 * functions (confirmed against its compiled source) — the hover/tooltip
 * event handlers are bound on the wrapping <Layer> externally, not on
 * whatever the render prop returns, so fully custom node/link rendering does
 * not break the existing <RechartsTooltip>. SankeyNodeGlyph/SankeyFlowLink
 * below use that to draw semantically-colored, value-labeled nodes/links
 * instead of the library's flat default styling.
 */
import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { Sankey, Tooltip as RechartsTooltip } from "recharts";
import {
  Ban,
  ChevronRight,
  Circle,
  FlaskConical,
  FilePenLine,
  Handshake,
  RotateCcw,
  Search,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { useFlowSankey } from "./use-flow";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { money } from "@/lib/format";
import type { TransitionBreakdown } from "@workspace/engine";

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
  breakdown?: TransitionBreakdown;
}

const SANKEY_WIDTH = 720;
const SANKEY_HEIGHT = 280;

// ---------------------------------------------------------------------------
// Stage → icon/color glyph. Stage names are data-driven (no fixed enum
// reaches the client — see computeSankeyFlows), so this is an ordered rule
// list matched by regex rather than a keyed Record. Terminal outcomes are
// checked first so "Closed-Won"/"Closed-Lost" never fall through to a
// generic mid-pipeline rule. Any unrecognized stage name lands on the
// Circle/muted fallback and still renders correctly.
interface StageGlyph {
  Icon: LucideIcon;
  rgb: string;
}
const PIPELINE_RGB = "95,141,247"; // matches --primary (hsl(222,90%,67%)) in index.css
const WON_RGB = "5,150,105"; // deep emerald — matches conversion-matrix "win" / breakdown "won"
const LOST_RGB = "239,68,68"; // red — matches conversion-matrix "loss" / breakdown "lost"
const FALLBACK_GLYPH: StageGlyph = { Icon: Circle, rgb: "148,163,184" };

const STAGE_ICON_RULES: { test: RegExp; Icon: LucideIcon; rgb: string }[] = [
  { test: /won/i, Icon: Trophy, rgb: WON_RGB },
  { test: /lost/i, Icon: Ban, rgb: LOST_RGB },
  { test: /discov|prospect|lead|qualif/i, Icon: Search, rgb: PIPELINE_RGB },
  { test: /valid|technical|poc|trial|eval|solution/i, Icon: FlaskConical, rgb: PIPELINE_RGB },
  { test: /commerc|propos|negoti|quote|pricing|business/i, Icon: Handshake, rgb: PIPELINE_RGB },
  { test: /procure|legal|contract|sign|approval/i, Icon: FilePenLine, rgb: PIPELINE_RGB },
];

function resolveStageGlyph(label: string): StageGlyph {
  return STAGE_ICON_RULES.find((r) => r.test.test(label)) ?? FALLBACK_GLYPH;
}

// ---------------------------------------------------------------------------
// Stage icon rail — the narrative spine: every stage in order, with its
// throughput (max of incoming/outgoing forward-link volume, same formula
// d3-sankey uses internally for node.value, so these numbers match the
// diagram's own node labels below).
function StageIconRail({
  nodes,
  throughput,
  mode,
  reduce,
}: {
  nodes: SankeyNodeRaw[];
  throughput: Map<number, number>;
  mode: "count" | "value";
  reduce: boolean;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {nodes.map((n, i) => {
        const { Icon, rgb } = resolveStageGlyph(n.label);
        const t = throughput.get(i) ?? 0;
        return (
          <motion.div
            key={n.id}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: reduce ? 0 : i * 0.05 }}
            className="flex items-center gap-1 shrink-0"
          >
            <div className="flex flex-col items-center gap-1 min-w-[68px]">
              <div
                className="flex items-center justify-center w-8 h-8 rounded-full"
                style={{ backgroundColor: `rgba(${rgb},0.14)` }}
              >
                <Icon className="h-4 w-4" style={{ color: `rgb(${rgb})` }} />
              </div>
              <span className="text-[11px] font-medium truncate max-w-[76px]" title={n.label}>
                {n.label}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                {mode === "value" ? money(t) : t}
              </span>
            </div>
            {i < nodes.length - 1 && (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 mb-4" />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom Sankey node — a semantically-tinted bar (by resolveStageGlyph)
// labeled with its own throughput value directly on the diagram, instead of
// relying on hover-only detail. Stage names live on the rail above, so the
// on-node text is just the number, keeping the canvas uncluttered.
function SankeyNodeGlyph(mode: "count" | "value") {
  return function NodeGlyph(props: {
    x: number;
    y: number;
    width: number;
    height: number;
    payload: { name: string; value: number };
  }) {
    const { x, y, width, height, payload } = props;
    const { rgb } = resolveStageGlyph(payload.name ?? "");
    const label = mode === "value" ? money(payload.value ?? 0) : String(payload.value ?? 0);
    const nearRightEdge = x > SANKEY_WIDTH * 0.7;
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} rx={2} fill={`rgb(${rgb})`} fillOpacity={0.9} />
        {/* A longer "$X,XXX,XXX" label (value mode) can extend past the node
            far enough to sit on top of the departing link's colored ribbon,
            where plain muted-foreground text has poor contrast — a stroked
            halo in the card's own background color keeps the label readable
            regardless of what's rendered underneath it. */}
        <text
          x={nearRightEdge ? x - 6 : x + width + 6}
          y={y + height / 2}
          textAnchor={nearRightEdge ? "end" : "start"}
          dominantBaseline="middle"
          fontSize={10}
          className="font-mono"
          style={{
            fill: "hsl(var(--foreground))",
            stroke: "hsl(var(--card))",
            strokeWidth: 3,
            paintOrder: "stroke fill",
          }}
        >
          {label}
        </text>
      </g>
    );
  };
}

// ---------------------------------------------------------------------------
// Custom Sankey link — every rendered link is a forward advance (backward
// links are filtered out before reaching the diagram), so emerald is always
// semantically correct here; opacity scales with the link's share of the
// largest flow so the dominant path reads as visually strongest. Geometry
// matches recharts' own default link path exactly (see Sankey.js
// renderLinkItem) — only the color/weight styling changes.
//
// Stroke width is capped rather than using recharts' raw `linkWidth`: with a
// small/sparse dataset (few parallel flows), d3-sankey allocates almost the
// entire node's height to a single link, which at full opacity reads as a
// solid color blob rather than a flow ribbon. Capping keeps every link
// legible as a ribbon regardless of how little competing data exists, and
// lets color/opacity (not raw pixel thickness) carry the magnitude signal.
const MAX_LINK_STROKE = 16;
function SankeyFlowLink(maxValue: number) {
  return function LinkGlyph(props: {
    sourceX: number;
    sourceY: number;
    sourceControlX: number;
    targetX: number;
    targetY: number;
    targetControlX: number;
    linkWidth: number;
    payload: { value: number };
  }) {
    const { sourceX, sourceY, sourceControlX, targetX, targetY, targetControlX, linkWidth, payload } = props;
    const ratio = maxValue > 0 ? Math.min(1, payload.value / maxValue) : 0;
    const opacity = 0.35 + 0.5 * ratio;
    return (
      <path
        d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
        fill="none"
        stroke={`rgba(16,185,129,${opacity.toFixed(2)})`}
        strokeWidth={Math.min(linkWidth, MAX_LINK_STROKE)}
        strokeLinecap="round"
      />
    );
  };
}

// ---------------------------------------------------------------------------
// Breakdown panel — accounts for every transition (the Sankey only shows
// forward progression). Icons echo the rail/diagram's outcome colors (won
// deep-emerald, lost red) so the panel reads as part of the same visual
// story rather than a separate chart.
const BREAKDOWN_ROWS: { key: keyof TransitionBreakdown; label: string; rgb: string; note: string; Icon: LucideIcon }[] = [
  { key: "advance", label: "Advance", rgb: "16,185,129", note: "Moved forward to the next stage.", Icon: TrendingUp },
  { key: "recycle", label: "Recycle", rgb: "245,158,11", note: "Sent back to an earlier stage.", Icon: RotateCcw },
  { key: "won", label: "Won", rgb: WON_RGB, note: "Closed as Closed-Won.", Icon: Trophy },
  { key: "lost", label: "Lost", rgb: LOST_RGB, note: "Closed as Closed-Lost.", Icon: Ban },
];

function BreakdownPanel({
  breakdown,
  mode,
  reduce,
}: {
  breakdown: TransitionBreakdown;
  mode: "count" | "value";
  reduce: boolean;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {BREAKDOWN_ROWS.map((row, i) => {
        const bucket = breakdown[row.key];
        const primary = mode === "count" ? bucket.count : money(bucket.value);
        const secondary = mode === "count" ? money(bucket.value) : `${bucket.count} txn${bucket.count === 1 ? "" : "s"}`;
        return (
          <motion.div
            key={row.key}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: reduce ? 0 : 0.25 + i * 0.05 }}
            className="rounded-lg border border-border/60 p-3"
            style={{ backgroundColor: `rgba(${row.rgb},0.08)` }}
          >
            <div className="flex items-center gap-1.5">
              <div
                className="flex items-center justify-center w-5 h-5 rounded-full"
                style={{ backgroundColor: `rgba(${row.rgb},0.16)` }}
              >
                <row.Icon className="h-3 w-3" style={{ color: `rgb(${row.rgb})` }} />
              </div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">{row.label}</span>
            </div>
            <div className="text-xl font-bold font-mono mt-1 tabular-nums">{primary}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{secondary}</div>
          </motion.div>
        );
      })}
    </div>
  );
}

export function TransitionSankey() {
  const [mode, setMode] = useState<"count" | "value">("count");
  const query = useFlowSankey(mode);
  const raw = query.data?.data as SankeyData | undefined;
  const reduce = !!useReducedMotion();

  if (query.isError) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 text-sm text-destructive">
        We couldn't load transition data.
      </div>
    );
  }

  if (query.isLoading || !raw) {
    return <div className="bg-card border border-border rounded-lg p-6 h-64 animate-pulse" />;
  }

  const header = (
    <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-semibold">Stage Transitions</h3>
        <InfoTooltip>
          The rail above the diagram shows every stage in pipeline order with its throughput; the
          diagram itself shows only forward progression — d3-sankey can't render backward or
          self-loop edges without cycling. The panel below accounts for every transition, including
          recycled and exited deals, so nothing is hidden.
        </InfoTooltip>
      </div>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={mode}
        onValueChange={(v) => v && setMode(v as "count" | "value")}
      >
        <ToggleGroupItem value="count" className="text-xs px-2.5">
          Count
        </ToggleGroupItem>
        <ToggleGroupItem value="value" className="text-xs px-2.5">
          Value
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );

  if (!raw.nodes || raw.nodes.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6">
        {header}
        <p className="text-sm text-muted-foreground mt-3">No transitions recorded yet.</p>
      </div>
    );
  }

  // Build numeric index map for recharts (expects numeric source/target).
  const idx = new Map<string, number>(raw.nodes.map((n, i) => [n.id, i]));
  const nodes = raw.nodes.map((n) => ({ name: n.label }));

  // Filter to acyclic forward-only links: keep links where source index <
  // target index (implies forward flow) and drop self-loops.
  const links = raw.links
    .map((l) => ({
      source: idx.get(l.source) ?? -1,
      target: idx.get(l.target) ?? -1,
      value: Math.max(1, l.value), // recharts Sankey requires value > 0
    }))
    .filter((l) => l.source >= 0 && l.target >= 0 && l.source !== l.target && l.source < l.target);

  // Per-node throughput = max(outgoing sum, incoming sum) over the
  // forward-filtered links — the same formula d3-sankey uses internally for
  // node.value, so the rail's numbers match the diagram's own node labels.
  const outgoingSum = new Map<number, number>();
  const incomingSum = new Map<number, number>();
  for (const l of links) {
    outgoingSum.set(l.source, (outgoingSum.get(l.source) ?? 0) + l.value);
    incomingSum.set(l.target, (incomingSum.get(l.target) ?? 0) + l.value);
  }
  const throughput = new Map<number, number>();
  raw.nodes.forEach((_, i) => throughput.set(i, Math.max(outgoingSum.get(i) ?? 0, incomingSum.get(i) ?? 0)));
  const maxValue = Math.max(1, ...links.map((l) => l.value));

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      {header}
      <div className="mt-3">
        <StageIconRail nodes={raw.nodes} throughput={throughput} mode={mode} reduce={reduce} />
      </div>
      {links.length > 0 ? (
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: reduce ? 0 : 0.15 }}
          className="w-full overflow-x-auto mt-2"
        >
          <Sankey
            width={SANKEY_WIDTH}
            height={SANKEY_HEIGHT}
            data={{ nodes, links }}
            nodePadding={20}
            nodeWidth={12}
            node={SankeyNodeGlyph(mode)}
            link={SankeyFlowLink(maxValue)}
            margin={{ top: 8, right: 24, bottom: 8, left: 24 }}
          >
            <RechartsTooltip formatter={(value: number) => [value, mode === "count" ? "Transitions" : "TCV"]} />
          </Sankey>
          <p className="text-[11px] text-muted-foreground mt-2">
            Forward progression only, flow weight and shade scaled by volume — see the breakdown
            below for recycled and exited deals.
          </p>
        </motion.div>
      ) : (
        <p className="text-xs text-muted-foreground mt-3 mb-1">
          No forward transitions in the current window — the breakdown below still covers everything
          that did happen.
        </p>
      )}
      {raw.breakdown && (
        <div className="mt-4 pt-4 border-t border-border/60">
          <BreakdownPanel breakdown={raw.breakdown} mode={mode} reduce={reduce} />
        </div>
      )}
    </div>
  );
}
