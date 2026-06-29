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

// Concrete hsl color strings per level — mirrors the tokens used in health-donut.tsx.
// recharts sets fill/stroke as SVG attributes and needs concrete values (not Tailwind classes).
const LEVEL_COLOR: Record<RiskLevel, string> = {
  HIGH:     "hsl(var(--destructive))",
  ELEVATED: "hsl(38 92% 50%)",
  MODERATE: "hsl(38 92% 50%)",  // amber — same token as health-donut YELLOW
  LOW:      "hsl(142 71% 45%)", // emerald-500 equivalent
};

// ChartConfig keyed by level so ChartStyle injects the CSS var.
function buildConfig(level: RiskLevel): ChartConfig {
  return {
    score: { label: "Risk score", color: LEVEL_COLOR[level] },
  };
}

export function RiskRadar({
  dimensions,
  level,
}: {
  dimensions: RiskDimension[];
  level: RiskLevel;
}) {
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  // Degraded state: no data or all zeros.
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

  // Derive aria-label from the highest-scoring dimension.
  const highest = data.reduce((acc, cur) => (cur.score > acc.score ? cur : acc), data[0]);
  const ariaLabel = `Risk radar: highest dimension ${highest.full} at ${highest.score}`;

  return (
    <div className="relative">
      {/* role="img" on the wrapper so screen readers treat the SVG chart as an image */}
      <div role="img" aria-label={ariaLabel}>
        <ChartContainer
          config={config}
          className="mx-auto w-full aspect-square max-w-[280px]"
        >
          <RadarChart data={data} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <ChartTooltip
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
            <PolarGrid />
            <PolarAngleAxis
              dataKey="axis"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            />
            <PolarRadiusAxis
              domain={[0, 100]}
              tick={false}
              axisLine={false}
              tickCount={4}
            />
            <Radar
              dataKey="score"
              stroke={color}
              fill={color}
              fillOpacity={0.3}
              isAnimationActive={!prefersReducedMotion}
            />
          </RadarChart>
        </ChartContainer>
      </div>

      {/* sr-only table: accessible fallback listing every dimension + score */}
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
