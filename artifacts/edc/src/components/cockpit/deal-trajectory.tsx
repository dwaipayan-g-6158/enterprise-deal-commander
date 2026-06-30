import * as React from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Customized,
  Line,
  XAxis,
  YAxis,
} from "recharts";
import { useGetDealTrajectory } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  DeltaBadge,
  HEALTH_DOT,
  HEALTH_TEXT,
  compactCurrency,
  fullCurrency,
  type Health as Shared_Health,
} from "@/components/dashboard/widgets/_shared";

// ---- Local typed view of the loose analytics payload -------------------------
type Health = "RED" | "YELLOW" | "GREEN" | null;

interface TrajectoryPoint {
  at: string;
  score: number | null;
  gatePct: number | null;
  health: Health;
  stage: string | null;
  tcv: number | null;
}

interface StageChange {
  at: string;
  from: string | null;
  to: string | null;
}

interface TrajectoryData {
  points: TrajectoryPoint[];
  stageChanges: StageChange[];
}

// A row enriched with a numeric x (epoch ms) for a stable time axis.
interface ChartRow extends TrajectoryPoint {
  t: number;
}

type Metric = "score" | "gate" | "tcv";

// ---- Health label + the dot color used inside the chart/tooltip --------------
const HEALTH_LABEL: Record<NonNullable<Health>, string> = {
  RED: "Red",
  YELLOW: "Yellow",
  GREEN: "Green",
};

// Inline colors (used for the recharts dot/label fill, where a Tailwind class
// can't reach). These mirror HEALTH_DOT's emerald/amber/red.
const HEALTH_HEX: Record<NonNullable<Health>, string> = {
  RED: "hsl(var(--destructive))",
  YELLOW: "hsl(38 92% 50%)",
  GREEN: "hsl(var(--chart-2))",
};

const HEALTH_RANK: Record<NonNullable<Health>, number> = {
  RED: 0,
  YELLOW: 1,
  GREEN: 2,
};

// ---- Metric descriptors ------------------------------------------------------
const METRIC_COLOR: Record<Metric, string> = {
  score: "hsl(var(--chart-1))", // indigo
  gate: "hsl(var(--chart-1))", // indigo
  tcv: "hsl(var(--chart-2))", // emerald
};

const METRIC_LABEL: Record<Metric, string> = {
  score: "Score",
  gate: "Gate %",
  tcv: "TCV",
};

const chartConfig: ChartConfig = {
  score: { label: "Score", color: "hsl(var(--chart-1))" },
  gate: { label: "Gate %", color: "hsl(var(--chart-1))" },
  tcv: { label: "TCV", color: "hsl(var(--chart-2))" },
};

// ---- Date helpers ------------------------------------------------------------
const fmtTick = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const fmtFull = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const fmtRange = (a: number, b: number) => {
  const sameDay = fmtTick(a) === fmtTick(b);
  return sameDay ? fmtTick(a) : `${fmtTick(a)} – ${fmtTick(b)}`;
};

const dayCount = (a: number, b: number) =>
  Math.max(1, Math.round((b - a) / 86_400_000) + 1);

// ---------------------------------------------------------------------------
// deriveSummary — pure: baseline (first non-null) → current (last non-null)
// deltas for score/gate/tcv; health trend; current stage; time span.
// ---------------------------------------------------------------------------
function firstLast<T>(
  rows: ChartRow[],
  pick: (r: ChartRow) => T | null | undefined,
): { first: T | null; last: T | null } {
  let first: T | null = null;
  let last: T | null = null;
  for (const r of rows) {
    const v = pick(r);
    if (v != null) {
      if (first == null) first = v;
      last = v;
    }
  }
  return { first, last };
}

interface Summary {
  score: { first: number | null; last: number | null };
  gate: { first: number | null; last: number | null };
  tcv: { first: number | null; last: number | null };
  health: { first: Health; last: Health };
  healthTrend: "improved" | "worsened" | "flat";
  stage: string | null;
  spanStart: number;
  spanEnd: number;
  spanDays: number;
}

