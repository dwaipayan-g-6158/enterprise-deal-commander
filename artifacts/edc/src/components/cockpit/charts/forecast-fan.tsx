import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { toFanSeries, type Forecast } from "./transforms";

const config: ChartConfig = {
  mid: { label: "Forecast", color: "hsl(var(--chart-1))" },
};

const fmt = (n: number) => "$" + Math.round(n / 1000) + "k";

export function ForecastFan({ forecast }: { forecast: Forecast }) {
  const data = toFanSeries(forecast);
  return (
    <ChartContainer config={config} className="aspect-[16/7] w-full">
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="k" tickLine={false} axisLine={false} />
        <YAxis tickFormatter={fmt} width={48} tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          dataKey="mid"
          type="monotone"
          stroke="hsl(var(--chart-1))"
          fill="hsl(var(--chart-1))"
          fillOpacity={0.18}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
