import { Pie, PieChart, Cell, Label } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const config: ChartConfig = {
  GREEN: { label: "Green", color: "hsl(var(--chart-2))" },
  YELLOW: { label: "Yellow", color: "hsl(38 92% 50%)" },
  RED: { label: "Red", color: "hsl(var(--destructive))" },
};

const FILL: Record<string, string> = {
  GREEN: "hsl(var(--chart-2))",
  YELLOW: "hsl(38 92% 50%)",
  RED: "hsl(var(--destructive))",
};

// Donut (not pie) so the hole can carry the portfolio total in the centre.
export function HealthDonut({
  green,
  yellow,
  red,
}: {
  green: number;
  yellow: number;
  red: number;
}) {
  const total = green + yellow + red;
  const data = [
    { key: "GREEN", value: green },
    { key: "YELLOW", value: yellow },
    { key: "RED", value: red },
  ].filter((d) => d.value > 0);

  return (
    <ChartContainer config={config} className="mx-auto aspect-square w-full max-w-[180px]">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Pie data={data} dataKey="value" nameKey="key" innerRadius={55} strokeWidth={2}>
          {data.map((d) => (
            <Cell key={d.key} fill={FILL[d.key]} />
          ))}
          <Label
            content={({ viewBox }) => {
              if (!viewBox || !("cx" in viewBox)) return null;
              return (
                <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-bold">
                    {total}
                  </tspan>
                  <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 18} className="fill-muted-foreground text-xs">
                    deals
                  </tspan>
                </text>
              );
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}