function deriveSummary(rows: ChartRow[]): Summary {
  const score = firstLast(rows, (r) => r.score);
  const gate = firstLast(rows, (r) => r.gatePct);
  const tcv = firstLast(rows, (r) => r.tcv);
  const healthFL = firstLast<NonNullable<Health>>(rows, (r) => r.health);
  const stage = firstLast(rows, (r) => r.stage);

  let healthTrend: Summary["healthTrend"] = "flat";
  if (healthFL.first && healthFL.last) {
    const d = HEALTH_RANK[healthFL.last] - HEALTH_RANK[healthFL.first];
    healthTrend = d > 0 ? "improved" : d < 0 ? "worsened" : "flat";
  }

  const spanStart = rows[0]?.t ?? Date.now();
  const spanEnd = rows[rows.length - 1]?.t ?? Date.now();

  return {
    score,
    gate,
    tcv,
    health: { first: healthFL.first, last: healthFL.last },
    healthTrend,
    stage: stage.last,
    spanStart,
    spanEnd,
    spanDays: dayCount(spanStart, spanEnd),
  };
}

// ---------------------------------------------------------------------------
// verdict — deterministic plain-language headline (NO LLM). Returns the lead
// word separately so the header can color-emphasize it like the mockup's .up.
// ---------------------------------------------------------------------------
type Tone = "good" | "warn" | "bad";
interface Verdict {
  lead: string;
  tone: Tone;
  rest: string;
}

function verdict(s: Summary): Verdict {
  const scoreDelta =
    s.score.first != null && s.score.last != null
      ? s.score.last - s.score.first
      : 0;
  const stage = s.stage ?? "this stage";

  // Slipping — score fell meaningfully or health worsened.
  if (scoreDelta <= -5 || s.healthTrend === "worsened") {
    if (s.healthTrend === "worsened" && s.health.last) {
      const drop = scoreDelta < 0 ? `score down ${Math.abs(scoreDelta)} pts, ` : "";
      return {
        lead: "Slipping",
        tone: "bad",
        rest: ` — ${drop}health fell to ${HEALTH_LABEL[s.health.last]}.`,
      };
    }
    return {
      lead: "Slipping",
      tone: "bad",
      rest: ` — score down ${Math.abs(scoreDelta)} pts in ${stage}.`,
    };
  }

  // Climbing — score rose meaningfully or health improved.
  if (scoreDelta >= 5 || s.healthTrend === "improved") {
    const advanced = s.stage ? ` as the deal advanced into ${stage}` : "";
    if (scoreDelta >= 5) {
      return {
        lead: "Climbing",
        tone: "good",
        rest: ` — score up ${scoreDelta} pts${advanced}.`,
      };
    }
    return {
      lead: "Climbing",
      tone: "good",
      rest:
        s.healthTrend === "improved" && s.health.last
          ? ` — health improved to ${HEALTH_LABEL[s.health.last]} in ${stage}.`
          : ` — momentum building in ${stage}.`,
    };
  }

  // Otherwise flat / stalling.
  return {
    lead: "Stalling",
    tone: "warn",
    rest: ` — flat for ${s.spanDays} ${s.spanDays === 1 ? "day" : "days"} in ${stage}.`,
  };
}

const TONE_TEXT: Record<Tone, string> = {
  good: "text-emerald-500",
  warn: "text-amber-500",
  bad: "text-red-500",
};

// ---------------------------------------------------------------------------
// Stage × health rail — contiguous runs of equal stage, tinted by the health
// that held during the run (last non-null health in the run).
// ---------------------------------------------------------------------------
interface StageSegment {
  stage: string;
  health: Health;
  start: number;
  end: number;
  days: number;
}

