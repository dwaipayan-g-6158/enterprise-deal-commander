import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { toFanSeries, type Forecast } from "./transforms";
import { compactCurrency } from "@/components/dashboard/widgets/_shared";

const config: ChartConfig = {
  mid: { label: "Forecast", color: "hsl(var(--chart-1))" },
};

export function ForecastFan({ forecast }: { forecast: Forecast }) {
  // toFanSeries's lo/hi (the p10 floor / p90 ceiling, constant across every
  // point) were computed but never rendered — `band` is the stacked delta
  // that turns them into a visible shaded range behind the mid line, via
  // the standard recharts "invisible base + visible delta" stacking trick
  // (an invisible Area from 0-lo, then a visible one from lo-hi).
  const data = toFanSeries(forecast).map((d) => ({ ...d, band: d.hi - d.lo }));
  return (
    <ChartContainer config={config} className="aspect-[16/7] w-full">
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="k" tickLine={false} axisLine={false} />
        <YAxis tickFormatter={(v: number) => compactCurrency(v)} width={48} tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area dataKey="lo" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} />
        <Area
          dataKey="band"
          stackId="band"
          stroke="none"
          fill="hsl(var(--chart-1))"
          fillOpacity={0.06}
          isAnimationActive={false}
        />
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
