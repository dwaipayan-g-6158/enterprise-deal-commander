import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { useGetDealTrajectory } from "@workspace/api-client-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatCurrency } from "@/components/cockpit/use-invalidate";
import { TrendingUp } from "lucide-react";

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

// ---- Health colour mapping (subtle background tints) -------------------------
const HEALTH_FILL: Record<string, string> = {
  RED: "hsl(var(--destructive))",
  YELLOW: "hsl(38 92% 50%)",
  GREEN: "hsl(var(--chart-2))",
};

const HEALTH_LABEL: Record<string, string> = {
  RED: "Red",
  YELLOW: "Yellow",
  GREEN: "Green",
};

const chartConfig: ChartConfig = {
  score: { label: "Score", color: "hsl(var(--chart-1))" },
  gatePct: { label: "Gate %", color: "hsl(var(--chart-3))" },
};

const fmtTick = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const fmtFull = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

// A row enriched with a numeric x (epoch ms) for a stable time axis.
interface ChartRow extends TrajectoryPoint {
  t: number;
}

// Compute contiguous segments where health stays constant. Each segment spans
// from the first point of that run to the first point of the next run (so the
// tint covers the whole interval, not just the discrete sample).
function healthSegments(rows: ChartRow[]) {
  const segs: { x1: number; x2: number; health: string }[] = [];
  if (rows.length === 0) return segs;
  let start = 0;
  for (let i = 1; i <= rows.length; i++) {
    const prev = rows[i - 1].health;
    const cur = i < rows.length ? rows[i].health : null;
    if (i === rows.length || cur !== prev) {
      if (prev) {
        segs.push({
          x1: rows[start].t,
          // extend to the boundary with the next point (or the last point)
          x2: i < rows.length ? rows[i].t : rows[rows.length - 1].t,
          health: prev,
        });
      }
      start = i;
    }
  }
  return segs;
}

// ---- Custom tooltip ----------------------------------------------------------
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
        <Row label="Score" value={row.score != null ? row.score.toFixed(0) : "—"} />
        <Row
          label="Gate %"
          value={row.gatePct != null ? `${row.gatePct.toFixed(0)}%` : "—"}
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Health</span>
          <span className="flex items-center gap-1.5 font-medium">
            {row.health && (
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: HEALTH_FILL[row.health] }}
              />
            )}
            {row.health ? HEALTH_LABEL[row.health] : "—"}
          </span>
        </div>
        <Row label="Stage" value={row.stage ?? "—"} />
        <Row
          label="TCV"
          value={row.tcv != null ? formatCurrency(row.tcv, "USD") : "—"}
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
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
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-4 w-4 text-primary" />
          Deal Trajectory
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Score, health, gates &amp; stage over time
        </p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ---- Sparse-data summary (0–1 points) ---------------------------------------
function SparseSummary({ point }: { point: TrajectoryPoint | undefined }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        <Stat label="Score" value={point?.score != null ? point.score.toFixed(0) : "—"} />
        <Stat
          label="Gate %"
          value={point?.gatePct != null ? `${point.gatePct.toFixed(0)}%` : "—"}
        />
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Health
          </p>
          {point?.health ? (
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: HEALTH_FILL[point.health] }}
              />
              {HEALTH_LABEL[point.health]}
            </span>
          ) : (
            <span className="text-sm">—</span>
          )}
        </div>
        <Stat label="Stage" value={point?.stage ?? "—"} />
        <Stat
          label="TCV"
          value={point?.tcv != null ? formatCurrency(point.tcv, "USD") : "—"}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Not enough history yet to chart a trend.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="font-mono text-sm font-semibold">{value}</p>
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-2 flex items-center justify-center gap-5 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span
          className="h-0.5 w-4 rounded-full"
          style={{ backgroundColor: "hsl(var(--chart-1))" }}
        />
        Score
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className="h-0 w-4 border-t-2 border-dashed"
          style={{ borderColor: "hsl(var(--chart-3))" }}
        />
        Gate %
      </span>
    </div>
  );
}

// ---- Main --------------------------------------------------------------------
export function DealTrajectory({ dealId }: { dealId: string }) {
  const { data, isLoading, isError } = useGetDealTrajectory(dealId);

  if (isLoading) {
    return (
      <Shell>
        <Skeleton className="h-[280px] w-full" />
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
  const stageChanges = traj.stageChanges ?? [];

  // Sparse data: 0 or 1 points → summary card, not an empty chart.
  if (points.length <= 1) {
    return (
      <Shell>
        <SparseSummary point={points[points.length - 1]} />
      </Shell>
    );
  }

  const rows: ChartRow[] = points.map((p) => ({ ...p, t: Date.parse(p.at) }));
  const segments = healthSegments(rows);

  return (
    <Shell>
      <ChartContainer config={chartConfig} className="h-[280px] w-full">
        <ComposedChart data={rows} margin={{ left: 4, right: 12, top: 28, bottom: 0 }}>
          {/* Health background tints */}
          {segments.map((s, i) => (
            <ReferenceArea
              key={`h-${i}`}
              x1={s.x1}
              x2={s.x2}
              fill={HEALTH_FILL[s.health]}
              fillOpacity={0.08}
              stroke="none"
              ifOverflow="extendDomain"
            />
          ))}

          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={fmtTick}
            tickLine={false}
            axisLine={false}
            fontSize={11}
          />
          <YAxis
            domain={[0, 100]}
            width={32}
            tickLine={false}
            axisLine={false}
            fontSize={11}
          />

          <ChartTooltip content={<TrajectoryTooltip />} />

          {/* Stage-change vertical markers */}
          {stageChanges.map((sc, i) => {
            const x = Date.parse(sc.at);
            if (Number.isNaN(x)) return null;
            return (
              <ReferenceLine
                key={`sc-${i}`}
                x={x}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 3"
                strokeOpacity={0.5}
                label={{
                  value: sc.to ?? "",
                  position: "top",
                  fontSize: 10,
                  fill: "hsl(var(--muted-foreground))",
                  angle: -30,
                  offset: 8,
                }}
              />
            );
          })}

          {/* Gate % — muted dashed area (secondary) */}
          <Area
            dataKey="gatePct"
            type="monotone"
            stroke="hsl(var(--chart-3))"
            strokeDasharray="5 4"
            strokeWidth={1.5}
            fill="hsl(var(--chart-3))"
            fillOpacity={0.06}
            connectNulls
            isAnimationActive={false}
            dot={false}
          />

          {/* Score — primary prominent line */}
          <Line
            dataKey="score"
            type="monotone"
            stroke="hsl(var(--chart-1))"
            strokeWidth={2.5}
            connectNulls
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ChartContainer>
      <Legend />
    </Shell>
  );
}