function stageSegments(rows: ChartRow[]): StageSegment[] {
  const segs: StageSegment[] = [];
  let run: ChartRow[] = [];

  const flush = () => {
    if (run.length === 0) return;
    const stage = run[0].stage;
    if (!stage) {
      run = [];
      return;
    }
    // health that held during the run: last non-null health in the run.
    let health: Health = null;
    for (const r of run) if (r.health) health = r.health;
    const start = run[0].t;
    const end = run[run.length - 1].t;
    segs.push({ stage, health, start, end, days: dayCount(start, end) });
    run = [];
  };

  for (const r of rows) {
    if (run.length > 0 && run[run.length - 1].stage !== r.stage) flush();
    run.push(r);
  }
  flush();
  return segs;
}

const RAIL_TINT: Record<NonNullable<Health>, string> = {
  RED: "rgba(239,68,68,.12)",
  YELLOW: "rgba(245,158,11,.14)",
  GREEN: "rgba(16,185,129,.12)",
};

// ---- Custom tooltip (rich, shows all metrics at hovered time) ----------------
interface TooltipProps {
  active?: boolean;
  payload?: { payload: ChartRow }[];
}

function TrajectoryTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="grid min-w-[11rem] gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-2 text-xs shadow-xl">
      <div className="font-medium">{fmtFull(row.t)}</div>
      <div className="grid gap-1">
        <TooltipRow label="Score" value={row.score != null ? row.score.toFixed(0) : "—"} />
        <TooltipRow
          label="Gate %"
          value={row.gatePct != null ? `${row.gatePct.toFixed(0)}%` : "—"}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Health</span>
          <span className="flex items-center gap-1.5 font-medium">
            {row.health && (
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: HEALTH_HEX[row.health] }}
              />
            )}
            {row.health ? HEALTH_LABEL[row.health] : "—"}
          </span>
        </div>
        <TooltipRow label="Stage" value={row.stage ?? "—"} />
        <TooltipRow
          label="TCV"
          value={row.tcv != null ? fullCurrency(row.tcv) : "—"}
        />
      </div>
    </div>
  );
}

function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

// ---- Shell -------------------------------------------------------------------
function Shell({ children }: { children: React.ReactNode }) {
  return <Card className="overflow-hidden p-5 sm:p-6">{children}</Card>;
}

// ---- KPI strip ---------------------------------------------------------------
function KpiCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card p-3 sm:p-4">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
        {label}
      </p>
      {children}
    </div>
  );
}

function HealthTrendChip({ summary }: { summary: Summary }) {
  if (!summary.health.last) return null;
  if (summary.healthTrend === "flat" || !summary.health.first) {
    return (
      <span className="text-xs text-muted-foreground">
        steady {HEALTH_LABEL[summary.health.last]}
      </span>
    );
  }
  const improved = summary.healthTrend === "improved";
  return (
    <span
      className={`flex items-center gap-0.5 text-xs font-medium ${improved ? "text-emerald-500" : "text-red-500"}`}
    >
      {improved ? "↑" : "↓"} from {HEALTH_LABEL[summary.health.first]}
    </span>
  );
}

