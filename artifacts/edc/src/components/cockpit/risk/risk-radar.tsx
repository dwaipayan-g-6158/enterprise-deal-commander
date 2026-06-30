import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { RiskDimension, RiskLevel } from "./risk-model";
import { radarData } from "./risk-presentation";

const LEVEL_COLOR: Record<RiskLevel, string> = {
  HIGH:     "hsl(var(--destructive))",
  ELEVATED: "hsl(25 95% 53%)",
  MODERATE: "hsl(38 92% 50%)",
  LOW:      "hsl(142 71% 45%)",
};

function buildConfig(level: RiskLevel): ChartConfig {
  return {
    score: { label: "Risk score", color: LEVEL_COLOR[level] },
  };
}

// Score → HSL color matching RISK_LEVEL_CLASS thresholds.
function scoreColor(score: number): string {
  if (score > 75) return "hsl(0 72% 51%)";
  if (score > 50) return "hsl(25 95% 53%)";
  if (score > 25) return "hsl(38 92% 50%)";
  return "hsl(142 71% 45%)";
}

export function RiskRadar({
  dimensions,
  level,
}: {
  dimensions: RiskDimension[];
  level: RiskLevel;
}) {
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  const allZero = dimensions.every((d) => d.score === 0);
  if (!dimensions.length || allZero) {
    return (
      <p className="text-sm text-muted-foreground">
        Insufficient data to chart risk dimensions.
      </p>
    );
  }

  const data = radarData(dimensions);
  const color = LEVEL_COLOR[level];
  const config = buildConfig(level);

  const highest = data.reduce((acc, cur) => (cur.score > acc.score ? cur : acc), data[0]);
  const ariaLabel = `Risk radar: highest dimension ${highest.full} at ${highest.score}`;

  // Custom SVG tick: abbreviated name on first line, colored score on second.
  // Recharts positions ticks just outside the polar grid boundary — we offset
  // name/score outward from center so both lines read naturally.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderAxisTick = (props: any) => {
    const { x, y, cx, cy, payload } = props as {
      x: number; y: number; cx: number; cy: number;
      payload: { value: string };
    };
    const point = data.find((d) => d.axis === payload.value);
    const score = point?.score ?? 0;

    const dx = x - cx;
    const dyPos = y - cy;
    const textAnchor = dx < -8 ? "end" : dx > 8 ? "start" : "middle";

    // For labels above center: push score further up (outward).
    // For labels at or below center: push score further down (outward).
    const isAbove = dyPos < -8;
    const nameY = isAbove ? y - 2 : y + 4;
    const scoreY = isAbove ? y - 16 : y + 17;

    return (
      <g>
        <text
          x={x}
          y={nameY}
          textAnchor={textAnchor}
          fontSize={11}
          fontWeight={500}
          fill="hsl(var(--foreground))"
        >
          {payload.value}
        </text>
        <text
          x={x}
          y={scoreY}
          textAnchor={textAnchor}
          fontSize={11}
          fontWeight={700}
          fontFamily="ui-monospace,SFMono-Regular,Menlo,monospace"
          fill={scoreColor(score)}
        >
          {score}
        </text>
      </g>
    );
  };

  return (
    <div className="relative">
      <div role="img" aria-label={ariaLabel}>
        <ChartContainer
          config={config}
          className="mx-auto w-full aspect-square max-w-[320px]"
        >
          <RadarChart data={data} margin={{ top: 36, right: 72, bottom: 36, left: 72 }}>
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  formatter={(value, _name, item) => (
                    <span>
                      {item.payload?.full ?? item.payload?.axis}: {value}
                    </span>
                  )}
                  hideLabel
                />
              }
            />
            <PolarGrid gridType="polygon" />
            <PolarAngleAxis dataKey="axis" tick={renderAxisTick} />
            <PolarRadiusAxis
              domain={[0, 100]}
              tick={false}
              axisLine={false}
              tickCount={4}
            />
            <Radar
              dataKey="score"
              stroke={color}
              strokeWidth={2}
              fill={color}
              fillOpacity={0.22}
              dot={{ r: 4, fill: color, strokeWidth: 2, stroke: "hsl(var(--background))", fillOpacity: 0.9 }}
              isAnimationActive={!prefersReducedMotion}
            />
          </RadarChart>
        </ChartContainer>
      </div>

      <table className="sr-only">
        <caption>Risk by dimension</caption>
        <thead>
          <tr>
            <th scope="col">Dimension</th>
            <th scope="col">Score</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.full}>
              <td>{row.full}</td>
              <td>{row.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