function KpiStrip({ summary }: { summary: Summary }) {
  const { score, gate, tcv, health } = summary;
  return (
    <div className="my-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
      <KpiCell label="Close Score">
        <p className="mt-1.5 font-mono text-[22px] font-semibold leading-tight tracking-tight tabular-nums">
          {score.last != null ? score.last.toFixed(0) : "—"}
        </p>
        <div className="mt-1.5">
          {score.last != null && score.first != null ? (
            <DeltaBadge current={score.last} baseline={score.first} positiveIsGood />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </KpiCell>

      <KpiCell label="Health">
        <div className="mt-1.5 flex h-[27px] items-center">
          {health.last ? (
            <span className={`flex items-center gap-1.5 text-base font-semibold ${HEALTH_TEXT[health.last as Shared_Health]}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${HEALTH_DOT[health.last as Shared_Health]}`} />
              {HEALTH_LABEL[health.last]}
            </span>
          ) : (
            <span className="text-base font-semibold">—</span>
          )}
        </div>
        <div className="mt-1.5">
          <HealthTrendChip summary={summary} />
        </div>
      </KpiCell>

      <KpiCell label="Gate Completion">
        <p className="mt-1.5 font-mono text-[22px] font-semibold leading-tight tracking-tight tabular-nums">
          {gate.last != null ? `${gate.last.toFixed(0)}%` : "—"}
        </p>
        <div className="mt-1.5">
          {gate.last != null && gate.first != null ? (
            <DeltaBadge
              current={gate.last}
              baseline={gate.first}
              positiveIsGood
              format={(n) => `${n.toFixed(0)}`}
            />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </KpiCell>

      <KpiCell label="Contract Value">
        <p className="mt-1.5 font-mono text-[22px] font-semibold leading-tight tracking-tight tabular-nums">
          {tcv.last != null ? compactCurrency(tcv.last) : "—"}
        </p>
        <div className="mt-1.5">
          {tcv.last != null && tcv.first != null ? (
            <DeltaBadge
              current={tcv.last}
              baseline={tcv.first}
              positiveIsGood
              format={(n) => compactCurrency(n)}
            />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </KpiCell>
    </div>
  );
}

// ---- Endpoint direct-label (NYT technique) -----------------------------------
// Rendered via <Customized> so we have access to the resolved axis scales.
function makeEndpointLayer(
  metric: Metric,
  rows: ChartRow[],
  valueFmt: (v: number) => string,
) {
  const dataKey: keyof ChartRow =
    metric === "gate" ? "gatePct" : metric === "tcv" ? "tcv" : "score";

  // last row with a non-null value for this metric
  let endRow: ChartRow | undefined;
  for (const r of rows) if (r[dataKey] != null) endRow = r;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function EndpointLayer(props: any) {
    const { xAxisMap, yAxisMap } = props;
    if (!endRow) return null;
    const xAxis = xAxisMap?.[Object.keys(xAxisMap)[0]];
    const yAxis = yAxisMap?.[Object.keys(yAxisMap)[0]];
    if (!xAxis?.scale || !yAxis?.scale) return null;

    const value = endRow[dataKey] as number;
    const cx = xAxis.scale(endRow.t);
    const cy = yAxis.scale(value);
    if (cx == null || cy == null) return null;

    const color = METRIC_COLOR[metric];
    return (
      <g style={{ pointerEvents: "none" }}>
        <circle
          cx={cx}
          cy={cy}
          r={4.5}
          fill={color}
          stroke="hsl(var(--background))"
          strokeWidth={2}
        />
        <text
          x={cx - 9}
          y={cy - 11}
          textAnchor="end"
          className="font-mono text-xs font-semibold"
          fill={color}
        >
          {valueFmt(value)} · today
        </text>
      </g>
    );
  };
}

// ---- Hero chart --------------------------------------------------------------
function HeroChart({ metric, rows }: { metric: Metric; rows: ChartRow[] }) {
  const color = METRIC_COLOR[metric];
  const gradientId = `traj-grad-${metric}`;
  const dataKey: keyof ChartRow =
    metric === "gate" ? "gatePct" : metric === "tcv" ? "tcv" : "score";

  // Y domain: 0–100 for score/gate; data-driven padded domain for TCV.
  const isTcv = metric === "tcv";
  const tcvVals = rows.map((r) => r.tcv).filter((v): v is number => v != null);
  const tcvMin = tcvVals.length ? Math.min(...tcvVals) : 0;
  const tcvMax = tcvVals.length ? Math.max(...tcvVals) : 1;
  const tcvPad = (tcvMax - tcvMin) * 0.15 || tcvMax * 0.1 || 1;
  const yDomain: [number, number] = isTcv
    ? [Math.max(0, tcvMin - tcvPad), tcvMax + tcvPad]
    : [0, 100];

  const valueFmt = (v: number) =>
    isTcv ? compactCurrency(v) : metric === "gate" ? `${v.toFixed(0)}%` : v.toFixed(0);

  const EndpointLayer = React.useMemo(
    () => makeEndpointLayer(metric, rows, valueFmt),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [metric, rows],
  );

  return (
    <ChartContainer config={chartConfig} className="h-[260px] w-full">
      <ComposedChart data={rows} margin={{ left: 4, right: 64, top: 28, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.7} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={fmtTick}
          tickLine={false}
          axisLine={false}
          fontSize={11}
          minTickGap={24}
          className="font-mono"
        />
        <YAxis
          domain={yDomain}
          width={isTcv ? 48 : 32}
          tickCount={isTcv ? 4 : 5}
          tickFormatter={isTcv ? (v: number) => compactCurrency(v) : undefined}
          tickLine={false}
          axisLine={false}
          fontSize={11}
          className="font-mono"
        />

        <ChartTooltip content={<TrajectoryTooltip />} />

        <Area
          dataKey={dataKey}
          type="monotone"
          stroke="none"
          fill={`url(#${gradientId})`}
          connectNulls
          isAnimationActive={false}
          dot={false}
          activeDot={false}
        />
        <Line
          dataKey={dataKey}
          type="monotone"
          stroke={color}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          connectNulls
          isAnimationActive={false}
          dot={false}
          activeDot={{ r: 4 }}
        />

        <Customized component={EndpointLayer} />
      </ComposedChart>
    </ChartContainer>
  );
}

// ---- Stage rail --------------------------------------------------------------
function StageRail({ segments }: { segments: StageSegment[] }) {
  if (segments.length === 0) return null;
  const lastIdx = segments.length - 1;
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
          Stage progression · tinted by health
        </span>
        <span className="flex gap-3 text-[11px] font-medium text-muted-foreground">
          {(["RED", "YELLOW", "GREEN"] as const).map((h) => (
            <span key={h} className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${HEALTH_DOT[h as Shared_Health]}`} />
              {HEALTH_LABEL[h]}
            </span>
          ))}
        </span>
      </div>
      <div className="flex gap-[3px]">
        {segments.map((seg, i) => {
          const current = i === lastIdx;
          return (
            <div
              key={`${seg.stage}-${i}`}
              className={`relative flex min-h-[46px] flex-col justify-center rounded-md border px-3 py-2 ${
                current
                  ? "border-amber-500 ring-2 ring-amber-500/20"
                  : "border-transparent"
              }`}
              style={{
                flexGrow: seg.days,
                flexBasis: 0,
                backgroundColor: seg.health ? RAIL_TINT[seg.health] : "hsl(var(--muted))",
              }}
            >
              {current && (
                <span className="absolute right-2.5 top-2 rounded-full border border-amber-500 bg-card px-1.5 py-px font-mono text-[9px] font-bold tracking-[0.08em] text-amber-600">
                  CURRENT
                </span>
              )}
              <span className="text-[12.5px] font-semibold tracking-tight">
                {seg.stage}
              </span>
              <span className="mt-0.5 font-mono text-[10.5px] font-medium text-muted-foreground">
                {fmtRange(seg.start, seg.end)} · {seg.days}d
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Header (kicker + verdict + metric toggle) -------------------------------
function Header({
  summary,
  v,
  metric,
  setMetric,
}: {
  summary: Summary;
  v: Verdict;
  metric: Metric;
  setMetric: (m: Metric) => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="mb-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/70">
          Deal Trajectory · last {summary.spanDays}{" "}
          {summary.spanDays === 1 ? "day" : "days"}
        </p>
        <h2
          className="max-w-[42ch] text-[21px] font-semibold leading-snug tracking-tight"
          style={{ textWrap: "balance" } as React.CSSProperties}
        >
          <span className={TONE_TEXT[v.tone]}>{v.lead}</span>
          {v.rest}
        </h2>
      </div>
      <Tabs value={metric} onValueChange={(val) => setMetric(val as Metric)}>
        <TabsList className="h-9">
          {(["score", "gate", "tcv"] as const).map((m) => (
            <TabsTrigger key={m} value={m} className="text-xs">
              {METRIC_LABEL[m]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}

// ---- Sparse fallback (0–1 points) -------------------------------------------
function SparseSummary({ point }: { point: TrajectoryPoint | undefined }) {
  return (
    <Shell>
      <p className="mb-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/70">
        Deal Trajectory
      </p>
      <h2 className="mb-5 max-w-[42ch] text-[21px] font-semibold leading-snug tracking-tight">
        Awaiting history — not enough snapshots to chart a trend yet.
      </h2>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
        <KpiCell label="Close Score">
          <p className="mt-1.5 font-mono text-[22px] font-semibold leading-tight tabular-nums">
            {point?.score != null ? point.score.toFixed(0) : "—"}
          </p>
        </KpiCell>
        <KpiCell label="Health">
          <div className="mt-1.5 flex h-[27px] items-center">
            {point?.health ? (
              <span className={`flex items-center gap-1.5 text-base font-semibold ${HEALTH_TEXT[point.health as Shared_Health]}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${HEALTH_DOT[point.health as Shared_Health]}`} />
                {HEALTH_LABEL[point.health]}
              </span>
            ) : (
              <span className="text-base font-semibold">—</span>
            )}
          </div>
        </KpiCell>
        <KpiCell label="Gate Completion">
          <p className="mt-1.5 font-mono text-[22px] font-semibold leading-tight tabular-nums">
            {point?.gatePct != null ? `${point.gatePct.toFixed(0)}%` : "—"}
          </p>
        </KpiCell>
        <KpiCell label="Contract Value">
          <p className="mt-1.5 font-mono text-[22px] font-semibold leading-tight tabular-nums">
            {point?.tcv != null ? compactCurrency(point.tcv) : "—"}
          </p>
        </KpiCell>
      </div>
      {point?.stage && (
        <p className="mt-4 text-xs text-muted-foreground">
          Current stage · <span className="font-medium text-foreground">{point.stage}</span>
        </p>
      )}
    </Shell>
  );
}

// ---- Main --------------------------------------------------------------------
export function DealTrajectory({ dealId }: { dealId: string }) {
  const { data, isLoading, isError } = useGetDealTrajectory(dealId);
  const [metric, setMetric] = React.useState<Metric>("score");

  if (isLoading) {
    return (
      <Shell>
        <Skeleton className="h-[420px] w-full" />
      </Shell>
    );
  }

  if (isError) {
    return (
      <Shell>
        <p className="py-12 text-center text-sm text-muted-foreground">
          Could not load deal trajectory.
        </p>
      </Shell>
    );
  }

  const traj = (data?.data as TrajectoryData | undefined) ?? {
    points: [],
    stageChanges: [],
  };
  const points = traj.points ?? [];

  // Sparse data: 0 or 1 points → summary card, not an empty chart.
  if (points.length <= 1) {
    return <SparseSummary point={points[points.length - 1]} />;
  }

  const rows: ChartRow[] = points
    .map((p) => ({ ...p, t: Date.parse(p.at) }))
    .filter((r) => !Number.isNaN(r.t))
    .sort((a, b) => a.t - b.t);

  const summary = deriveSummary(rows);
  const v = verdict(summary);
  const segments = stageSegments(rows);

  return (
    <Shell>
      <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
        <Header summary={summary} v={v} metric={metric} setMetric={setMetric} />
        <KpiStrip summary={summary} />
        <HeroChart metric={metric} rows={rows} />
        <StageRail segments={segments} />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <span className="font-mono text-[11px] tracking-[0.02em] text-muted-foreground/60">
            Source · deal snapshots + predictive score
          </span>
        </div>
      </div>
    </Shell>
  );
}
